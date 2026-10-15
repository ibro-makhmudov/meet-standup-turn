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

  // Today's speaking order: alphabetical, starting with the starter (or A–Z without one).
  function speakingOrder(present, starter) {
    const list = sortNames(present);
    const s = starter ? list.indexOf(starter) : -1;
    return s > 0 ? list.slice(s).concat(list.slice(0, s)) : list;
  }

  // present: names in the call (me included). starter: optional.
  // -> { before, position, total } ; before === null means I go first.
  function myTurn(present, me, starter) {
    const list = sortNames(present);
    const total = list.length;
    if (!list.includes(me) || total < 2) return null;
    if (starter && list.includes(starter)) {
      const order = speakingOrder(list, starter);
      const pos = order.indexOf(me);
      return { before: pos === 0 ? null : order[pos - 1], position: pos + 1, total };
    }
    const idx = list.indexOf(me);
    return { before: list[(idx - 1 + total) % total], position: null, total };
  }

  // last: { date: 'YYYY-MM-DD', starter } — the latest known starter.
  // known: everyone ever seen in this meeting (used to step over days you missed).
  // present: names in the call now, or null if unknown.
  function starterToday(last, today, known, present) {
    if (!last || !last.starter) return null;
    if (last.date >= today) return last.starter;
    const list = sortNames([...(known || []), ...(present || []), last.starter]);
    let cur = last.starter;
    // standup days you were not there for: assume everyone was there
    for (let d = addDays(last.date, 1); d < today; d = addDays(d, 1)) {
      if (isWeekday(d)) cur = nextAfter(list, cur);
    }
    const here = present ? new Set(present) : null;
    return nextAfter(list, cur, (n) => !here || here.has(n));
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
      if (g.last && (!t.last || g.last.date > t.last.date)) t.last = g.last;
      if ((g.seen || '') > (t.seen || '')) t.seen = g.seen;
    }
    return out;
  }

  const api = { speakingOrder, sameTeam, findGroup, mergeGroups, newerVersion, cmp, sortNames, ymd, parse, addDays, isWeekday, nextAfter, myTurn, starterToday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StandupRotation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
