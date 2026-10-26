// Updates for the unpacked install (messages from the card and the popup):
// - latestVersion / checkNow: the version number (data, not code) in the repository's manifest.json,
//   cached for 6 hours; checkNow skips the cache
// - diskVersion: the version in the extension folder (after git pull / new ZIP, before Chrome reloads it)
// - status: all of the above at once, for the popup
// - reloadExtension: makes Chrome load the new files, instead of pressing ↻ in chrome://extensions
// The toolbar icon gets a "↑" badge while an update is waiting.
// Installed from the Chrome Web Store (Chrome adds update_url to the manifest), Chrome updates the
// extension itself: then none of this runs and no request goes to GitHub.
importScripts('rotation.js');
const FROM_STORE = 'update_url' in chrome.runtime.getManifest();

const REPO_MANIFEST = 'https://raw.githubusercontent.com/ibro-makhmudov/meet-standup-turn/main/manifest.json';
const EVERY_MS = 6 * 60 * 60 * 1000;
const current = chrome.runtime.getManifest().version;

async function latestVersion(force = false) {
  const { updateCheck } = await chrome.storage.local.get('updateCheck');
  if (!force && updateCheck && Date.now() - updateCheck.at < EVERY_MS) return updateCheck.version;
  try {
    const res = await fetch(REPO_MANIFEST, { cache: 'no-store' });
    const version = (await res.json()).version;
    await chrome.storage.local.set({ updateCheck: { at: Date.now(), version } });
    return version;
  } catch {
    return updateCheck ? updateCheck.version : null;
  }
}

async function diskVersion() {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    return (await res.json()).version;
  } catch {
    return null;
  }
}

async function status(force = false) {
  if (FROM_STORE) return { current, store: true };
  const [latest, disk] = await Promise.all([latestVersion(force), diskVersion()]);
  const { updateCheck } = await chrome.storage.local.get('updateCheck');
  const waiting = StandupRotation.newerVersion(disk, current) || StandupRotation.newerVersion(latest, current);
  chrome.action.setBadgeText({ text: waiting ? '↑' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0b57d0' });
  return { current, latest, disk, checkedAt: updateCheck ? updateCheck.at : null };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === 'reloadExtension') { chrome.runtime.reload(); return false; }
  if (FROM_STORE && (msg === 'latestVersion' || msg === 'diskVersion')) { reply(null); return false; }
  const job = msg === 'latestVersion' ? latestVersion()
    : msg === 'diskVersion' ? diskVersion()
    : msg === 'status' ? status()
    : msg === 'checkNow' ? status(true)
    : null;
  if (!job) return false;
  job.then(reply);
  return true; // async reply
});

// keep the badge fresh without a Meet tab open
if (!FROM_STORE) chrome.alarms.create('update-check', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'update-check') status(); });
chrome.runtime.onStartup.addListener(() => status());
chrome.runtime.onInstalled.addListener(() => status());
