// Card in Google Meet: "You speak after X" and (optionally) "Today starts: Y".
// Names come from Meet's People panel. When the panel is closed, the extension opens it for a
// moment on joining (and when the number of people changes), reads the list and closes it again.
// Remembers per team (found by meeting link or by who is in the call): who started last time
// and the names seen. One standup can use several Meet links.
(async function () {
  const R = globalThis.StandupRotation;
  if (!R || document.getElementById('standup-turn-root')) return;

  const AUTO_SAVE_MS = 3 * 60 * 1000; // remember today's starter after the call has run a bit
  const RESNAP_MS = 20 * 1000; // at most one automatic People-panel read per 20 s

  // ---------- storage (chrome.storage.local, localStorage in the demo page) ----------
  const area = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  async function get(key) {
    if (area) return (await area.get(key))[key];
    try { return JSON.parse(localStorage.getItem(key)); } catch { return undefined; }
  }
  async function set(key, value) {
    if (area) await area.set({ [key]: value });
    else localStorage.setItem(key, JSON.stringify(value));
  }

  const code = () => (location.pathname.match(/^\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})\b/) || [])[1]
    || (globalThis.STANDUP_DEMO ? globalThis.STANDUP_DEMO_CODE || 'demo' : null);
  const today = () => (globalThis.STANDUP_TODAY || R.ymd(new Date()));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Data is kept per team, not per link. A call belongs to a team by its link, or, for a link
  // not seen before, by the people in it (R.findGroup). group: { id, codes, known, last, seen }
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  async function loadGroups() {
    let gs = (await get('groups')) || [];
    // 1.1 kept one record per link ("meet:<code>"): move them into teams once
    const all = area ? await area.get(null)
      : Object.fromEntries(Object.keys(localStorage).map((k) => { try { return [k, JSON.parse(localStorage.getItem(k))]; } catch { return [k, null]; } }));
    const old = Object.keys(all).filter((k) => k.startsWith('meet:'));
    if (old.length) {
      for (const k of old) {
        const m = all[k] || {};
        gs.push({ id: newId(), codes: [k.slice(5)], known: m.known || [], last: m.last || null, seen: today() });
      }
      gs = R.mergeGroups(gs);
      await set('groups', gs);
      if (area) await area.remove(old); else old.forEach((k) => localStorage.removeItem(k));
    }
    const cutoff = R.addDays(today(), -90); // forget teams not seen for 90 days
    return gs.filter((g) => !g.seen || g.seen >= cutoff);
  }
  let groups = await loadGroups();
  let team = null; // the team of the current call, once known
  const saveGroups = () => set('groups', groups);
  function newTeam(c) {
    team = { id: newId(), codes: [c], known: [], last: null, seen: today() };
    groups.push(team);
    return team;
  }
  let myName = (await get('me')) || null;

  // ---------- reading Meet ----------
  const YOU = /\((you|te|ön|вы|siz)\)/i;

  // Accessible name: Meet labels its People button through aria-labelledby, not aria-label.
  function accName(el) {
    const by = el.getAttribute('aria-labelledby');
    const ref = by && document.getElementById(by);
    return (el.getAttribute('aria-label') || (ref && ref.textContent) || '').trim();
  }
  // Meet's People button (top right, its text is the number of people). Labels differ by UI language.
  const PEOPLE = /^(people|show everyone|személyek|résztvevők|участники|люди|teilnehmer|personas|persone)\b/i;
  function peopleButton() {
    return [...document.querySelectorAll('[role="button"], button')]
      .find((b) => !host.contains(b) && PEOPLE.test(accName(b)));
  }
  // Participant rows. Meet keeps the list in the page after the People panel was opened once,
  // also while the panel is closed, so hidden rows are read too. Group rows like "Merged audio"
  // contain the real people as nested rows, so rows with nested rows are skipped.
  const PARTICIPANTS = /participants|résztvevők|участники|teilnehmer|participantes|partecipanti|uczestnicy/i;
  function rows() {
    const lists = [...document.querySelectorAll('[role="list"][aria-label]')].filter((l) => PARTICIPANTS.test(l.getAttribute('aria-label')));
    const scope = lists.length ? lists : [...document.querySelectorAll('aside')];
    return scope.flatMap((l) => [...l.querySelectorAll('[role="listitem"][aria-label]')])
      .filter((el) => !el.querySelector('[role="listitem"]'));
  }
  function readList() {
    const names = [], avatars = {};
    let me = null, count = 0;
    for (const el of rows()) {
      const label = el.getAttribute('aria-label').trim();
      const name = label.replace(/\s*\((you|te|ön|вы|siz)\)\s*$/i, '').replace(/\s*\((presenting|presentation|prezent)[^)]*\)\s*$/i, '').trim();
      if (!name || name.length > 80) continue;
      names.push(name);
      count++;
      if (YOU.test(label) || YOU.test(el.textContent || '')) me = name;
      const img = el.querySelector('img[src]');
      if (img) avatars[name] = img.src;
    }
    return { names: R.sortNames(names), me, avatars, rows: count };
  }

  // A side panel is on screen (chat, activities, info, or People itself).
  const sidePanelOpen = () => [...document.querySelectorAll('aside')].some((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.left < innerWidth - 1 && r.right > 1;
  });

  let snap = null; // last read of the People list { names, me, avatars, rows }
  let snapping = false;
  let lastSnapAt = 0;
  let snapFails = 0; // People panel did not open: retry slowly, give up after 3

  function takeList(list) {
    snap = list;
    if (list.me && list.me !== myName) { myName = list.me; set('me', myName); }
  }

  // Open People for a moment so Meet renders the list, read it, close it again.
  async function snapshot() {
    const btn = peopleButton();
    if (!btn || snapping) return;
    snapping = true;
    lastSnapAt = Date.now();
    document.documentElement.setAttribute('data-standup-snap', '');
    try {
      btn.click();
      let list = null;
      for (let i = 0; i < 30 && !list; i++) {
        await sleep(100);
        if (rows().some((el) => el.getClientRects().length)) list = readList();
      }
      if (list) {
        await sleep(300);
        takeList(readList());
        snapFails = 0;
      } else snapFails++;
    } finally {
      if (rows().some((el) => el.getClientRects().length)) peopleButton()?.click(); // close People if we left it open
      await sleep(200);
      document.documentElement.removeAttribute('data-standup-snap');
      snapping = false;
    }
  }

  // Keep Meet's panel invisible while we read it.
  const pageCss = document.createElement('style');
  pageCss.textContent = `html[data-standup-snap] aside, html[data-standup-snap] [role="complementary"] { opacity: 0 !important; }`;
  document.head.appendChild(pageCss);

  // ---------- who is talking (beta) ----------
  // Meet's audio level indicator ([jsname="QgSmzd"], in video tiles and in People rows, also while the
  // panel is closed) changes its class with the voice level and keeps one class in silence. No class names
  // are relied on: we count changes per person. In a standup everyone but the speaker is muted, so the
  // speaker is the person whose indicator changes most; an unmuted person with background noise only takes
  // over when clearly more active than the current speaker.
  const RATE_MS = 2000;
  const MIN_CHANGES = 4; // changes within RATE_MS to count as talking
  const STILL_CURRENT_MS = 15000; // after the speaker stops, they stay "current" for a while (pauses, questions)
  const activity = new Map(); // name -> change timestamps within RATE_MS
  let currentSpeaker = null;
  function talkerOf(el) {
    const row = el.closest('[role="listitem"][aria-label]');
    if (row) return row.getAttribute('aria-label').replace(/\s*\((you|te|ön|вы|siz)\)\s*$/i, '').trim();
    const tile = el.closest('[data-participant-id]');
    if (!tile || !snap) return null;
    const text = tile.textContent || '';
    return snap.names.filter((n) => text.includes(n)).sort((a, b) => b.length - a.length)[0] || null;
  }
  const rate = (n, now) => (activity.get(n) || []).filter((t) => now - t < RATE_MS).length;
  let talkTick = null;
  new MutationObserver((ms) => {
    const now = Date.now();
    let seen = false;
    for (const m of ms) {
      if (m.target.getAttribute('jsname') !== 'QgSmzd') continue;
      const n = talkerOf(m.target);
      if (!n) continue;
      activity.set(n, [...(activity.get(n) || []).filter((t) => now - t < RATE_MS), now]);
      seen = true;
    }
    if (seen && !talkTick) talkTick = setTimeout(() => { talkTick = null; tick(); }, 300);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  function speakers(present) {
    const now = Date.now();
    const active = (present || []).map((n) => [n, rate(n, now)]).filter(([, r]) => r >= MIN_CHANGES).sort((a, b) => b[1] - a[1]);
    const curRate = currentSpeaker ? rate(currentSpeaker, now) : 0;
    if (active[0] && active[0][0] !== currentSpeaker && (curRate < MIN_CHANGES || active[0][1] > curRate * 1.5)) currentSpeaker = active[0][0];
    const lastSeen = currentSpeaker ? Math.max(0, ...(activity.get(currentSpeaker) || [])) : 0;
    if (currentSpeaker && (now - lastSeen > STILL_CURRENT_MS || !(present || []).includes(currentSpeaker))) currentSpeaker = null;
    return { talkingNow: active.map(([n]) => n), current: currentSpeaker };
  }

  // ---------- UI (Meet dark theme, Material 3) ----------
  const ICON = {
    voice: 'M9 13c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm6.08-7.95c.84 1.18.84 2.71 0 3.89l1.68 1.69c2.02-2.02 2.02-5.07 0-7.27l-1.68 1.69zM20.07 2l-1.63 1.63c2.77 3.02 2.77 7.56 0 10.74L20.07 16c3.9-3.89 3.91-9.95 0-14z',
    down: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
    check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    min: 'M19 13H5v-2h14v2z',
    flag: 'M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z',
    up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
    less: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z',
    more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    list: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
  };
  const svg = (d, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;

  const host = document.createElement('div');
  host.id = 'standup-turn-root';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: "Google Sans Text", "Google Sans", Roboto, Arial, sans-serif; margin: 0; }
      .wrap { position: fixed; z-index: 2147483000; left: 16px; top: 16px; color: #e3e3e3; -webkit-font-smoothing: antialiased; }
      .card { width: 296px; background: #1e1f20; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15);
              overflow: visible; }
      .top { display: flex; align-items: center; gap: 12px; padding: 12px 8px 12px 12px; }
      .av { width: 40px; height: 40px; border-radius: 50%; flex: none; display: grid; place-items: center; overflow: hidden;
            font: 500 18px "Google Sans", Roboto, sans-serif; color: #fff; }
      .av img { width: 100%; height: 100%; object-fit: cover; }
      .av.me { background: #004a77; color: #c2e7ff; }
      .txt { flex: 1; min-width: 0; }
      .lbl { font-size: 12px; line-height: 16px; color: #c4c7c5; letter-spacing: .1px; }
      .name { font: 500 16px/22px "Google Sans", Roboto, sans-serif; color: #e3e3e3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pos { flex: none; font-size: 12px; line-height: 16px; color: #c4c7c5; background: #333537; border-radius: 8px; padding: 4px 8px;
             font-variant-numeric: tabular-nums; }
      .icon-btn { flex: none; width: 32px; height: 32px; border-radius: 50%; border: 0; background: none; color: #c4c7c5;
                  display: grid; place-items: center; cursor: pointer; }
      .icon-btn:hover { background: rgba(227,227,227,.08); color: #e3e3e3; }
      .sep { height: 1px; background: #444746; margin: 0 12px; }
      .row { display: flex; align-items: center; gap: 8px; padding: 8px 12px 10px; color: #c4c7c5; font-size: 14px; position: relative; }
      .row .grow { flex: 1; }
      .dd { display: inline-flex; align-items: center; gap: 2px; height: 32px; padding: 0 6px 0 12px; border-radius: 8px;
            border: 1px solid #8e918f; background: none; color: #e3e3e3; font: 500 14px "Google Sans", Roboto, sans-serif; cursor: pointer;
            max-width: 170px; }
      .dd span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dd.empty { color: #a8c7fa; border-color: #444746; }
      .dd:hover { background: rgba(168,199,250,.08); }
      .menu { position: absolute; right: 12px; top: 44px; z-index: 2; min-width: 200px; max-height: 320px; overflow: auto; padding: 8px 0;
              background: #282a2c; border-radius: 4px; scrollbar-width: thin; scrollbar-color: #5f6368 transparent; box-shadow: 0 2px 6px 2px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.3); }
      .mi { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 16px 0 12px; font-size: 14px; color: #e3e3e3; cursor: pointer; }
      .mi:hover { background: rgba(227,227,227,.08); }
      .mi .ck { width: 20px; color: #a8c7fa; display: grid; place-items: center; }
      .mi.muted { color: #c4c7c5; }
      .msep { height: 1px; background: #444746; margin: 8px 0; }
      .toggle { width: 100%; border: 0; background: none; cursor: pointer; text-align: left; font: inherit; color: #c4c7c5; }
      .toggle:hover { background: rgba(227,227,227,.04); }
      .toggle:last-child { border-radius: 0 0 16px 16px; }
      .cnt { font-size: 12px; color: #c4c7c5; font-variant-numeric: tabular-nums; }
      .order { position: relative; list-style: none; padding: 0 0 8px; max-height: calc(100vh - 210px); overflow: auto; scrollbar-width: thin; scrollbar-color: #5f6368 transparent; }
      .order li { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px; font-size: 14px; color: #e3e3e3; }
      .order .num { width: 20px; text-align: right; font-size: 12px; color: #c4c7c5; font-variant-numeric: tabular-nums; flex: none; }
      .order .av.sm { width: 24px; height: 24px; font-size: 12px; }
      .order .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .order li.before .nm { font-weight: 500; }
      .order li.me { background: #004a77; color: #c2e7ff; }
      .order li.me .num { color: #c2e7ff; }
      .order .tag { flex: none; font-size: 11px; color: #a8c7fa; }
      .order .rb { flex: none; width: 28px; height: 28px; margin-right: -6px; border-radius: 50%; border: 0; background: none; color: #c4c7c5;
                   display: grid; place-items: center; cursor: pointer; visibility: hidden; }
      .order li:hover .rb, .order .rb:focus-visible { visibility: visible; }
      .order .rb:hover { background: rgba(227,227,227,.08); }
      .order li.me .rb { color: #c2e7ff; }
      .order li.grp { height: 28px; padding-left: 42px; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; color: #8e918f; }
      .order li.skipped .nm { color: #8e918f; }
      .order li.away { opacity: .45; }
      .order li.talking { box-shadow: inset 3px 0 0 #a8c7fa; }
      .now { display: flex; align-items: center; gap: 6px; margin: -6px 12px 10px 64px; font-size: 12px; line-height: 16px; color: #c4c7c5; }
      .now b { font-weight: 500; color: #a8c7fa; }
      .now.next { color: #a8c7fa; }
      .eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; flex: none; }
      .eq i { width: 3px; border-radius: 2px; background: #a8c7fa; animation: eq .9s ease-in-out infinite; }
      .eq i:nth-child(2) { animation-delay: -.3s; } .eq i:nth-child(3) { animation-delay: -.6s; }
      @keyframes eq { 0%, 100% { height: 3px; } 50% { height: 12px; } }
      .order li.away .tag { color: #c4c7c5; }
      .order li.opts { height: auto; flex-wrap: wrap; gap: 6px; padding: 2px 12px 8px 42px; }
      .chipbtn { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 8px;
                 border: 1px solid #8e918f; background: none; color: #e3e3e3; font: 500 12px "Google Sans", Roboto, sans-serif; cursor: pointer; }
      .chipbtn:hover { background: rgba(227,227,227,.08); }
      .chipbtn.on { background: #004a77; border-color: #004a77; color: #c2e7ff; }
      .order li.me .tag { color: #c2e7ff; }
      .upd { display: flex; align-items: center; gap: 6px; padding: 0 12px 12px; color: #a8c7fa; font-size: 12px; text-decoration: none; }
      a.upd:hover { text-decoration: underline; }
      .upd span { white-space: nowrap; }
      .upd.note span { white-space: normal; }
      .upd .link { margin-left: auto; white-space: nowrap; border: 0; background: none; color: #a8c7fa; font: 500 12px "Google Sans", Roboto, sans-serif;
                   cursor: pointer; padding: 4px 8px; border-radius: 8px; }
      .upd .link:hover { background: rgba(168,199,250,.08); }
      .upd.note { color: #c4c7c5; }
      .fab { width: 48px; height: 48px; border-radius: 50%; border: 0; background: #333537; color: #e3e3e3; cursor: pointer;
             display: grid; place-items: center; box-shadow: 0 1px 3px rgba(0,0,0,.3); position: relative; }
      .fab:hover { background: #3c3e40; }
      .fab .dot { position: absolute; right: 2px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: #a8c7fa; }
      .shimmer { height: 12px; border-radius: 6px; background: linear-gradient(90deg, #333537 25%, #3c3e40 50%, #333537 75%);
                 background-size: 200% 100%; animation: sh 1.2s infinite; }
      @keyframes sh { to { background-position: -200% 0; } }
    </style>
    <div class="wrap"></div>`;
  const wrap = root.querySelector('.wrap');
  document.body.appendChild(host);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const COLORS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#007b83', '#c5221f', '#b06000'];
  const color = (n) => COLORS[[...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
  function avatar(name, avatars, cls = '') {
    const src = avatars && avatars[name];
    if (src) return `<div class="av ${cls}"><img src="${esc(src)}" alt=""></div>`;
    return `<div class="av ${cls}" style="background:${color(name)}">${esc([...name][0].toUpperCase())}</div>`;
  }

  const ui = {
    min: localStorage.getItem('standup-min') === '1',
    menu: false,
    rowMenu: null, // name whose exception options are open in Today's order
    order: localStorage.getItem('standup-order') === '1',
    update: null,
    onDisk: null, // newer version already in the folder, not loaded yet
    reloaded: false,
    lastSig: '',
    callSeenAt: null,
    present: null,
    starter: null,
  };

  // Updates for the unpacked install: "Update available" from GitHub, then, once the new files are
  // in the folder (git pull / new ZIP), a button that reloads the extension (no chrome://extensions needed).
  // A Chrome Web Store install (update_url in the manifest) is updated by Chrome: nothing to do here.
  const ask = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (v) => res(chrome.runtime.lastError ? null : v)));
  let fromStore = false;
  try { fromStore = 'update_url' in chrome.runtime.getManifest(); } catch {}
  if (!fromStore) try {
    const current = chrome.runtime.getManifest().version;
    ask('latestVersion').then((latest) => {
      if (R.newerVersion(latest, current)) { ui.update = latest; ui.lastSig = ''; tick(); }
    });
    const checkDisk = async () => {
      const onDisk = await ask('diskVersion');
      if (R.newerVersion(onDisk, current) && ui.onDisk !== onDisk) { ui.onDisk = onDisk; ui.lastSig = ''; tick(); }
    };
    checkDisk();
    setInterval(checkDisk, 30 * 1000);
  } catch { // demo page: no chrome.runtime
    ui.update = globalThis.STANDUP_DEMO_UPDATE || null;
    ui.onDisk = globalThis.STANDUP_DEMO_ONDISK || null;
  }

  async function tick() {
    const c = code();
    const inCall = !!(c && peopleButton());
    host.style.display = inCall ? '' : 'none';
    if (!inCall) return;

    // read the list (hidden or not). Meet keeps the list in the page and up to date once People was opened,
    // so the panel is opened at most once per call: only when the list isn't in the page yet.
    // (The count on the People button can differ from the rows: "Merged audio" groups, presentations.)
    if (!snapping) {
      const list = readList();
      if (list.names.length) takeList(list);
      const missing = !list.names.length && !snap;
      if (missing && snapFails < 3 && !sidePanelOpen() && Date.now() - lastSnapAt > (snapFails ? RESNAP_MS : 1500)) snapshot().then(() => tick());
    }

    const present = snap ? snap.names : null;
    const me = (snap && snap.me) || myName;

    const t = today();

    // which team is this call: by link, otherwise by who is here (only once 3+ people are in,
    // so the first two people to join don't start a new team)
    if (!team || !team.codes.includes(c)) {
      team = R.findGroup(groups, c, present && present.length >= 3 ? present : null);
      if (!team && present && present.length >= 3) newTeam(c);
      if (team && !team.codes.includes(c)) team.codes.push(c);
      if (team) await saveGroups();
    }
    // remember everyone seen with this team (to step over days you miss), and when
    if (team && present && (present.some((n) => !team.known.includes(n)) || team.seen !== t)) {
      team.known = R.sortNames([...team.known, ...present]);
      team.seen = t;
      groups = R.mergeGroups(groups);
      team = groups.find((g) => g.codes.includes(c));
      await saveGroups();
    }

    const ex = exOf(team);
    const starter = R.starterToday(team && team.last, t, team ? team.known : [], present, ex);
    if (present && present.length >= 3 && !ui.callSeenAt) ui.callSeenAt = Date.now();
    if (starter && team.last.date < t && ui.callSeenAt && Date.now() - ui.callSeenAt >= AUTO_SAVE_MS) {
      team.last = { date: t, starter };
      await saveGroups();
    }

    const turn = present && me ? R.myTurn(present, me, starter, ex) : null;
    ui.present = present;
    ui.starter = starter;
    const talk = speakers(present);
    const sig = JSON.stringify([present, me, starter, turn, ex, talk, ui.update, ui.onDisk, ui.reloaded, ui.min, ui.menu, ui.order, ui.rowMenu, team && !!team.last, snap && snap.avatars]);
    if (sig === ui.lastSig) return;
    ui.lastSig = sig;
    render(present, me, starter, turn, ex, talk);
  }

  // Exceptions of the team: { last: [...], skip: [...] } (see R.speakingOrder)
  const exOf = (g) => ({ last: (g && g.ex && g.ex.last) || [], skip: (g && g.ex && g.ex.skip) || [] });
  async function setException(name, kind) { // kind: 'last' | 'skip' | null (back to normal)
    if (!team) newTeam(code());
    const ex = exOf(team);
    ex.last = ex.last.filter((n) => n !== name);
    ex.skip = ex.skip.filter((n) => n !== name);
    if (kind) ex[kind].push(name);
    team.ex = ex;
    await saveGroups();
  }

  function render(present, me, starter, turn, ex, talk) {
    if (ui.min) {
      wrap.innerHTML = `<button class="fab" data-a="expand" title="${esc(turn && turn.before ? 'You speak after ' + turn.before : 'Standup turn')}">
        ${svg(ICON.voice, 22)}${ui.update ? '<span class="dot"></span>' : ''}</button>`;
      return;
    }
    const avatars = snap && snap.avatars;
    let top;
    if (!present) {
      top = `<div class="av" style="background:#333537"></div>
        <div class="txt"><div class="lbl">Finding your turn…</div><div class="shimmer" style="width:140px;margin-top:6px"></div></div>`;
    } else if (!turn) {
      const msg = !me ? 'Can’t find you in the call' : ex.skip.includes(me) ? 'You’re not in the order' : 'Not enough people yet';
      top = `<div class="av" style="background:#333537;color:#c4c7c5">${svg(ICON.voice)}</div>
        <div class="txt"><div class="lbl">Standup turn</div><div class="name">${msg}</div></div>`;
    } else if (!turn.before && turn.end) {
      top = `${avatar(me, avatars, 'me')}
        <div class="txt"><div class="lbl">Your turn</div><div class="name">You speak at the end</div></div>`;
    } else if (!turn.before) {
      top = `${avatar(me, avatars, 'me')}
        <div class="txt"><div class="lbl">Your turn</div><div class="name">You start today</div></div>`;
    } else {
      top = `${avatar(turn.before, avatars)}
        <div class="txt"><div class="lbl">You speak after</div><div class="name" title="${esc(turn.before)}">${esc(turn.before)}</div></div>
        ${turn.position ? `<span class="pos" title="Your place in today's order">${turn.position} of ${turn.total}</span>` : ''}`;
    }
    // live progress: who is speaking and how many are left before you
    let now = '';
    if (present && turn && talk.current) {
      const order = R.speakingOrder(present, starter, ex);
      const cur = order.indexOf(talk.current), mine = order.indexOf(me);
      const live = talk.talkingNow.includes(talk.current);
      const who = talk.current === me ? 'You’re speaking' : `${esc(talk.current.split(' ')[0])} ${live ? 'is speaking' : 'spoke last'}`;
      let left = '';
      if (talk.current !== me && cur > -1 && mine > cur) left = mine - cur === 1 ? ' · <b>you’re next</b>' : ` · ${mine - cur - 1} before you`;
      now = `<div class="now${left.includes('next') ? ' next' : ''}">${live ? '<span class="eq"><i></i><i></i><i></i></span>' : ''}${who}${left}</div>`;
    }

    let row = '';
    if (present) {
      const menu = ui.menu ? `<div class="menu" role="menu">
          ${present.filter((n) => !ex.last.includes(n) && !ex.skip.includes(n)).map((n) => `<div class="mi${n === starter ? ' sel' : ''}" role="menuitem" data-a="pick" data-n="${esc(n)}"><span class="ck">${n === starter ? svg(ICON.check) : ''}</span>${esc(n)}</div>`).join('')}
          ${team && team.last ? `<div class="msep"></div><div class="mi muted" role="menuitem" data-a="clear"><span class="ck"></span>Don’t track who starts</div>` : ''}
        </div>` : '';
      row = `<div class="sep"></div>
        <div class="row">${svg(ICON.flag, 18)}<span class="grow">Today starts</span>
          <button class="dd ${starter ? '' : 'empty'}" data-a="menu" title="Pick who starts today; the next days follow alphabetically">
            <span>${starter ? esc(starter) : 'Choose'}</span>${svg(ICON.down, 18)}</button>${menu}</div>`;

      // numbered speaking order: starter first (A–Z when nobody is chosen), "last" people at the end,
      // people "not in standup" listed apart; ⋮ on a row sets these exceptions
      const order = R.speakingOrder(present, starter, ex);
      const skipped = present.filter((n) => ex.skip.includes(n));
      // teammates who aren't in the call: shown greyed in their place, without a number
      const absent = team ? team.known.filter((n) => !present.includes(n) && !ex.skip.includes(n)) : [];
      const full = absent.length ? R.speakingOrder([...present, ...absent], starter, ex) : order;
      let num = 0;
      const before = turn && turn.before;
      const opts = (n) => ui.rowMenu !== n ? '' : `<li class="opts">
          <button class="chipbtn${ex.last.includes(n) ? ' on' : ''}" data-a="ex" data-k="last" data-n="${esc(n)}" title="Leads the meeting or always goes last; never starts">${ex.last.includes(n) ? svg(ICON.check, 16) : ''}Speaks last</button>
          <button class="chipbtn${ex.skip.includes(n) ? ' on' : ''}" data-a="ex" data-k="skip" data-n="${esc(n)}" title="Guest or observer: left out of the order">${ex.skip.includes(n) ? svg(ICON.check, 16) : ''}Not in standup</button></li>`;
      const rowMenuBtn = (n) => `<button class="rb" data-a="rowmenu" data-n="${esc(n)}" title="Exceptions for ${esc(n)}">${svg(ICON.more, 18)}</button>`;
      const firstEnd = full.findIndex((n) => ex.last.includes(n));
      const items = !ui.order ? '' : `<ol class="order">${full.map((n, i) => {
          const away = !present.includes(n);
          return `${i === firstEnd ? '<li class="grp">At the end</li>' : ''}
          <li class="${n === me ? 'me' : ''}${n === before ? ' before' : ''}${away ? ' away' : ''}${talk.talkingNow.includes(n) ? ' talking' : ''}" ${away ? 'title="Not in the call"' : ''}>
            <span class="num">${away ? '' : ++num}</span>${avatar(n, avatars, 'sm')}<span class="nm" title="${esc(n)}">${esc(n)}</span>
            ${talk.talkingNow.includes(n) ? '<span class="eq" title="Speaking"><i></i><i></i><i></i></span>' : ''}
            ${n === me ? '<span class="tag">You</span>' : n === before ? '<span class="tag">before you</span>' : away ? '<span class="tag">not here</span>' : ''}${rowMenuBtn(n)}</li>${opts(n)}`;
        }).join('')}
          ${skipped.length ? '<li class="grp">Not in standup</li>' + skipped.map((n) => `
          <li class="skipped"><span class="num"></span>${avatar(n, avatars, 'sm')}<span class="nm" title="${esc(n)}">${esc(n)}</span>${rowMenuBtn(n)}</li>${opts(n)}`).join('') : ''}
        </ol>`;
      row += `<div class="sep"></div>
        <button class="row toggle" data-a="order" aria-expanded="${ui.order}">${svg(ICON.list, 18)}
          <span class="grow">${starter ? 'Today’s order' : 'Order A–Z'}</span><span class="cnt">${order.length}</span>
          ${svg(ui.order ? ICON.less : ICON.down, 18)}</button>${items}`;
    }
    const upd = ui.reloaded
      ? `<div class="upd note">${svg(ICON.up, 16)}<span>Updated. Refresh this tab to use the new version.</span></div>`
      : ui.onDisk
        ? `<div class="upd">${svg(ICON.up, 16)}<span>${esc(ui.onDisk)} downloaded</span>
             <button class="link" data-a="reload" title="Load the new files (same as ↻ in chrome://extensions)">Reload extension</button></div>`
        : ui.update
          ? `<a class="upd" href="https://github.com/ibro-makhmudov/meet-standup-turn#update" target="_blank"
               title="Get the new files (git pull or the ZIP link), then come back here">${svg(ICON.up, 16)}Update ${esc(ui.update)} available</a>`
          : '';

    wrap.innerHTML = `<div class="card">
        <div class="top">${top}<button class="icon-btn" data-a="min" title="Minimize">${svg(ICON.min)}</button></div>${now}
        ${row}${upd}</div>`;
    const sel = root.querySelector('.menu .sel');
    if (sel) sel.parentElement.scrollTop = sel.offsetTop - 8;
    // scroll the order only if you are below the fold, keeping the person before you visible
    const mine = root.querySelector('.order .me');
    if (mine) {
      const list = mine.parentElement;
      const bottom = mine.offsetTop + mine.offsetHeight + 8;
      list.scrollTop = bottom > list.clientHeight ? bottom - list.clientHeight : 0;
    }
  }

  // ---------- events ----------
  wrap.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    e.stopPropagation();
    const a = el.dataset.a;
    if (a === 'min' || a === 'expand') {
      ui.min = a === 'min';
      ui.menu = false;
      localStorage.setItem('standup-min', ui.min ? '1' : '0');
    } else if (a === 'menu') {
      ui.menu = !ui.menu;
    } else if (a === 'reload') {
      ui.reloaded = true;
      ui.lastSig = '';
      await tick(); // show the note first: after the reload this script is cut off from the extension
      chrome.runtime.sendMessage('reloadExtension');
      return;
    } else if (a === 'rowmenu') {
      ui.rowMenu = ui.rowMenu === el.dataset.n ? null : el.dataset.n;
    } else if (a === 'ex') {
      const n = el.dataset.n, k = el.dataset.k;
      await setException(n, exOf(team)[k].includes(n) ? null : k);
      ui.rowMenu = null;
    } else if (a === 'order') {
      ui.order = !ui.order;
      localStorage.setItem('standup-order', ui.order ? '1' : '0');
    } else if (a === 'pick') {
      if (!team) newTeam(code());
      team.last = { date: today(), starter: el.dataset.n };
      ui.menu = false;
      await saveGroups();
    } else if (a === 'clear') {
      if (team) team.last = null;
      ui.menu = false;
      await saveGroups();
    }
    ui.lastSig = '';
    tick();
  });
  // close the menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (ui.menu && !e.composedPath().includes(host)) { ui.menu = false; ui.lastSig = ''; tick(); }
  }, true);

  tick();
  setInterval(tick, 1500);
})();
