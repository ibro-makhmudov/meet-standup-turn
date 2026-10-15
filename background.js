// Updates for the unpacked install:
// - latestVersion: reads the version number (data, not code) from the repository's manifest.json, at most every 6 hours
// - diskVersion: the version in the extension folder (after git pull / new ZIP, before Chrome reloads it)
// - reloadExtension: makes Chrome load the new files, instead of pressing ↻ in chrome://extensions
const REPO_MANIFEST = 'https://raw.githubusercontent.com/ibro-makhmudov/meet-standup-turn/main/manifest.json';
const EVERY_MS = 6 * 60 * 60 * 1000;

async function latestVersion() {
  const { updateCheck } = await chrome.storage.local.get('updateCheck');
  if (updateCheck && Date.now() - updateCheck.at < EVERY_MS) return updateCheck.version;
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

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === 'reloadExtension') { chrome.runtime.reload(); return false; }
  const job = msg === 'latestVersion' ? latestVersion() : msg === 'diskVersion' ? diskVersion() : null;
  if (!job) return false;
  job.then(reply);
  return true; // async reply
});
