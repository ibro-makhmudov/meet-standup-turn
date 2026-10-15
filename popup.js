// Toolbar popup: update status, the standups (teams) the extension knows, who you are in Meet.
const R = globalThis.StandupRotation;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (d) => R.parse(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ZIP = 'https://github.com/ibro-makhmudov/meet-standup-turn/archive/refs/heads/main.zip';
const ICON = {
  ok: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
};
const svg = (d, cls = '') => `<svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;

// Outside the extension (popup.html opened over http for development) use made-up data: ?demo=available|downloaded
const DEMO = !(globalThis.chrome && chrome.runtime && chrome.runtime.id);
const demo = new URLSearchParams(location.search).get('demo') || 'uptodate';
const send = (msg) => DEMO
  ? Promise.resolve({ current: '1.2.2', latest: demo === 'available' ? '1.3.0' : '1.2.2', disk: demo === 'downloaded' ? '1.3.0' : '1.2.2', checkedAt: Date.now() - 42 * 60000 })
  : new Promise((res) => chrome.runtime.sendMessage(msg, (v) => res(chrome.runtime.lastError ? null : v)));
const store = {
  get: (keys) => (DEMO ? Promise.resolve(demoData()) : chrome.storage.local.get(keys)),
  set: (obj) => (DEMO ? Promise.resolve() : chrome.storage.local.set(obj)),
};
function demoData() {
  const known = ['Ádám Kovács', 'Anna Tóth', 'Balázs Nagy', 'Dávid Szabó', 'David Varga', 'Imre Fekete', 'Krisztina Hegedűs', 'Lili Simon', 'Márk Molnár', 'Nóra Pap', 'Péter Lakatos'];
  return { me: 'Imre Fekete', groups: [{ id: 'd', codes: ['abc-defg-hij', 'xyz-wxyz-xyz'], known, last: { date: R.ymd(new Date()), starter: 'Nóra Pap' }, seen: R.ymd(new Date()) }] };
}

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

function renderUpdate(st, checking) {
  $('ver').textContent = st ? 'v' + st.current : '';
  const box = $('update');
  if (!st) { box.innerHTML = '<div class="empty">Can’t read the version.</div>'; return; }
  const newer = (v) => R.newerVersion(v, st.current);
  if (newer(st.disk)) {
    box.innerHTML = `<div class="status"><span class="up">${svg(ICON.up)}</span>
        <div class="grow"><div class="main">${esc(st.disk)} is downloaded</div><div class="sub">Reload to start using it</div></div>
        <button class="btn filled" id="reload">Reload extension</button></div>
      <div class="steps">After reloading, refresh your Meet tab (after the call if you’re in one).</div>`;
    $('reload').onclick = () => { if (!DEMO) chrome.runtime.sendMessage('reloadExtension'); window.close(); };
  } else if (newer(st.latest)) {
    box.innerHTML = `<div class="status"><span class="up">${svg(ICON.up)}</span>
        <div class="grow"><div class="main">Update ${esc(st.latest)} available</div><div class="sub">You have ${esc(st.current)}</div></div></div>
      <div class="steps"><ol>
        <li>Get the new files into the extension folder:<br>
          with git: <code>git pull</code> in the folder,<br>
          or <a href="${ZIP}" target="_blank">download the ZIP</a> and replace the files.</li>
        <li>Open this window again and click <b>Reload extension</b>.</li>
      </ol></div>`;
  } else {
    box.innerHTML = `<div class="status"><span class="ok">${svg(ICON.ok)}</span>
        <div class="grow"><div class="main">Up to date</div><div class="sub">${st.checkedAt ? 'Checked ' + ago(st.checkedAt) : 'Not checked yet'}</div></div>
        <button class="btn text" id="check" ${checking ? 'disabled' : ''}>${checking ? svg(ICON.sync, 'spin') : 'Check now'}</button></div>`;
    $('check').onclick = async () => { renderUpdate(st, true); renderUpdate(await send('checkNow'), false); };
  }
}

function teamCard(g, today) {
  const nextDay = (() => { let d = R.addDays(today, 1); while (!R.isWeekday(d)) d = R.addDays(d, 1); return d; })();
  const todays = R.starterToday(g.last, today, g.known, null);
  const next = todays && R.isWeekday(today)
    ? R.starterToday({ date: today, starter: todays }, nextDay, g.known, null)
    : R.starterToday(g.last, nextDay, g.known, null);
  const recorded = g.last && g.last.date === today;
  const starterRows = g.last
    ? `<dt>${R.isWeekday(today) ? 'Today' : fmt(today)}</dt><dd title="${recorded ? 'Picked or saved today' : 'Worked out from ' + esc(fmt(g.last.date))}">${esc(todays || '—')}</dd>
       <dt>${fmt(nextDay)}</dt><dd>${esc(next || '—')}</dd>`
    : `<dt>Who starts</dt><dd style="font-weight:400">not tracked · pick it in the Meet card</dd>`;
  return `<div class="box team" data-id="${esc(g.id)}">
      <div class="row"><span class="grow title">Standup · ${g.known.length} people</span><span class="meta">${g.seen ? 'last call ' + esc(fmt(g.seen)) : ''}</span></div>
      <dl class="kv">${starterRows}</dl>
      <div class="chips">${g.codes.map((c) => `<a class="chip" href="https://meet.google.com/${esc(c)}" target="_blank" title="Open this Meet link">${esc(c)}</a>`).join('')}</div>
      <details><summary>People seen (${g.known.length})</summary><p>${g.known.map(esc).join(', ')}</p></details>
      <div class="actions">
        ${g.last ? '<button class="btn text" data-a="clear">Stop tracking who starts</button>' : ''}
        <button class="btn text" data-a="forget">Forget</button>
      </div></div>`;
}

async function renderTeams() {
  const { groups = [], me } = await store.get(['groups', 'me']);
  const today = R.ymd(new Date());
  const list = [...groups].sort((a, b) => (b.seen || '').localeCompare(a.seen || ''));
  $('teams').innerHTML = list.length
    ? list.map((g) => teamCard(g, today)).join('')
    : '<div class="box empty">Nothing yet. Join your standup in Google Meet: the team is remembered once 3 or more people are in the call.</div>';
  $('meSection').hidden = !me;
  $('me').textContent = me || '';
}

$('teams').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const id = b.closest('.team').dataset.id;
  const { groups = [] } = await store.get('groups');
  const g = groups.find((x) => x.id === id);
  if (!g) return;
  if (b.dataset.a === 'clear') g.last = null;
  if (b.dataset.a === 'forget' && !confirm('Forget this standup? Who started and the people seen will be removed.')) return;
  await store.set({ groups: b.dataset.a === 'forget' ? groups.filter((x) => x.id !== id) : groups });
  renderTeams();
});

send('status').then((st) => renderUpdate(st, false));
renderTeams();
