'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../renderer/logic.js');

const step = (text, done, doneAt) => ({
  id: L.uid(),
  text,
  done: !!done,
  doneAt: done ? doneAt || null : null,
  description: '',
  entries: []
});
const goal = (title, steps, done) => ({
  id: L.uid(),
  title,
  description: '',
  done: !!done,
  steps: steps || [],
  entries: [],
  createdAt: '2020-01-01T12:00:00.000Z',
  completedAt: null,
  completedAtManual: false
});
const cat = (name, goals) => ({ id: L.uid(), name, icon: '🎯', color: '#4f7cff', goals: goals || [] });

// ---------- Fortschritt ----------

test('Fortschritt eines Ziels ohne Schritte: 0 oder 100', () => {
  assert.equal(L.goalProgress(goal('A')), 0);
  assert.equal(L.goalProgress(goal('A', [], true)), 100);
});

test('Fortschritt eines Ziels mit Schritten (Beispiel Japan)', () => {
  const steps = [step('a'), step('b'), step('c')];
  assert.equal(L.goalProgress(goal('Japan', steps)), 0);
  steps[0].done = true;
  assert.equal(L.goalProgress(goal('Japan', steps)), 33);
  steps[1].done = true;
  assert.equal(L.goalProgress(goal('Japan', steps)), 67);
  steps[2].done = true;
  assert.equal(L.goalProgress(goal('Japan', steps)), 100);
});

test('Nie auf 100 % aufrunden, solange ein Schritt fehlt', () => {
  const steps = Array.from({ length: 200 }, (_, i) => step('s' + i, i < 199));
  assert.equal(L.goalProgress(goal('Groß', steps)), 99);
});

test('Kategorie-Statistik', () => {
  assert.deepEqual(L.categoryStats(cat('Leer')), { total: 0, completed: 0, percent: 0 });
  const c = cat('K', [goal('a', [], true), goal('b', [step('x', true), step('y')]), goal('c')]);
  const st = L.categoryStats(c);
  assert.equal(st.total, 3);
  assert.equal(st.completed, 1);
  assert.equal(st.percent, 50); // (100 + 50 + 0) / 3
  assert.equal(L.categoryStats(cat('Fertig', [goal('a', [], true)])).percent, 100);
});

test('Gesamt-Statistik über alle Kategorien', () => {
  const data = { categories: [cat('A', [goal('x', [], true)]), cat('B', [goal('y'), goal('z')])] };
  assert.deepEqual(L.overallStats(data), { total: 3, completed: 1, percent: 33 });
  assert.deepEqual(L.overallStats({ categories: [] }), { total: 0, completed: 0, percent: 0 });
});

// ---------- Abhaken, Datum, Verlauf ----------

test('refreshGoal hält done und completedAt konsistent', () => {
  const g = goal('G', [step('a', true), step('b')]);
  L.refreshGoal(g);
  assert.equal(g.done, false);
  assert.equal(g.completedAt, null);
  g.steps[1].done = true;
  g.steps[1].doneAt = new Date().toISOString();
  L.refreshGoal(g);
  assert.equal(g.done, true);
  assert.ok(g.completedAt);
  g.steps[0].done = false;
  L.refreshGoal(g);
  assert.equal(g.done, false);
  assert.equal(g.completedAt, null);
});

test('setStepDone merkt sich den Zeitpunkt und löscht ihn beim Zurücknehmen', () => {
  const g = goal('G', [step('a'), step('b')]);
  L.setStepDone(g, g.steps[0], true);
  assert.equal(g.steps[0].done, true);
  assert.ok(g.steps[0].doneAt);
  const first = g.steps[0].doneAt;
  L.setStepDone(g, g.steps[0], true); // nochmal abhaken ändert das Datum nicht
  assert.equal(g.steps[0].doneAt, first);
  L.setStepDone(g, g.steps[0], false);
  assert.equal(g.steps[0].doneAt, null);
  assert.equal(g.steps[0].done, false);
});

test('Erreicht-Datum eines Ziels mit Schritten = Datum des zuletzt erledigten Schritts', () => {
  const g = goal('G', [step('a'), step('b')]);
  L.setStepDone(g, g.steps[0], true);
  L.setStepDone(g, g.steps[1], true);
  g.steps[0].doneAt = '2026-01-10T12:00:00.000Z';
  g.steps[1].doneAt = '2026-03-05T12:00:00.000Z';
  L.refreshGoal(g);
  assert.equal(g.completedAt, '2026-03-05T12:00:00.000Z');
});

