const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rotation.js');

const TEAM = [
  'Imre Fekete', 'Ádám Kovács', 'Anna Tóth', 'Balázs Nagy', 'Dávid Szabó',
  'David Varga', 'Krisztina Hegedűs', 'Lili Simon', 'Márk Molnár', 'Nóra Pap', 'Péter Lakatos',
];
const ME = 'Imre Fekete';
const without = (...out) => TEAM.filter((n) => !out.includes(n));

test('alphabetical order handles accents like Meet does', () => {
  assert.deepEqual(R.sortNames(TEAM).slice(3, 6), ['Dávid Szabó', 'David Varga', 'Imre Fekete']);
});

test('my turn: right after the person alphabetically before me', () => {
  assert.deepEqual(R.myTurn(TEAM, ME, null), { before: 'David Varga', position: null, total: 11 });
  assert.equal(R.myTurn(without('David Varga'), ME, null).before, 'Dávid Szabó');
});

test('my turn with a known starter gives my position', () => {
  assert.deepEqual(R.myTurn(TEAM, ME, 'Nóra Pap'), { before: 'David Varga', position: 8, total: 11 });
  assert.deepEqual(R.myTurn(TEAM, ME, ME), { before: null, position: 1, total: 11 });
  // the one after me starts: I am last
  assert.deepEqual(R.myTurn(TEAM, ME, 'Krisztina Hegedűs'), { before: 'David Varga', position: 11, total: 11 });
});

test('first alphabetically speaks after the last one (wrap around)', () => {
  assert.equal(R.myTurn(TEAM, 'Ádám Kovács', 'Nóra Pap').before, 'Péter Lakatos');
});

test('my turn is unknown when I am not found or alone', () => {
  assert.equal(R.myTurn(TEAM, 'Nobody', null), null);
  assert.equal(R.myTurn([ME], ME, null), null);
});

test('starter: Nóra started Mon 12 Oct, so Péter starts Tue 13 Oct', () => {
  const last = { date: '2026-10-12', starter: 'Nóra Pap' };
  assert.equal(R.starterToday(last, '2026-10-12', TEAM, TEAM), 'Nóra Pap');
  assert.equal(R.starterToday(last, '2026-10-13', TEAM, TEAM), 'Péter Lakatos');
});

test('starter not in the call: next person in the call starts', () => {
  const last = { date: '2026-10-12', starter: 'Nóra Pap' };
  assert.equal(R.starterToday(last, '2026-10-13', TEAM, without('Péter Lakatos')), 'Ádám Kovács');
});

test('missed days are stepped over, weekends do not count', () => {
  const last = { date: '2026-10-12', starter: 'Nóra Pap' }; // Mon
  assert.equal(R.starterToday(last, '2026-10-15', TEAM, null), 'Anna Tóth'); // Thu: Péter, Ádám, Anna
  assert.equal(R.starterToday(last, '2026-10-19', TEAM, null), 'Dávid Szabó'); // next Mon
});

test('a newcomer gets their alphabetical place', () => {
  const last = { date: '2026-10-12', starter: 'Péter Lakatos' };
  assert.equal(R.starterToday(last, '2026-10-13', TEAM, [...TEAM, 'Zoltán Fehér']), 'Zoltán Fehér');
});

test('no known starter means no answer', () => {
  assert.equal(R.starterToday(null, '2026-10-13', TEAM, TEAM), null);
});

test('update check compares versions numerically', () => {
  assert.equal(R.newerVersion('1.0.10', '1.0.9'), true);
  assert.equal(R.newerVersion('1.0.0', '1.0.0'), false);
  assert.equal(R.newerVersion('1.0', '1.0.1'), false);
  assert.equal(R.newerVersion(null, '1.0.0'), false);
});
