/*
 * GoTrack! – Kernlogik (ohne Oberfläche, ohne Electron).
 * Läuft im Browser/Electron (window.GoLogic) und in Node (require) – dadurch testbar.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GoLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APP_ID = 'gotrack';
  // Dateien aus der Vorgänger-Version ("Zielbuch") bleiben importierbar.
  const LEGACY_APP_IDS = ['zielbuch'];
  // Erhöhen, sobald sich das Dateiformat ändert. Ältere Dateien werden in normalizeData() migriert.
  //  1 = erste Version, 2 = Verlauf (doneAt), Notizen (entries), Beschreibungen, Listenname, Sprache
  //  3 = frei änderbares Erreicht-Datum eines Ziels (completedAtManual)
  const DATA_VERSION = 3;
  const LANGUAGES = ['de', 'en'];

  const DEFAULT_SETTINGS = Object.freeze({
    language: 'auto', // 'auto' | 'de' | 'en'
    listName: '', // leer = Standardname "GoTrack!"
    theme: 'system', // 'system' | 'light' | 'dark'
    accent: '#4f7cff',
    fontScale: 1,
    density: 'normal', // 'compact' | 'normal' | 'roomy'
    radius: 12
  });

  const DEFAULT_CATEGORY_COLOR = '#4f7cff';
  const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
  const PLACEHOLDER_TITLE = '—';

  // ---------- kleine Helfer ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fail(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function cleanString(value, max, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : fallback;
  }

  // ---------- Symbol: genau ein sichtbares Zeichen ----------

  const segmenter =
    typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;

  // Zerlegt Text in sichtbare Zeichen ("Graphem-Cluster"): Ein Emoji wie ✈️, 👨‍👩‍👧 oder 🇩🇪 besteht aus
  // mehreren Code-Punkten, ist für den Nutzer aber EIN Zeichen und darf nie zerschnitten werden.
  function graphemes(value) {
    const text = typeof value === 'string' ? value : '';
    const parts = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
    return parts.filter((p) => p.trim() !== '');
  }

  function firstGrapheme(value) {
    return graphemes(value)[0] || '';
  }

  // Für das Eingabefeld: Aus dem neuen Feldinhalt wird genau ein Zeichen. Wer zu einem vorhandenen Zeichen
  // etwas hinzufügt, ersetzt es (das neu getippte gewinnt); mehrere eingefügte Zeichen ergeben das erste.
  function singleIconFromInput(previous, next) {
    const parts = graphemes(next);
    if (parts.length <= 1) return parts[0] || '';
    return parts[0] === firstGrapheme(previous) ? parts[parts.length - 1] : parts[0];
  }

  function cleanIcon(value, fallback) {
    return firstGrapheme(value) || fallback;
  }

  function cleanDate(value) {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
    return null;
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function uniqueId(candidate, seen) {
    let id = typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 64) : uid();
    while (seen.has(id)) id = uid();
    seen.add(id);
    return id;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // ---------- Sprache ----------

  // 'auto' folgt der Systemsprache. Alles, was wir nicht übersetzt haben, bekommt Englisch.
  function resolveLanguage(setting, locale) {
    if (LANGUAGES.includes(setting)) return setting;
    const base = String(locale || '').toLowerCase().split(/[-_]/)[0];
    return LANGUAGES.includes(base) ? base : 'en';
  }

  // ---------- Datum (für <input type="date">) ----------

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // ISO-Zeitstempel -> "JJJJ-MM-TT" in lokaler Zeit
  function dateInputValue(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // "JJJJ-MM-TT" -> ISO-Zeitstempel. Die Uhrzeit des bisherigen Werts bleibt erhalten, sonst 12:00.
  function isoFromDateInput(value, baseIso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    const base = baseIso && !Number.isNaN(Date.parse(baseIso)) ? new Date(baseIso) : null;
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      base ? base.getHours() : 12,
      base ? base.getMinutes() : 0,
      base ? base.getSeconds() : 0
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // ---------- Fortschritt ----------

  // Unter 100 % wird nie auf 100 aufgerundet (199 von 200 Schritten = 99 %, nicht 100 %).
  function percentOf(done, total) {
    if (total <= 0) return 0;
    if (done >= total) return 100;
    return Math.min(99, Math.round((done / total) * 100));
  }

  // Ziel mit Schritten: Anteil erledigter Schritte. Ziel ohne Schritte: 0 % oder 100 % per Haken.
  function goalProgress(goal) {
    const steps = goal.steps || [];
    if (steps.length === 0) return goal.done ? 100 : 0;
    return percentOf(steps.filter((s) => s.done).length, steps.length);
  }

  function categoryStats(category) {
    const goals = category.goals || [];
    const progresses = goals.map(goalProgress);
    const completed = progresses.filter((p) => p === 100).length;
    const avg = progresses.length ? progresses.reduce((a, b) => a + b, 0) / progresses.length : 0;
    const percent = goals.length === 0 ? 0 : completed === goals.length ? 100 : Math.min(99, Math.round(avg));
    return { total: goals.length, completed, percent };
  }

  function overallStats(data) {
    const progresses = [];
    for (const cat of data.categories || []) {
      for (const goal of cat.goals || []) progresses.push(goalProgress(goal));
    }
    const completed = progresses.filter((p) => p === 100).length;
    const avg = progresses.length ? progresses.reduce((a, b) => a + b, 0) / progresses.length : 0;
    const percent =
      progresses.length === 0 ? 0 : completed === progresses.length ? 100 : Math.min(99, Math.round(avg));
    return { total: progresses.length, completed, percent };
  }

  // Nach jeder Änderung an Schritten/Haken aufrufen: hält done und completedAt konsistent.
  // Bei Zielen mit Schritten ist das Erreicht-Datum der Tag des zuletzt erledigten Schritts – es sei denn, der
  // Nutzer hat es selbst festgelegt (completedAtManual). Dieses Datum bleibt, solange das Ziel erreicht bleibt.
  // Wird das Ziel wieder geöffnet, verfällt es (ein erneutes Erreichen ist ein neues Ereignis).
  function refreshGoal(goal) {
    if (goal.steps.length > 0) {
      goal.done = goal.steps.every((s) => s.done);
    }
    if (goalProgress(goal) !== 100) {
      goal.completedAt = null;
      goal.completedAtManual = false;
      return goal;
    }
    if (goal.completedAtManual === true && goal.completedAt) return goal;
    goal.completedAtManual = false;
    if (goal.steps.length > 0) {
      const times = goal.steps.map((s) => (s.doneAt ? Date.parse(s.doneAt) : NaN)).filter((t) => !Number.isNaN(t));
      if (times.length) goal.completedAt = new Date(Math.max(...times)).toISOString();
      else if (!goal.completedAt) goal.completedAt = new Date().toISOString();
    } else if (!goal.completedAt) {
      goal.completedAt = new Date().toISOString();
    }
    return goal;
  }

  // Schritt abhaken / wieder öffnen. Beim Abhaken wird der Zeitpunkt für den Verlauf gemerkt.
  function setStepDone(goal, step, done) {
    const value = done === true;
    if (value && !step.done) step.doneAt = new Date().toISOString();
    if (!value) step.doneAt = null;
    step.done = value;
    return refreshGoal(goal);
  }

  // Ziel ohne Schritte direkt abhaken / wieder öffnen.
  function setGoalDone(goal, done) {
    const value = done === true;
    if (value && !goal.done) goal.completedAt = new Date().toISOString();
    if (!value) goal.completedAt = null;
    goal.done = value;
    return refreshGoal(goal);
  }

  // Erreicht-Datum jederzeit ändern (nur bei erreichten Zielen). iso = neuer Zeitstempel.
  function setGoalReachedDate(goal, iso) {
    if (goalProgress(goal) !== 100 || !cleanDate(iso)) return false;
    goal.completedAt = new Date(iso).toISOString();
    goal.completedAtManual = true;
    return true;
  }

  // Erstellt-Datum jederzeit ändern, z. B. um ein altes Ziel nachzutragen.
  function setGoalCreatedDate(goal, iso) {
    if (!cleanDate(iso)) return false;
    goal.createdAt = new Date(iso).toISOString();
    return true;
  }

  // ---------- Reihenfolge ----------

  function moveItem(array, index, direction) {
    const target = index + direction;
    if (index < 0 || index >= array.length || target < 0 || target >= array.length) return false;
    const tmp = array[index];
    array[index] = array[target];
    array[target] = tmp;
    return true;
  }

  // ---------- Farben ----------

  function readableTextColor(hex) {
    if (!HEX_COLOR.test(hex)) return '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return luminance > 0.4 ? '#14161b' : '#ffffff';
  }

  // ---------- Daten bereinigen / migrieren ----------

  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      language: ['auto', ...LANGUAGES].includes(s.language) ? s.language : DEFAULT_SETTINGS.language,
      listName: cleanString(s.listName, 40, ''),
      theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
      accent: typeof s.accent === 'string' && HEX_COLOR.test(s.accent) ? s.accent.toLowerCase() : DEFAULT_SETTINGS.accent,
      fontScale: clamp(s.fontScale, 0.85, 1.4, DEFAULT_SETTINGS.fontScale),
      density: ['compact', 'normal', 'roomy'].includes(s.density) ? s.density : DEFAULT_SETTINGS.density,
      radius: clamp(s.radius, 0, 24, DEFAULT_SETTINGS.radius)
    };
  }

  function normalizeEntries(raw) {
    const seen = new Set();
    return (Array.isArray(raw) ? raw : [])
      .map((e) => (e && typeof e === 'object' ? e : {}))
      .filter((e) => typeof e.text === 'string' && e.text.trim())
      .map((e) => ({
        id: uniqueId(e.id, seen),
        text: cleanString(e.text, 5000, ''),
        at: cleanDate(e.at) || new Date().toISOString()
      }));
  }

  function normalizeGoal(raw, seenIds) {
    const g = raw && typeof raw === 'object' ? raw : {};
    const stepIds = new Set();
    const steps = (Array.isArray(g.steps) ? g.steps : [])
      .map((s) => (s && typeof s === 'object' ? s : {}))
      .filter((s) => typeof s.text === 'string' && s.text.trim())
      .map((s) => ({
        id: uniqueId(s.id, stepIds),
        text: cleanString(s.text, 300, ''),
        done: s.done === true,
        doneAt: s.done === true ? cleanDate(s.doneAt) : null,
        description: cleanString(s.description, 5000, ''),
        entries: normalizeEntries(s.entries)
      }));
    const goal = {
      id: uniqueId(g.id, seenIds),
      title: cleanString(g.title, 200, PLACEHOLDER_TITLE),
      // Version 1 nannte die Beschreibung "note".
      description: cleanString(g.description !== undefined ? g.description : g.note, 5000, ''),
      done: g.done === true,
      steps,
      entries: normalizeEntries(g.entries),
      createdAt: cleanDate(g.createdAt) || new Date().toISOString(),
      completedAt: cleanDate(g.completedAt),
      completedAtManual: g.completedAtManual === true
    };
    return refreshGoal(goal);
  }

  function normalizeCategory(raw, seenIds, legacy) {
    const c = raw && typeof raw === 'object' ? raw : {};
    let icon = cleanIcon(c.icon, '');
    // In Version 1 wurde "kein Symbol" als Ordner gespeichert. Ab Version 2 ist es ein Punkt (leer).
    if (legacy && icon === '📁') icon = '';
    return {
      id: uniqueId(c.id, seenIds),
      name: cleanString(c.name, 80, PLACEHOLDER_TITLE),
      icon,
      color: typeof c.color === 'string' && HEX_COLOR.test(c.color) ? c.color.toLowerCase() : DEFAULT_CATEGORY_COLOR,
      goals: (Array.isArray(c.goals) ? c.goals : []).map((g) => normalizeGoal(g, seenIds))
    };
  }

  function createEmptyData() {
    return { version: DATA_VERSION, settings: normalizeSettings({}), categories: [] };
  }

  // Wirft einen Error mit .code ('invalid_data' | 'newer_version' | 'no_categories'); die Oberfläche übersetzt ihn.
  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw fail('invalid_data', 'The file does not contain valid data.');
    }
    if (typeof raw.version === 'number' && raw.version > DATA_VERSION) {
      throw fail('newer_version', 'This data comes from a newer version of the app.');
    }
    if (!Array.isArray(raw.categories)) {
      throw fail('no_categories', 'No categories found in the file.');
    }
    const legacy = typeof raw.version !== 'number' || raw.version < 2;
    // IDs müssen über alle Kategorien und Ziele hinweg eindeutig sein.
    const seen = new Set();
    return {
      version: DATA_VERSION,
      settings: normalizeSettings(raw.settings),
      categories: raw.categories.map((c) => normalizeCategory(c, seen, legacy))
    };
  }

  // ---------- Export / Import ----------

  function createExport(data) {
    return {
      app: APP_ID,
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: normalizeData(data)
    };
  }

  // Wirft einen Error mit .code ('unreadable' | 'foreign_file' | wie normalizeData)
  function parseImport(text) {
    let parsed;
    try {
      parsed = JSON.parse(String(text).replace(/^﻿/, ''));
    } catch (e) {
      throw fail('unreadable', 'The file could not be read.');
    }
    if (!parsed || typeof parsed !== 'object') throw fail('foreign_file', 'This file is not from this app.');
    const known = [APP_ID, ...LEGACY_APP_IDS];
    if (known.includes(parsed.app) && parsed.data) return normalizeData(parsed.data);
    if (parsed.app && !known.includes(parsed.app)) throw fail('foreign_file', 'This file is not from this app.');
    if (Array.isArray(parsed.categories)) return normalizeData(parsed);
    throw fail('foreign_file', 'This file is not from this app.');
  }

  function countGoals(data) {
    return data.categories.reduce((sum, c) => sum + c.goals.length, 0);
  }

  function mergeEntries(target, incoming) {
    let changed = false;
    for (const e of incoming || []) {
      const exists = target.some((t) => t.id === e.id || (t.text === e.text && t.at === e.at));
      if (!exists) {
        target.push({ ...e });
        changed = true;
      }
    }
    return changed;
  }

  // Führt importierte Daten in den aktuellen Stand ein. Deine Einstellungen bleiben unverändert.
  // Kategorien/Ziele werden über ID (sonst Name/Titel) zugeordnet; bei Treffern werden fehlende Schritte
  // und Notizen ergänzt und erledigte Schritte bleiben erledigt (nichts geht verloren).
  function mergeData(current, incoming) {
    const result = clone(current);
    const added = { categories: 0, goals: 0 };
    const updated = { goals: 0 };
    const usedIds = new Set();
    for (const c of result.categories) {
      usedIds.add(c.id);
      for (const g of c.goals) usedIds.add(g.id);
    }
    const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

    for (const inCat of clone(incoming).categories) {
      const cat =
        result.categories.find((c) => c.id === inCat.id) ||
        result.categories.find((c) => sameText(c.name, inCat.name));

      if (!cat) {
        // Ganz neue Kategorie: IDs bei Kollision erneuern.
        const fresh = { ...inCat, id: usedIds.has(inCat.id) ? uid() : inCat.id, goals: [] };
        usedIds.add(fresh.id);
        for (const g of inCat.goals) {
          const gid = usedIds.has(g.id) ? uid() : g.id;
          usedIds.add(gid);
          fresh.goals.push({ ...g, id: gid });
          added.goals += 1;
        }
        result.categories.push(fresh);
        added.categories += 1;
        continue;
      }

      for (const inGoal of inCat.goals) {
        const goal =
          cat.goals.find((g) => g.id === inGoal.id) || cat.goals.find((g) => sameText(g.title, inGoal.title));
        if (!goal) {
          const gid = usedIds.has(inGoal.id) ? uid() : inGoal.id;
          usedIds.add(gid);
          cat.goals.push({ ...inGoal, id: gid });
          added.goals += 1;
          continue;
        }
        let changed = false;
        for (const inStep of inGoal.steps) {
          const step =
            goal.steps.find((s) => s.id === inStep.id) || goal.steps.find((s) => sameText(s.text, inStep.text));
          if (!step) {
            goal.steps.push({ ...inStep });
            changed = true;
            continue;
          }
          if (inStep.done && !step.done) {
            step.done = true;
            step.doneAt = inStep.doneAt;
            changed = true;
          }
          if (!step.description && inStep.description) {
            step.description = inStep.description;
            changed = true;
          }
          if (mergeEntries(step.entries, inStep.entries)) changed = true;
        }
        if (goal.steps.length === 0 && inGoal.done && !goal.done) {
          goal.done = true;
          goal.completedAt = inGoal.completedAt;
          goal.completedAtManual = inGoal.completedAtManual === true;
          changed = true;
        }
        if (!goal.description && inGoal.description) {
          goal.description = inGoal.description;
          changed = true;
        }
        if (mergeEntries(goal.entries, inGoal.entries)) changed = true;
        if (changed) {
          refreshGoal(goal);
          updated.goals += 1;
        }
      }
    }
    return { data: result, added, updated };
  }

  // ---------- Verlauf ----------

  // Alle Ereignisse aus den Daten, neueste zuerst:
  //   'created' = Ziel erstellt, 'reached' = Ziel erreicht, 'step' = Schritt erledigt, 'entry' = Notiz.
  // Der Verlauf wird aus den Daten abgeleitet: Er ist immer konsistent, ändert sich mit jedem geänderten Datum
  // und wandert mit Export/Import mit.
  function buildHistory(data) {
    const events = [];
    for (const cat of data.categories) {
      const base = {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color
      };
      for (const goal of cat.goals) {
        const g = { ...base, goalId: goal.id, goalTitle: goal.title, stepId: null, stepText: null, text: null };
        if (goal.createdAt) events.push({ ...g, type: 'created', at: goal.createdAt });
        if (goalProgress(goal) === 100 && goal.completedAt) {
          events.push({ ...g, type: 'reached', at: goal.completedAt });
        }
        for (const e of goal.entries || []) {
          events.push({ ...g, type: 'entry', at: e.at, text: e.text, entryId: e.id });
        }
        for (const step of goal.steps) {
          const s = { ...g, stepId: step.id, stepText: step.text };
          if (step.done && step.doneAt) events.push({ ...s, type: 'step', at: step.doneAt });
          for (const e of step.entries || []) {
            events.push({ ...s, type: 'entry', at: e.at, text: e.text, entryId: e.id });
          }
        }
      }
    }
    // Bei gleichem Zeitpunkt steht (von oben gelesen = rückwärts in der Zeit) "erreicht" vor "erledigt" vor
    // "Notiz" vor "erstellt".
    const rank = { reached: 0, step: 1, entry: 2, created: 3 };
    events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || rank[a.type] - rank[b.type]);
    return events;
  }

  // ---------- Listen: Ziele in Arbeit / erreichte Ziele ----------

  // Alle noch nicht erreichten Ziele, gruppiert nach Kategorie (Reihenfolge wie in der App).
  function openGoalGroups(data) {
    const groups = [];
    for (const category of data.categories) {
      const items = category.goals
        .map((goal) => ({ goal, progress: goalProgress(goal) }))
        .filter((item) => item.progress < 100);
      if (items.length) groups.push({ category, items });
    }
    return groups;
  }

  // Alle erreichten Ziele, zuletzt erreichte zuerst.
  function achievedGoals(data) {
    const items = [];
    for (const category of data.categories) {
      for (const goal of category.goals) {
        if (goalProgress(goal) === 100) items.push({ category, goal });
      }
    }
    const time = (item) => (item.goal.completedAt ? Date.parse(item.goal.completedAt) : 0);
    return items.sort((a, b) => time(b) - time(a));
  }

  // ---------- Beispieldaten ----------

  const EXAMPLES = {
    de: {
      bucket: 'Bucketliste',
      japan: 'Japan bereisen',
      japanSteps: [
        'Flug buchen',
        'Im Hotel ankommen',
        'Tokio erkunden',
        'Kyoto besuchen',
        'Mount Fuji sehen',
        'Osaka: Street Food probieren'
      ],
      fujiDescription: 'Am besten bei klarem Wetter und früh am Morgen.',
      tokyoNote: 'Shibuya bei Nacht war unglaublich. In einem winzigen Laden am Bahnhof gab es die beste Ramen meines Lebens.',
      marry: 'Heiraten',
      kids: 'Kinder bekommen',
      learn: 'Lernen',
      guitar: 'Gitarre spielen lernen',
      guitarSteps: ['Gitarre kaufen', 'Die ersten 5 Akkorde', 'Ein ganzes Lied spielen'],
      firstAid: 'Erste-Hilfe-Kurs besuchen'
    },
    en: {
      bucket: 'Bucket list',
      japan: 'Travel to Japan',
      japanSteps: [
        'Book flight',
        'Arrive at the hotel',
        'Explore Tokyo',
        'Visit Kyoto',
        'See Mount Fuji',
        'Osaka: try the street food'
      ],
      fujiDescription: 'Best on a clear day, early in the morning.',
      tokyoNote: 'Shibuya at night was unreal. A tiny shop near the station served the best ramen of my life.',
      marry: 'Get married',
      kids: 'Have kids',
      learn: 'Learning',
      guitar: 'Learn to play guitar',
      guitarSteps: ['Buy a guitar', 'Learn the first 5 chords', 'Play a whole song'],
      firstAid: 'Take a first-aid course'
    }
  };

  function createExampleData(language) {
    const x = EXAMPLES[language === 'de' ? 'de' : 'en'];
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const step = (text, doneAt, extra) => ({
      id: uid(),
      text,
      done: !!doneAt,
      doneAt: doneAt || null,
      description: '',
      entries: [],
      ...extra
    });
    const goal = (title, steps, extra) =>
      refreshGoal({
        id: uid(),
        title,
        description: '',
        done: false,
        steps: steps || [],
        entries: [],
        createdAt: daysAgo(60),
        completedAt: null,
        completedAtManual: false,
        ...extra
      });

    const japanSteps = x.japanSteps.map((text, i) => {
      if (i === 0) return step(text, daysAgo(40));
      if (i === 1) return step(text, daysAgo(30));
      if (i === 2) return step(text, daysAgo(28), { entries: [{ id: uid(), text: x.tokyoNote, at: daysAgo(28) }] });
      if (i === 4) return step(text, null, { description: x.fujiDescription });
      return step(text, null);
    });

    return {
      version: DATA_VERSION,
      settings: normalizeSettings({}),
      categories: [
        {
          id: uid(),
          name: x.bucket,
          icon: '✈️',
          color: '#4f7cff',
          goals: [goal(x.japan, japanSteps), goal(x.marry), goal(x.kids)]
        },
        {
          id: uid(),
          name: x.learn,
          icon: '📚',
          color: '#2bab6f',
          goals: [
            goal(x.guitar, [step(x.guitarSteps[0], daysAgo(20)), step(x.guitarSteps[1]), step(x.guitarSteps[2])], {
              createdAt: daysAgo(45)
            }),
            goal(x.firstAid, [], { done: true, createdAt: daysAgo(50), completedAt: daysAgo(14) })
          ]
        }
      ]
    };
  }

  return {
    APP_ID,
    DATA_VERSION,
    LANGUAGES,
    DEFAULT_SETTINGS,
    uid,
    resolveLanguage,
    graphemes,
    firstGrapheme,
    singleIconFromInput,
    dateInputValue,
    isoFromDateInput,
    goalProgress,
    categoryStats,
    overallStats,
    refreshGoal,
    setStepDone,
    setGoalDone,
    setGoalReachedDate,
    setGoalCreatedDate,
    moveItem,
    readableTextColor,
    normalizeSettings,
    normalizeData,
    createEmptyData,
    createExport,
    parseImport,
    countGoals,
    mergeData,
    buildHistory,
    openGoalGroups,
    achievedGoals,
    createExampleData
  };
});
