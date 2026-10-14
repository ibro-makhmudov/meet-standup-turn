// Small chip in Google Meet: "You speak after X" and (optionally) "Today starts: Y".
// Reads names from Meet's People panel. Remembers per meeting link only: who started last
// time and the names seen in that meeting.
(async function () {
  const R = globalThis.StandupRotation;
  if (!R || document.getElementById('standup-turn-root')) return;

  const AUTO_SAVE_MS = 3 * 60 * 1000; // remember today's starter after the call has run a bit

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

  let meeting = null; // { code, known: [], last: {date, starter} | null }
  async function loadMeeting(c) {
    const m = (await get('meet:' + c)) || {};
    meeting = { code: c, known: m.known || [], last: m.last || null };
  }
  const saveMeeting = () => set('meet:' + meeting.code, { known: meeting.known, last: meeting.last });

  // ---------- reading Meet's People panel ----------
  const YOU = /\s*\((you|te|ön|вы|siz)\)\s*$/i;
  let cached = { names: [], me: null };

  function scan() {
    const names = [];
    let me = null;
    for (const el of document.querySelectorAll('[role="listitem"][aria-label]')) {
      const label = el.getAttribute('aria-label').trim();
      const name = label.replace(YOU, '').trim();
      if (!name || name.length > 80) continue;
      names.push(name);
      if (YOU.test(label) || /\((you|te|ön|вы|siz)\)/i.test(el.innerText || '')) me = name;
    }
    if (names.length) cached = { names: R.sortNames(names), me: me || cached.me };
    return cached;
  }

  // ---------- UI ----------
  const host = document.createElement('div');
  host.id = 'standup-turn-root';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: "Google Sans", Roboto, Arial, sans-serif; }
      .chip { position: fixed; z-index: 2147483000; left: 16px; top: 16px; background: #3c4043; color: #e8eaed;
              border-radius: 14px; padding: 8px 12px; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,.45);
              display: flex; flex-direction: column; gap: 4px; max-width: 320px; }
      .turn b { color: #8ab4f8; font-weight: 500; }
      .pos { color: #9aa0a6; font-size: 12px; }
      .start { display: flex; align-items: center; gap: 6px; color: #9aa0a6; font-size: 12px; }
      select { background: transparent; color: #e8eaed; border: 0; border-bottom: 1px dashed #5f6368; font: inherit;
               font-size: 12px; padding: 0 2px; cursor: pointer; max-width: 200px; }
      select option { background: #3c4043; }
      button { background: none; border: 0; color: #e8eaed; font: inherit; cursor: pointer; padding: 0; }
      button:hover { color: #8ab4f8; }
      .upd { color: #fdd663; font-size: 12px; text-decoration: none; }
      .upd:hover { text-decoration: underline; }
    </style>
    <div class="chip"></div>`;
  const chip = root.querySelector('.chip');
  document.body.appendChild(host);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const firstName = (n) => esc(String(n).split(' ')[0]);

  let callSeenAt = null;
  let lastSig = '';

  // "Update available" for people who installed from the git folder
  let update = null;
  try {
    const current = chrome.runtime.getManifest().version;
    chrome.runtime.sendMessage('latestVersion', (latest) => {
      if (chrome.runtime.lastError) return;
      if (R.newerVersion(latest, current)) { update = latest; lastSig = ''; tick(); }
    });
  } catch {} // demo page: no chrome.runtime

  async function tick() {
    const c = code();
    host.style.display = c ? '' : 'none';
    if (!c) return;
    if (!meeting || meeting.code !== c) await loadMeeting(c);

    const { names, me } = scan();
    const present = names.length ? names : null;

    // remember everyone seen in this meeting (to step over days you miss)
    if (present && present.some((n) => !meeting.known.includes(n))) {
      meeting.known = R.sortNames([...meeting.known, ...present]);
      await saveMeeting();
    }

    const t = today();
    const starter = R.starterToday(meeting.last, t, meeting.known, present);
    if (present && present.length >= 3 && !callSeenAt) callSeenAt = Date.now();
    if (starter && meeting.last.date < t && callSeenAt && Date.now() - callSeenAt >= AUTO_SAVE_MS) {
      meeting.last = { date: t, starter };
      await saveMeeting();
    }

    const turn = present && me ? R.myTurn(present, me, starter) : null;
    const sig = JSON.stringify([present, me, starter, turn, update]);
    if (sig === lastSig) return;
    lastSig = sig;
    render(present, me, starter, turn);
  }

  function render(present, me, starter, turn) {
    const upd = update
      ? `<a class="upd" href="https://github.com/ibro-makhmudov/meet-standup-turn#update" target="_blank"
           title="In the extension folder run: git pull, then press ↻ on the extension in chrome://extensions">⬆ Update ${esc(update)} available</a>`
      : '';
    if (!present) {
      chip.innerHTML = '<button data-a="people">👥 Show my turn</button>' + upd;
      return;
    }
    let line;
    if (!turn) line = me ? 'Not enough people yet' : 'Can’t find you in the People list';
    else if (!turn.before) line = '🎤 <b>You start</b>';
    else line = `🎤 You speak after <b>${esc(turn.before)}</b>`;
    const pos = turn && turn.position ? `<span class="pos"> · ${turn.position} of ${turn.total}</span>` : '';

    const options = present.map((n) => `<option value="${esc(n)}" ${n === starter ? 'selected' : ''}>${esc(n)}</option>`);
    if (!starter) options.unshift('<option value="" selected>who? (optional)</option>');
    chip.innerHTML = `
      <div class="turn">${line}${pos}</div>
      <label class="start">Today starts <select data-a="starter" title="Pick who starts today; next days follow alphabetically">${options.join('')}</select></label>${upd}`;
  }

  // Meet's People button; labels differ by UI language.
  function openPeople() {
    const btn = [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')]
      .find((b) => /^(people|show everyone|személyek|résztvevők|участники|люди)\b/i.test(b.getAttribute('aria-label')));
    if (btn) btn.click();
  }

  chip.addEventListener('click', (e) => {
    if (e.target.closest('[data-a="people"]')) { openPeople(); setTimeout(tick, 800); }
  });
  chip.addEventListener('change', async (e) => {
    if (e.target.dataset.a !== 'starter' || !e.target.value) return;
    meeting.last = { date: today(), starter: e.target.value };
    await saveMeeting();
    lastSig = '';
    tick();
  });

  tick();
  setInterval(tick, 1500);
})();
