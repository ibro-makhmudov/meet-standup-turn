// Pure logic: no DOM, no chrome.*, no team-specific data. Shared by content script and tests.
//
// 1. My turn: people speak in alphabetical order (wrapping around), so I speak right after
//    the person alphabetically before me among those in the call. If I start today, nobody.
// 2. Who starts today (optional): each standup day the next person alphabetically after the
//    previous starter starts; people not in the call are skipped. Needs one known starter.
(function (root) {
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const cmp = (a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  const sortNames = (names) => [...new Set(names)].sort(cmp);

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const isWeekday = (s) => { const d = parse(s).getDay(); return d !== 0 && d !== 6; };

  // Next name after `cur` (wrapping) that passes `ok`. `cur` may be missing from the list.
  function nextAfter(list, cur, ok = () => true) {
    const n = list.length;
    if (!n) return null;
    let idx = list.indexOf(cur);
    if (idx === -1) {
      const pos = list.findIndex((x) => cmp(x, cur) > 0);
      idx = pos === -1 ? n - 1 : pos - 1;
    }
    for (let i = 1; i <= n; i++) {
      const c = list[(((idx + i) % n) + n) % n];
      if (ok(c)) return c;
    }
    return null;
  }

  // Exceptions per team: ex = { last: [names], skip: [names] }
  // - last: speaks at the end (e.g. the person leading the meeting), never in the starter rotation
  // - skip: not part of the standup at all (guests, observers)
  const exLast = (ex) => (ex && ex.last) || [];
  const exSkip = (ex) => (ex && ex.skip) || [];

  // Today's speaking order: alphabetical starting with the starter (A–Z without one), "last" people at the end.
  function speakingOrder(present, starter, ex) {
    const all = sortNames(present).filter((n) => !exSkip(ex).includes(n));
    const regular = all.filter((n) => !exLast(ex).includes(n));
    const enders = all.filter((n) => exLast(ex).includes(n));
    const s = starter ? regular.indexOf(starter) : -1;
    return (s > 0 ? regular.slice(s).concat(regular.slice(0, s)) : regular).concat(enders);
  }

  // present: names in the call (me included). starter: optional.
  // -> { before, position, total, end } ; before === null: I go first, or (end) I'm first of the "last" people
  //    and who is before me depends on today's starter; null result: I'm not in the order.
  function myTurn(present, me, starter, ex) {
    const order = speakingOrder(present, starter, ex);
    const total = order.length;
    const pos = order.indexOf(me);
    if (pos === -1 || total < 2) return null;
    const regular = order.filter((n) => !exLast(ex).includes(n));
    const known = !!starter && regular.includes(starter);
    const end = exLast(ex).includes(me);
    if (known) return { before: pos === 0 ? null : order[pos - 1], position: pos + 1, total, end };
    if (end) return { before: pos === regular.length ? null : order[pos - 1], position: null, total, end };
    const i = regular.indexOf(me);
    return regular.length < 2 ? { before: null, position: null, total, end }
      : { before: regular[(i - 1 + regular.length) % regular.length], position: null, total, end };
  }

  // last: { date: 'YYYY-MM-DD', starter } — the latest known starter.
  // ex: exceptions (see above); people in it never start.
  // known: everyone ever seen in this meeting (used to step over days you missed).
  // present: names in the call now, or null if unknown.
  function starterToday(last, today, known, present, ex) {
    if (!last || !last.starter) return null;
    const out = new Set([...exLast(ex), ...exSkip(ex)]);
    const here = present ? new Set(present) : null;
    const ok = (n) => !here || here.has(n);
    // only people in the rotation (exceptions never start); the last starter may be gone from it
    const list = sortNames([...(known || []), ...(present || [])]).filter((n) => !out.has(n));
    if (last.date >= today) return out.has(last.starter) ? nextAfter(list, last.starter, ok) : last.starter;
    let cur = last.starter;
    // standup days you were not there for: assume everyone was there
    for (let d = addDays(last.date, 1); d < today; d = addDays(d, 1)) {
      if (isWeekday(d)) cur = nextAfter(list, cur) || cur;
    }
    return nextAfter(list, cur, ok);
  }

  // '1.0.10' > '1.0.9'
  function newerVersion(latest, current) {
    const a = String(latest || '').split('.').map(Number), b = String(current || '').split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }

  // ---- teams: one standup can use several Meet links, so data is kept per team, found by people ----
  // group: { id, codes: [meeting codes], known: [names seen], last: {date, starter} | null, seen: 'YYYY-MM-DD' }
  function overlap(a, b) {
    const set = new Set(a);
    return b.filter((x) => set.has(x)).length;
  }
  // Same team: at least 3 shared people and 60% of the smaller group.
  function sameTeam(a, b) {
    const shared = overlap(a, b);
    return shared >= 3 && shared / Math.max(1, Math.min(a.length, b.length)) >= 0.6;
  }
  // The group for this meeting: by link first, otherwise by who is in the call.
  function findGroup(groups, code, present) {
    const byCode = groups.find((g) => g.codes.includes(code));
    if (byCode || !present) return byCode || null;
    let best = null, bestShared = 0;
    for (const g of groups) {
      const shared = overlap(g.known, present);
      if (sameTeam(g.known, present) && shared > bestShared) { best = g; bestShared = shared; }
    }
    return best;
  }
  // Join groups that turned out to be the same team (e.g. data saved per link by older versions).
  function mergeGroups(groups) {
    const out = [];
    for (const g of groups) {
      const t = out.find((o) => sameTeam(o.known, g.known));
      if (!t) { out.push({ ...g, codes: [...g.codes], known: [...g.known] }); continue; }
      t.codes = [...new Set([...t.codes, ...g.codes])];
      t.known = sortNames([...t.known, ...g.known]);
      if (g.ex) t.ex = { last: [...new Set([...exLast(t.ex), ...exLast(g.ex)])], skip: [...new Set([...exSkip(t.ex), ...exSkip(g.ex)])] };
      if (g.last && (!t.last || g.last.date > t.last.date)) t.last = g.last;
      if ((g.seen || '') > (t.seen || '')) t.seen = g.seen;
    }
    return out;
  }

  const api = { speakingOrder, sameTeam, findGroup, mergeGroups, newerVersion, cmp, sortNames, ymd, parse, addDays, isWeekday, nextAfter, myTurn, starterToday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StandupRotation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
