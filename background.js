// Update check for the unpacked install: reads the version number (data, not code)
// from the repository's manifest.json at most every 6 hours.
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

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg !== 'latestVersion') return false;
  latestVersion().then(reply);
  return true; // async reply
});