test('setGoalDone für Ziele ohne Schritte', () => {
  const g = goal('G');
  L.setGoalDone(g, true);
  assert.equal(g.done, true);
  assert.ok(g.completedAt);
  L.setGoalDone(g, false);
  assert.equal(g.done, false);
  assert.equal(g.completedAt, null);
});

test('Datumsfeld: Umrechnung in beide Richtungen', () => {
  const iso = L.isoFromDateInput('2026-03-05', null);
  assert.equal(L.dateInputValue(iso), '2026-03-05');
  assert.equal(new Date(iso).getHours(), 12);
  // Uhrzeit des bisherigen Werts bleibt erhalten
  const base = new Date(2026, 0, 1, 8, 30, 0).toISOString();
  const moved = new Date(L.isoFromDateInput('2026-03-05', base));
  assert.equal(moved.getHours(), 8);
  assert.equal(moved.getMinutes(), 30);
  assert.equal(L.isoFromDateInput('kaputt', null), null);
  assert.equal(L.isoFromDateInput('', null), null);
  assert.equal(L.dateInputValue('kaputt'), '');
});

test('Verlauf: erreichte Ziele, erledigte Schritte und Notizen, neueste zuerst', () => {
  const s1 = step('Flug', true, '2026-01-10T12:00:00.000Z');
  const s2 = step('Hotel', true, '2026-02-01T12:00:00.000Z');
  const s3 = step('Tokio'); // offen: kein Ereignis
  s2.entries = [{ id: 'e1', text: 'Tolles Zimmer', at: '2026-02-02T12:00:00.000Z' }];
  const g = goal('Japan', [s1, s2, s3]);
  g.entries = [{ id: 'e2', text: 'Reise geplant', at: '2025-12-24T12:00:00.000Z' }];
  const done = goal('Kurs', [], true);
  done.completedAt = '2026-02-15T12:00:00.000Z';
  const data = { categories: [cat('Bucketliste', [g, done])] };

  const ev = L.buildHistory(data);
  assert.deepEqual(
    ev.map((e) => e.type + ':' + (e.stepText || e.goalTitle)),
    ['reached:Kurs', 'entry:Hotel', 'step:Hotel', 'step:Flug', 'entry:Japan', 'created:Japan', 'created:Kurs']
  );
  assert.equal(ev[1].text, 'Tolles Zimmer');
  assert.equal(ev[2].categoryName, 'Bucketliste');
  assert.equal(ev[2].goalTitle, 'Japan');
});

test('Verlauf: Ziel steht bei gleichem Zeitpunkt vor seinem letzten Schritt', () => {
  const g = goal('G', [step('a'), step('b')]);
  L.setStepDone(g, g.steps[0], true);
  L.setStepDone(g, g.steps[1], true);
  const t = '2026-05-05T12:00:00.000Z';
  g.steps[0].doneAt = t;
  g.steps[1].doneAt = t;
  L.refreshGoal(g);
  const ev = L.buildHistory({ categories: [cat('K', [g])] });
  assert.deepEqual(ev.map((e) => e.type), ['reached', 'step', 'step', 'created']);
});

test('Verlauf: Schritte ohne Datum (alte Daten) tauchen nicht auf', () => {
  const g = goal('G', [step('alt', true, null)]);
  assert.equal(L.buildHistory({ categories: [cat('K', [g])] }).filter((e) => e.type === 'step').length, 0);
});

// ---------- Reihenfolge, Farben, Sprache ----------

test('moveItem verschiebt und respektiert die Grenzen', () => {
  const a = [1, 2, 3];
  assert.equal(L.moveItem(a, 0, -1), false);
  assert.equal(L.moveItem(a, 2, 1), false);
  assert.equal(L.moveItem(a, 0, 1), true);
  assert.deepEqual(a, [2, 1, 3]);
});

test('readableTextColor wählt lesbare Schriftfarbe', () => {
  assert.equal(L.readableTextColor('#ffffff'), '#14161b');
  assert.equal(L.readableTextColor('#000000'), '#ffffff');
  assert.equal(L.readableTextColor('kaputt'), '#ffffff');
});

