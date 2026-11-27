'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../renderer/i18n.js');
const L = require('../renderer/logic.js');

const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');

const PLURAL = /^(.*)\.(zero|one|two|few|many|other)$/;
const baseOf = (dict) => new Set(Object.keys(dict).map((k) => { const m = k.match(PLURAL); return m ? m[1] + '.*' : k; }));
const enOther = (key) => {
  const m = key.match(PLURAL);
  return m ? I.dictionaries.en[m[1] + '.other'] : I.dictionaries.en[key];
};

test('Jede Sprache hat dieselben Schlüssel wie Englisch (Mehrzahlformen je Sprache)', () => {
  const base = [...baseOf(I.dictionaries.en)].sort();
  for (const lang of L.LANGUAGES) {
    assert.ok(I.dictionaries[lang], 'Sprache fehlt: ' + lang);
    assert.deepEqual([...baseOf(I.dictionaries[lang])].sort(), base, 'Sprache ' + lang);
    for (const key of Object.keys(I.dictionaries.en)) {
      const m = key.match(PLURAL);
      if (m && m[2] === 'other') assert.ok(I.dictionaries[lang][key], lang + ':' + key + ' (.other fehlt)');
    }
  }
});

test('Platzhalter stimmen in allen Sprachen überein, keine Texte sind leer', () => {
  for (const lang of L.LANGUAGES) {
    for (const [key, text] of Object.entries(I.dictionaries[lang])) {
      assert.ok(typeof text === 'string' && text.trim(), lang + ':' + key + ' ist leer');
      assert.equal(placeholders(text), placeholders(enOther(key)), lang + ':' + key);
    }
  }
});

test('Es gibt 43 Sprachen inkl. Japanisch und Chinesisch, alle mit Namen', () => {
  assert.equal(L.LANGUAGES.length, 43);
  for (const c of ['ja', 'zh', 'pl', 'ru', 'ga', 'cy', 'is', 'sq', 'ka']) assert.ok(L.LANGUAGES.includes(c), c);
  for (const c of L.LANGUAGES) assert.ok(L.LANGUAGE_NAMES[c], c);
});

test('Sprachwahl: Aliase und Regionalvarianten', () => {
  assert.equal(L.resolveLanguage('auto', 'no'), 'nb');
  assert.equal(L.resolveLanguage('auto', 'pl-PL'), 'pl');
  assert.equal(L.resolveLanguage('auto', 'zh-CN'), 'zh');
});

test('Mehrzahl nach Sprachregeln (Polnisch, Russisch, Japanisch)', () => {
  assert.match(I.translate('pl', 'count.goals', { n: 5 }), /^5 /);
  assert.notEqual(I.translate('pl', 'count.goals', { n: 1 }), I.translate('pl', 'count.goals', { n: 5 }).replace('5', '1'));
  assert.notEqual(I.translate('ru', 'count.goals', { n: 2 }), I.translate('ru', 'count.goals', { n: 5 }).replace('5', '2'));
  assert.match(I.translate('ja', 'count.goals', { n: 3 }), /3/);
});

test('Mehrzahl, Platzhalter und deutscher Dativ', () => {
  assert.equal(I.translate('de', 'count.goals', { n: 1 }), '1 Ziel');
  assert.equal(I.translate('de', 'count.goals', { n: 2 }), '2 Ziele');
  assert.equal(I.translate('de', 'count.goalsOf', { n: 3 }), '3 Zielen');
  assert.equal(I.translate('de', 'count.goalsOf', { n: 1 }), '1 Ziel');
  assert.equal(I.translate('en', 'count.goals', { n: 1 }), '1 goal');
  assert.equal(I.translate('en', 'count.goals', { n: 0 }), '0 goals');
  assert.equal(I.translate('en', 'goal.markReached', { title: 'Japan' }), 'Mark “Japan” as reached');
});

test('Unbekannte Sprache fällt auf Englisch zurück, unbekannter Schlüssel liefert den Schlüssel', () => {
  assert.equal(I.translate('xx', 'nav.history'), 'History');
  assert.notEqual(I.translate('fr', 'nav.history'), 'History');
  assert.equal(I.translate('de', 'nav.history'), 'Verlauf');
  assert.equal(I.translate('en', 'gibt.es.nicht'), 'gibt.es.nicht');
});

test('Fehlender Platzhalter-Wert bleibt sichtbar statt "undefined"', () => {
  assert.equal(I.fill('Hallo {name}', {}), 'Hallo {name}');
});
