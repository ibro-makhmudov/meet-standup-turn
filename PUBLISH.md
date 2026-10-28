# Publishing to the Chrome Web Store

The extension is published as **Unlisted**: it isn't in search, anyone with the link can install it,
and Chrome updates installed copies by itself. Copies loaded from source (unpacked) keep working
and keep their GitHub update check; a store copy skips it (it has `update_url` in its manifest).

## 1. Developer account (once, done by the account owner)

1. Open https://chrome.google.com/webstore/devconsole and sign in with the Google account that will own the item.
2. Accept the developer agreement and pay the one-time **$5** registration fee (allows up to 20 items).
3. Account tab: publisher name, contact email (shown on the listing), verify the email.
4. Trader declaration (EU): **non-trader**.

## 2. First upload

1. `./pack.sh` (runs the tests) → `dist/meet-standup-turn-<version>.zip`.
2. Dashboard → **New item** → upload the zip.
3. Fill the tabs from [store/listing.md](store/listing.md): Store listing, Privacy practices, Distribution = **Unlisted**.
4. **Submit for review.** Usually a few hours to a few days.

## 3. After it is approved

1. Copy the item link (`https://chromewebstore.google.com/detail/<id>`).
2. README: add it at the top of **Install** (text below) and push.
3. Tell the team: remove the unpacked copy (`chrome://extensions` → Remove), install from the link.
   A store copy has a different extension ID, so its saved data starts empty: pick today's starter and
   set the exceptions once more.

README text for **Install**:

```markdown
**From the Chrome Web Store (recommended, updates itself):** [Meet Standup Turn](https://chromewebstore.google.com/detail/<id>) → **Add to Chrome**.

Developers can also load it from source, see below.
```

Short link: https://ibro-makhmudov.github.io/meet-standup-turn (GitHub Pages from `docs/`,
`docs/index.html` forwards to the store; the store itself has no custom URLs).

## 4. Updates

1. Change the code, bump `version` in `manifest.json`.
2. `./pack.sh` → dashboard → the item → **Package** → **Upload new package** → **Submit for review**.
3. After approval Chrome updates installed copies by itself within a few hours.
4. Push to GitHub too: unpacked copies get the "Update available" notice from there.