test('Sprache: Systemsprache wird erkannt, alles Unbekannte wird Englisch', () => {
  assert.equal(L.resolveLanguage('auto', 'de'), 'de');
  assert.equal(L.resolveLanguage('auto', 'de-DE'), 'de');
  assert.equal(L.resolveLanguage('auto', 'de_AT'), 'de');
  assert.equal(L.resolveLanguage('auto', 'en-US'), 'en');
  assert.equal(L.resolveLanguage('auto', 'fr-FR'), 'en');
  assert.equal(L.resolveLanguage('auto', 'ja'), 'en');
  assert.equal(L.resolveLanguage('auto', ''), 'en');
  assert.equal(L.resolveLanguage('auto', undefined), 'en');
  assert.equal(L.resolveLanguage('de', 'en-US'), 'de'); // manuelle Wahl gewinnt
  assert.equal(L.resolveLanguage('en', 'de-DE'), 'en');
  assert.equal(L.resolveLanguage('klingonisch', 'de'), 'de'); // ungültige Einstellung = auto
});

// ---------- Bereinigen / Migration ----------

test('normalizeData füllt Standardwerte und verwirft Unbrauchbares', () => {
  const data = L.normalizeData({
    version: 2,
    settings: { theme: 'neon', accent: 'rot', fontScale: 9, radius: -4, density: 'compact', language: 'xx', listName: '  Träume ' },
    categories: [
      {
        name: '  Bucketliste ',
        icon: '',
        color: 'blau',
        goals: [{ title: 'Japan', steps: [{ text: 'ok' }, { text: '   ' }, null, { text: 'zwei', done: true }] }, null]
      }
    ]
  });
  assert.equal(data.settings.theme, 'system');
  assert.equal(data.settings.accent, L.DEFAULT_SETTINGS.accent);
  assert.equal(data.settings.fontScale, 1.4);
  assert.equal(data.settings.radius, 0);
  assert.equal(data.settings.density, 'compact');
  assert.equal(data.settings.language, 'auto');
  assert.equal(data.settings.listName, 'Träume');
  const c = data.categories[0];
  assert.equal(c.name, 'Bucketliste');
  assert.equal(c.icon, ''); // kein Symbol bleibt leer (wird als Punkt gezeigt)
  assert.equal(c.goals.length, 2);
  assert.equal(c.goals[0].steps.length, 2);
  assert.deepEqual(c.goals[0].steps[0].entries, []);
  assert.equal(c.goals[0].steps[0].description, '');
  assert.equal(c.goals[1].title, '—');
  assert.ok(c.id && c.goals[0].id);
});

test('Migration von Version 1: Ordner-Symbol wird zum Punkt, "note" wird zur Beschreibung', () => {
  const data = L.normalizeData({
    version: 1,
    categories: [
      { id: 'a', name: 'Ohne Symbol', icon: '📁', goals: [{ id: 'g', title: 'Ziel', note: 'Meine Notiz', steps: [{ text: 's', done: true }] }] },
      { id: 'b', name: 'Mit Symbol', icon: '✈️', goals: [] }
    ]
  });
  assert.equal(data.version, 3);
  assert.equal(data.categories[0].icon, '');
  assert.equal(data.categories[1].icon, '✈️');
  assert.equal(data.categories[0].goals[0].description, 'Meine Notiz');
  assert.equal(data.categories[0].goals[0].steps[0].doneAt, null);
  assert.deepEqual(data.categories[0].goals[0].entries, []);
});

test('Version 2: bewusst gewähltes Ordner-Symbol bleibt', () => {
  const data = L.normalizeData({ version: 2, categories: [{ name: 'X', icon: '📁' }] });
  assert.equal(data.categories[0].icon, '📁');
});

test('normalizeData macht doppelte IDs eindeutig', () => {
  const data = L.normalizeData({
    categories: [
      { id: 'x', name: 'A', goals: [{ id: 'g', title: '1' }] },
      { id: 'x', name: 'B', goals: [{ id: 'g', title: '2' }] }
    ]
  });
  const ids = [data.categories[0].id, data.categories[1].id, data.categories[0].goals[0].id, data.categories[1].goals[0].id];
  assert.equal(new Set(ids).size, 4);
});

