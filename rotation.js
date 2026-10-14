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

  // present: names in the call (me included). starter: optional.
  // -> { before, position, total } ; before === null means I go first.
  function myTurn(present, me, starter) {
    const list = sortNames(present);
    const total = list.length;
    const idx = list.indexOf(me);
    if (idx === -1 || total < 2) return null;
    if (starter && list.includes(starter)) {
      const s = list.indexOf(starter);
      const order = list.slice(s).concat(list.slice(0, s));
      const pos = order.indexOf(me);
      return { before: pos === 0 ? null : order[pos - 1], position: pos + 1, total };
    }
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

  const api = { newerVersion, cmp, sortNames, ymd, parse, addDays, isWeekday, nextAfter, myTurn, starterToday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StandupRotation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
