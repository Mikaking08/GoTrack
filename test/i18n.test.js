'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../renderer/i18n.js');
const L = require('../renderer/logic.js');

const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');

test('Jede Sprache hat genau dieselben Schlüssel wie Englisch', () => {
  const base = Object.keys(I.dictionaries.en).sort();
  for (const lang of L.LANGUAGES) {
    assert.deepEqual(Object.keys(I.dictionaries[lang]).sort(), base, 'Sprache ' + lang);
  }
});

test('Platzhalter stimmen in allen Sprachen überein, keine Texte sind leer', () => {
  for (const lang of L.LANGUAGES) {
    for (const [key, text] of Object.entries(I.dictionaries[lang])) {
      assert.ok(typeof text === 'string' && text.trim(), lang + ':' + key + ' ist leer');
      assert.equal(placeholders(text), placeholders(I.dictionaries.en[key]), lang + ':' + key);
    }
  }
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
  assert.equal(I.translate('fr', 'nav.history'), 'History');
  assert.equal(I.translate('de', 'nav.history'), 'Verlauf');
  assert.equal(I.translate('en', 'gibt.es.nicht'), 'gibt.es.nicht');
});

test('Fehlender Platzhalter-Wert bleibt sichtbar statt "undefined"', () => {
  assert.equal(I.fill('Hallo {name}', {}), 'Hallo {name}');
});