test('normalizeData lehnt ungültige und zu neue Daten mit Fehlercode ab', () => {
  const code = (fn) => {
    try {
      fn();
    } catch (e) {
      return e.code;
    }
    return null;
  };
  assert.equal(code(() => L.normalizeData(null)), 'invalid_data');
  assert.equal(code(() => L.normalizeData([])), 'invalid_data');
  assert.equal(code(() => L.normalizeData({})), 'no_categories');
  assert.equal(code(() => L.normalizeData({ version: 999, categories: [] })), 'newer_version');
});

test('Notizen: leere werden verworfen, Datum und ID ergänzt, Beschreibung bleibt', () => {
  const data = L.normalizeData({
    version: 2,
    categories: [
      {
        name: 'K',
        goals: [
          {
            title: 'G',
            description: ' Zielbeschreibung ',
            entries: [{ text: 'Tag 1', at: '2026-01-01T10:00:00.000Z' }, { text: '  ' }, { text: 'Ohne Datum' }],
            steps: [{ text: 'S', done: true, doneAt: '2026-01-02T10:00:00.000Z', description: 'Genau so', entries: [{ text: 'Erinnerung' }] }]
          }
        ]
      }
    ]
  });
  const g = data.categories[0].goals[0];
  assert.equal(g.description, 'Zielbeschreibung');
  assert.equal(g.entries.length, 2);
  assert.ok(g.entries[1].id && g.entries[1].at);
  assert.equal(g.steps[0].doneAt, '2026-01-02T10:00:00.000Z');
  assert.equal(g.steps[0].description, 'Genau so');
  assert.equal(g.steps[0].entries[0].text, 'Erinnerung');
});

test('Nicht erledigte Schritte behalten kein Erledigt-Datum', () => {
  const data = L.normalizeData({
    categories: [{ name: 'K', goals: [{ title: 'G', steps: [{ text: 'S', done: false, doneAt: '2026-01-02T10:00:00.000Z' }] }] }]
  });
  assert.equal(data.categories[0].goals[0].steps[0].doneAt, null);
});

test('Symbol: immer nur ein Zeichen, Emoji bleiben ganz', () => {
  const data = L.normalizeData({ categories: [{ name: 'X', icon: '🎯'.repeat(12) }] });
  assert.equal(data.categories[0].icon, '🎯');
  assert.equal(L.firstGrapheme('✈️x'), '✈️');
  assert.equal(L.firstGrapheme('👨‍👩‍👧'), '👨‍👩‍👧');
  assert.equal(L.firstGrapheme('🇩🇪🇫🇷'), '🇩🇪');
  assert.equal(L.firstGrapheme('  '), '');
  assert.equal(L.singleIconFromInput('A', 'AB'), 'B'); // neu getipptes ersetzt das alte
  assert.equal(L.singleIconFromInput('A', 'BA'), 'B');
  assert.equal(L.singleIconFromInput('', 'ABC'), 'A'); // Einfügen: erstes Zeichen
  assert.equal(L.singleIconFromInput('A', ''), '');
  const short = L.normalizeData({ categories: [{ name: 'X', icon: '🏝️' }] });
  assert.equal(short.categories[0].icon, '🏝️');
});

// ---------- Export / Import ----------

test('Export und Import: Rundlauf bleibt identisch (beide Sprachen)', () => {
  for (const lang of ['de', 'en']) {
    const original = L.createExampleData(lang);
    const file = JSON.stringify(L.createExport(original));
    const back = L.parseImport(file);
    assert.deepEqual(back, L.normalizeData(original));
    assert.deepEqual(L.normalizeData(back), back);
  }
});

test('Import: BOM, rohe Daten, Fremddateien und Müll', () => {
  const data = L.createExampleData('en');
  const exported = JSON.stringify(L.createExport(data));
  const code = (fn) => {
    try {
      fn();
    } catch (e) {
      return e.code;
    }
    return null;
  };
  assert.equal(L.parseImport('﻿' + exported).categories.length, 2);
  assert.equal(L.parseImport(JSON.stringify(data)).categories.length, 2);
  assert.equal(code(() => L.parseImport('das ist kein json')), 'unreadable');
  assert.equal(code(() => L.parseImport('{"app":"andere-app","data":{}}')), 'foreign_file');
  assert.equal(code(() => L.parseImport('{"hallo":1}')), 'foreign_file');
  assert.equal(code(() => L.parseImport('42')), 'foreign_file');
});

