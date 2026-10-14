// Card in Google Meet: "You speak after X" and (optionally) "Today starts: Y".
// Names come from Meet's People panel. When the panel is closed, the extension opens it for a
// moment on joining (and when the number of people changes), reads the list and closes it again.
// Remembers per meeting link only: who started last time and the names seen in that meeting.
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
    || (globalThis.STANDUP_DEMO ? 'demo' : null);
  const today = () => (globalThis.STANDUP_TODAY || R.ymd(new Date()));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let meeting = null; // { code, known: [], last: {date, starter} | null }
  async function loadMeeting(c) {
    const m = (await get('meet:' + c)) || {};
    meeting = { code: c, known: m.known || [], last: m.last || null };
  }
  const saveMeeting = () => set('meet:' + meeting.code, { known: meeting.known, last: meeting.last });
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
  function peopleCount() {
    const b = peopleButton();
    const m = b && (b.textContent || '').match(/\d+/);
    return m ? +m[0] : null;
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
      const name = label.replace(/\s*\((you|te|ön|вы|siz)\)\s*$/i, '').trim();
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
  let snapCount = null; // people count when we last opened the panel

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
    snapCount = peopleCount();
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

  // ---------- UI (Meet dark theme, Material 3) ----------
  const ICON = {
    voice: 'M9 13c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm6.08-7.95c.84 1.18.84 2.71 0 3.89l1.68 1.69c2.02-2.02 2.02-5.07 0-7.27l-1.68 1.69zM20.07 2l-1.63 1.63c2.77 3.02 2.77 7.56 0 10.74L20.07 16c3.9-3.89 3.91-9.95 0-14z',
    down: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
    check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    min: 'M19 13H5v-2h14v2z',
    flag: 'M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z',
    up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
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
      .upd { display: flex; align-items: center; gap: 6px; padding: 0 12px 12px; color: #a8c7fa; font-size: 12px; text-decoration: none; }
      .upd:hover { text-decoration: underline; }
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
    update: null,
    lastSig: '',
    callSeenAt: null,
    present: null,
    starter: null,
  };

  // "Update available" for people who installed from the git folder
  try {
    const current = chrome.runtime.getManifest().version;
    chrome.runtime.sendMessage('latestVersion', (latest) => {
      if (chrome.runtime.lastError) return;
      if (R.newerVersion(latest, current)) { ui.update = latest; ui.lastSig = ''; tick(); }
    });
  } catch {} // demo page: no chrome.runtime

  async function tick() {
    const c = code();
    const inCall = !!(c && peopleButton());
    host.style.display = inCall ? '' : 'none';
    if (!inCall) return;
    if (!meeting || meeting.code !== c) await loadMeeting(c);

    // read the list (hidden or not); open the panel only when Meet hasn't rendered it yet,
    // or when the number of people no longer matches and the count changed since our last try
    if (!snapping) {
      const list = readList();
      const count = peopleCount();
      if (list.names.length) takeList(list);
      const missing = !list.names.length || (count != null && count !== list.rows && count !== snapCount);
      const wait = snap || snapFails ? RESNAP_MS : 1500;
      if (missing && snapFails < 3 && !sidePanelOpen() && Date.now() - lastSnapAt > wait) snapshot().then(() => tick());
    }

    const present = snap ? snap.names : null;
    const me = (snap && snap.me) || myName;

    // remember everyone seen in this meeting (to step over days you miss)
    if (present && present.some((n) => !meeting.known.includes(n))) {
      meeting.known = R.sortNames([...meeting.known, ...present]);
      await saveMeeting();
    }

    const t = today();
    const starter = R.starterToday(meeting.last, t, meeting.known, present);
    if (present && present.length >= 3 && !ui.callSeenAt) ui.callSeenAt = Date.now();
    if (starter && meeting.last.date < t && ui.callSeenAt && Date.now() - ui.callSeenAt >= AUTO_SAVE_MS) {
      meeting.last = { date: t, starter };
      await saveMeeting();
    }

    const turn = present && me ? R.myTurn(present, me, starter) : null;
    ui.present = present;
    ui.starter = starter;
    const sig = JSON.stringify([present, me, starter, turn, ui.update, ui.min, ui.menu, snap && snap.avatars]);
    if (sig === ui.lastSig) return;
    ui.lastSig = sig;
    render(present, me, starter, turn);
  }

  function render(present, me, starter, turn) {
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
      top = `<div class="av" style="background:#333537;color:#c4c7c5">${svg(ICON.voice)}</div>
        <div class="txt"><div class="lbl">Standup turn</div><div class="name">${me ? 'Not enough people yet' : 'Can’t find you in the call'}</div></div>`;
    } else if (!turn.before) {
      top = `${avatar(me, avatars, 'me')}
        <div class="txt"><div class="lbl">Your turn</div><div class="name">You start today</div></div>`;
    } else {
      top = `${avatar(turn.before, avatars)}
        <div class="txt"><div class="lbl">You speak after</div><div class="name" title="${esc(turn.before)}">${esc(turn.before)}</div></div>
        ${turn.position ? `<span class="pos" title="Your place in today's order">${turn.position} of ${turn.total}</span>` : ''}`;
    }

    let row = '';
    if (present) {
      const menu = ui.menu ? `<div class="menu" role="menu">
          ${present.map((n) => `<div class="mi" role="menuitem" data-a="pick" data-n="${esc(n)}"><span class="ck">${n === starter ? svg(ICON.check) : ''}</span>${esc(n)}</div>`).join('')}
          ${meeting.last ? `<div class="msep"></div><div class="mi muted" role="menuitem" data-a="clear"><span class="ck"></span>Don’t track who starts</div>` : ''}
        </div>` : '';
      row = `<div class="sep"></div>
        <div class="row">${svg(ICON.flag, 18)}<span class="grow">Today starts</span>
          <button class="dd ${starter ? '' : 'empty'}" data-a="menu" title="Pick who starts today; the next days follow alphabetically">
            <span>${starter ? esc(starter) : 'Choose'}</span>${svg(ICON.down, 18)}</button>${menu}</div>`;
    }
    const upd = ui.update
      ? `<a class="upd" href="https://github.com/ibro-makhmudov/meet-standup-turn#update" target="_blank"
           title="In the extension folder run git pull, then press ↻ on the extension in chrome://extensions">${svg(ICON.up, 16)}Update ${esc(ui.update)} available</a>`
      : '';

    wrap.innerHTML = `<div class="card">
        <div class="top">${top}<button class="icon-btn" data-a="min" title="Minimize">${svg(ICON.min)}</button></div>
        ${row}${upd}</div>`;
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
    } else if (a === 'pick') {
      meeting.last = { date: today(), starter: el.dataset.n };
      ui.menu = false;
      await saveMeeting();
    } else if (a === 'clear') {
      meeting.last = null;
      ui.menu = false;
      await saveMeeting();
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
