# Meet Standup Turn

For standups in Google Meet where people speak in **alphabetical order**.
Meet always lists you first, so it is hard to see when your turn is. This extension shows a small chip in the call:

- **🎤 You speak after David** — the person alphabetically before you among the people in the call.
- **Today starts: Péter** (optional) — pick it once; on later days the next person alphabetically starts.
  People not in the call are skipped; weekends don't count. With a starter set you also see your position ("8 of 12").

No setup, no team list: names come from Meet's People panel. You don't need to keep it open: when you join
(and when the number of people changes) the extension opens it for a moment, reads the names and closes it.
It never does that while chat or another side panel is open.
The only thing stored is per meeting link: who started last and the names seen in that meeting
(`chrome.storage.local`, your browser only). The only network request is the update check:
it reads `manifest.json` from this repository to compare version numbers.

## Install

```bash
git clone https://github.com/ibro-makhmudov/meet-standup-turn.git ~/meet-standup-turn
```

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. **Load unpacked** → pick the `meet-standup-turn` folder.
3. Reload the Meet tab. Keep the folder: Chrome runs the extension from it.

No git? Download the ZIP from the green **Code** button on GitHub, unzip, and load that folder.

## Update

When a new version is out, the chip shows **⬆ Update x.y.z available**. Then:

```bash
cd ~/meet-standup-turn && git pull
```

and press **↻** on the extension in `chrome://extensions` (or restart Chrome), then reload Meet.
With the ZIP install: download the new ZIP, replace the folder contents, press ↻.

## How "who starts" works

- You pick today's starter in the chip once. It is saved for this meeting link.
- Next standup day: the next person alphabetically after the last starter, among the people in the call.
- When the call has run for 3 minutes, today's starter is saved automatically, so the rotation keeps going.
- Days you missed are stepped over (one person per weekday). If it's off, pick the right person in the chip.

## Develop

```bash
node --test test/*.test.js
```

`demo/index.html` is a fake Meet call for trying the chip without Meet. Serve the folder over http;
`?date=2026-10-13` fakes the date, `?reset=1` clears saved data, `?open=1` opens the People panel,
`?people=A,B,C` sets who is in the call.