test('Import: Exportdateien der Vorgänger-App "zielbuch" werden weiterhin gelesen', () => {
  const file = JSON.stringify({
    app: 'zielbuch',
    version: 1,
    data: { version: 1, categories: [{ id: 'c', name: 'Bucketliste', icon: '📁', goals: [{ id: 'g', title: 'Japan', note: 'x', steps: [{ id: 's', text: 'Flug', done: true }] }] }] }
  });
  const data = L.parseImport(file);
  assert.equal(data.version, 3);
  assert.equal(data.categories[0].icon, '');
  assert.equal(data.categories[0].goals[0].description, 'x');
  assert.equal(L.createExport(data).app, 'gotrack');
});

test('Beispieldaten: gültig, zeigen Fortschritt, Verlauf und Notizen (beide Sprachen)', () => {
  const de = L.createExampleData('de');
  const en = L.createExampleData('en');
  assert.equal(de.categories[0].goals[0].title, 'Japan bereisen');
  assert.equal(en.categories[0].goals[0].title, 'Travel to Japan');
  assert.equal(L.createExampleData('fr').categories[0].name, 'Bucket list'); // unbekannt = Englisch
  for (const ex of [de, en]) {
    const japan = ex.categories[0].goals[0];
    assert.equal(L.goalProgress(japan), 50);
    assert.equal(L.countGoals(ex), 5);
    const hist = L.buildHistory(ex);
    assert.ok(hist.some((e) => e.type === 'reached'), 'ein erreichtes Ziel im Verlauf');
    assert.ok(hist.some((e) => e.type === 'created'));
    assert.ok(hist.some((e) => e.type === 'step'));
    assert.ok(hist.some((e) => e.type === 'entry'));
    assert.deepEqual(L.normalizeData(ex).categories.map((c) => c.goals.length), [3, 2]);
  }
});

// ---------- Zusammenführen ----------

test('Zusammenführen: neue Kategorien und Ziele werden ergänzt, Einstellungen bleiben', () => {
  const current = L.createExampleData('de');
  current.settings.accent = '#e0457b';
  const incoming = L.normalizeData({
    settings: { accent: '#000000' },
    categories: [
      { id: 'neu', name: 'Karriere', goals: [{ title: 'Beförderung' }, { title: 'Weiterbildung' }] },
      { name: 'bucketliste', goals: [{ title: 'Skydiving' }] }
    ]
  });
  const r = L.mergeData(current, incoming);
  assert.equal(r.data.settings.accent, '#e0457b');
  assert.equal(r.added.categories, 1);
  assert.equal(r.added.goals, 3);
  assert.equal(r.data.categories.length, 3);
  assert.equal(r.data.categories[0].goals.length, 4); // Skydiving in vorhandene Bucketliste (Name-Treffer)
  assert.equal(current.categories.length, 2); // Original unverändert
});

test('Zusammenführen: gleiche Ziele ergänzen Schritte, Notizen und Daten; erledigt bleibt erledigt', () => {
  const current = L.normalizeData({
    categories: [{ id: 'c', name: 'K', goals: [{ id: 'g', title: 'Japan', steps: [{ id: 's1', text: 'Flug', done: false }] }] }]
  });
  const incoming = L.normalizeData({
    categories: [
      {
        id: 'c',
        name: 'K',
        goals: [
          {
            id: 'g',
            title: 'Japan',
            description: 'Frühling!',
            entries: [{ id: 'ge', text: 'Reise geplant', at: '2026-01-01T10:00:00.000Z' }],
            steps: [
              {
                id: 's1',
                text: 'Flug',
                done: true,
                doneAt: '2026-01-05T10:00:00.000Z',
                description: 'Direktflug',
                entries: [{ id: 'se', text: 'Guter Preis', at: '2026-01-05T11:00:00.000Z' }]
              },
              { id: 's2', text: 'Hotel', done: false }
            ]
          }
        ]
      }
    ]
  });
  const r = L.mergeData(current, incoming);
  const g = r.data.categories[0].goals[0];
  assert.equal(r.updated.goals, 1);
  assert.equal(g.steps.length, 2);
  assert.equal(g.steps[0].done, true);
  assert.equal(g.steps[0].doneAt, '2026-01-05T10:00:00.000Z');
  assert.equal(g.steps[0].description, 'Direktflug');
  assert.equal(g.steps[0].entries.length, 1);
  assert.equal(g.entries.length, 1);
  assert.equal(g.description, 'Frühling!');
  assert.equal(L.goalProgress(g), 50);
  // Zweiter Durchlauf ändert nichts mehr (keine doppelten Notizen)
  const again = L.mergeData(r.data, incoming);
  assert.equal(again.updated.goals, 0);
  assert.equal(again.added.goals, 0);
  assert.equal(again.data.categories[0].goals[0].entries.length, 1);
  assert.equal(again.data.categories[0].goals[0].steps[0].entries.length, 1);
});

