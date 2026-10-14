# Publishing and updating

## First release
1. Register a Chrome Web Store developer account (one-time $5): https://chrome.google.com/webstore/devconsole
2. `./pack.sh` → upload `dist/meet-standup-turn-<version>.zip` (New item).
3. Fill the tabs using `store/listing.md` (store listing, privacy practices, distribution = Unlisted).
4. Submit for review. Review usually takes from a few hours to a few days.
5. Share the store link with the team. Anyone who installed the unpacked folder should remove it and install from the store.

## Updates (teammates get them automatically)
1. Change the code, bump `version` in `manifest.json` (e.g. 1.0.0 → 1.0.1).
2. `./pack.sh` → dashboard → the item → Package → Upload new package → Submit for review.
3. After approval Chrome updates installed copies by itself within a few hours.
