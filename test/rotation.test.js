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
  assert.deepEqual(R.myTurn(TEAM, ME, null), { before: 'David Varga', position: null, total: 11, end: false });
  assert.equal(R.myTurn(without('David Varga'), ME, null).before, 'Dávid Szabó');
});

test('my turn with a known starter gives my position', () => {
  assert.deepEqual(R.myTurn(TEAM, ME, 'Nóra Pap'), { before: 'David Varga', position: 8, total: 11, end: false });
  assert.deepEqual(R.myTurn(TEAM, ME, ME), { before: null, position: 1, total: 11, end: false });
  // the one after me starts: I am last
  assert.deepEqual(R.myTurn(TEAM, ME, 'Krisztina Hegedűs'), { before: 'David Varga', position: 11, total: 11, end: false });
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

test('speaking order starts with the starter and wraps around', () => {
  assert.deepEqual(R.speakingOrder(TEAM, 'Nóra Pap').slice(0, 3), ['Nóra Pap', 'Péter Lakatos', 'Ádám Kovács']);
  assert.equal(R.speakingOrder(TEAM, null)[0], 'Ádám Kovács');
});

test('a team is found by link, or by the people in the call', () => {
  const team = { id: 't', codes: ['aaa-bbbb-ccc'], known: TEAM, last: { date: '2026-10-15', starter: 'Nóra Pap' } };
  const other = { id: 'o', codes: ['xxx-yyyy-zzz'], known: ['Ann', 'Bob', 'Cid', 'Dan'], last: null };
  const groups = [other, team];
  assert.equal(R.findGroup(groups, 'aaa-bbbb-ccc', null), team);
  // a different link for the same standup, a few people missing and a guest
  assert.equal(R.findGroup(groups, 'new-link-xyz', [...without('Péter Lakatos', 'Lili Simon'), 'Guest One']), team);
  // a 1:1 with two of the team is not the standup
  assert.equal(R.findGroup(groups, 'one-onee-one', [ME, 'Nóra Pap']), null);
});

test('groups of the same team are merged, keeping the latest starter', () => {
  const a = { id: 'a', codes: ['l1'], known: TEAM, last: { date: '2026-10-14', starter: 'Anna Tóth' }, seen: '2026-10-14' };
  const b = { id: 'b', codes: ['l2'], known: without('Ádám Kovács'), last: { date: '2026-10-15', starter: 'Nóra Pap' }, seen: '2026-10-15' };
  const c = { id: 'c', codes: ['l3'], known: ['Ann', 'Bob', 'Cid'], last: null };
  const out = R.mergeGroups([a, b, c]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].codes, ['l1', 'l2']);
  assert.deepEqual(out[0].last, { date: '2026-10-15', starter: 'Nóra Pap' });
  assert.equal(out[0].seen, '2026-10-15');
});

test('the meeting lead speaks last and never starts', () => {
  const LEAD = 'Zoltán Fehér'; // after Péter alphabetically
  const call = [...TEAM, LEAD];
  const last = { date: '2026-10-15', starter: 'Péter Lakatos' };
  assert.equal(R.starterToday(last, '2026-10-16', call, call), LEAD); // without the exception
  const ex = { last: [LEAD], skip: [] };
  assert.equal(R.starterToday(last, '2026-10-16', call, call, ex), 'Ádám Kovács');
  const order = R.speakingOrder(call, 'Ádám Kovács', ex);
  assert.equal(order[0], 'Ádám Kovács');
  assert.equal(order.at(-1), LEAD);
  assert.deepEqual(R.myTurn(call, LEAD, 'Ádám Kovács', ex), { before: 'Péter Lakatos', position: 12, total: 12, end: true });
  // without a starter the lead still knows they are at the end
  assert.deepEqual(R.myTurn(call, LEAD, null, ex), { before: null, position: null, total: 12, end: true });
  // a starter saved today who is then marked "last" hands over to the next person
  assert.equal(R.starterToday({ date: '2026-10-16', starter: LEAD }, '2026-10-16', call, call, ex), 'Ádám Kovács');
});

test('people not in the standup are left out of the order', () => {
  const ex = { last: [], skip: ['Nóra Pap'] };
  assert.equal(R.speakingOrder(TEAM, null, ex).includes('Nóra Pap'), false);
  assert.equal(R.myTurn(TEAM, 'Nóra Pap', null, ex), null);
  // Nóra would start after Márk; skipped, so Péter does
  assert.equal(R.starterToday({ date: '2026-10-15', starter: 'Márk Molnár' }, '2026-10-16', TEAM, TEAM, ex), 'Péter Lakatos');
  assert.equal(R.myTurn(TEAM, 'Péter Lakatos', null, ex).before, 'Márk Molnár');
});

test('exceptions are kept when teams merge', () => {
  const a = { id: 'a', codes: ['l1'], known: TEAM, ex: { last: ['Nóra Pap'], skip: [] } };
  const b = { id: 'b', codes: ['l2'], known: TEAM, ex: { last: [], skip: ['Guest'] } };
  assert.deepEqual(R.mergeGroups([a, b])[0].ex, { last: ['Nóra Pap'], skip: ['Guest'] });
});