test('Zusammenführen: ID-Kollisionen über Kategorien hinweg werden aufgelöst', () => {
  const current = L.normalizeData({ categories: [{ id: 'a', name: 'A', goals: [{ id: 'g1', title: 'x' }] }] });
  const incoming = L.normalizeData({ categories: [{ id: 'b', name: 'B', goals: [{ id: 'g1', title: 'y' }] }] });
  const r = L.mergeData(current, incoming);
  const ids = r.data.categories.flatMap((c) => c.goals.map((g) => g.id));
  assert.equal(new Set(ids).size, 2);
});

// ---------- Erstellt-/Erreicht-Datum, Listen ----------

test('Erreicht-Datum lässt sich ändern und bleibt erhalten, solange das Ziel erreicht ist', () => {
  const g = goal('G', [], false);
  L.setGoalDone(g, true);
  assert.ok(g.completedAt);
  assert.equal(L.setGoalReachedDate(g, '2025-03-03T12:00:00.000Z'), true);
  assert.equal(g.completedAt, '2025-03-03T12:00:00.000Z');
  L.refreshGoal(g);
  assert.equal(g.completedAt, '2025-03-03T12:00:00.000Z');
  const again = L.normalizeData({ categories: [cat('K', [g])] }).categories[0].goals[0];
  assert.equal(again.completedAt, '2025-03-03T12:00:00.000Z');
  L.setGoalDone(g, false);
  assert.equal(g.completedAt, null);
  assert.equal(g.completedAtManual, false);
  assert.equal(L.setGoalReachedDate(g, '2025-03-03T12:00:00.000Z'), false); // nicht erreicht: kein Datum
});

test('Erreicht-Datum eines Ziels mit Schritten ist änderbar', () => {
  const g = goal('G', [step('a'), step('b')]);
  L.setStepDone(g, g.steps[0], true);
  L.setStepDone(g, g.steps[1], true);
  L.setGoalReachedDate(g, '2024-01-02T12:00:00.000Z');
  assert.equal(g.completedAt, '2024-01-02T12:00:00.000Z');
});

test('Erstellt-Datum ändern; Verlauf zeigt Erstellen immer', () => {
  const g = goal('G');
  assert.equal(L.setGoalCreatedDate(g, '2023-05-05T12:00:00.000Z'), true);
  assert.equal(L.setGoalCreatedDate(g, 'kaputt'), false);
  const ev = L.buildHistory({ categories: [cat('K', [g])] });
  assert.deepEqual(ev.map((e) => e.type), ['created']);
  assert.equal(ev[0].at, '2023-05-05T12:00:00.000Z');
});

test('Listen: Ziele in Arbeit und erreichte Ziele', () => {
  const a = goal('offen');
  const b = goal('halb', [step('x', true, '2026-01-01T12:00:00.000Z'), step('y')]);
  const c = goal('fertig', [], true);
  c.completedAt = '2026-02-01T12:00:00.000Z';
  const d = goal('fertig2', [], true);
  d.completedAt = '2026-03-01T12:00:00.000Z';
  const data = { categories: [cat('K1', [a, b]), cat('K2', [c, d]), cat('Leer')] };
  const open = L.openGoalGroups(data);
  assert.equal(open.length, 1);
  assert.deepEqual(open[0].items.map((i) => i.goal.title + ':' + i.progress), ['offen:0', 'halb:50']);
  assert.deepEqual(L.achievedGoals(data).map((i) => i.goal.title), ['fertig2', 'fertig']);
});

test('Alte Daten (Version 2) werden zu Version 3 migriert', () => {
  const data = L.normalizeData({ version: 2, categories: [{ name: 'X', goals: [{ title: 'G', done: true, completedAt: '2025-01-01T12:00:00.000Z' }] }] });
  assert.equal(data.version, 3);
  assert.equal(data.categories[0].goals[0].completedAt, '2025-01-01T12:00:00.000Z');
});
