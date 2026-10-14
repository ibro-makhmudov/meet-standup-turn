# Meet Standup Turn

For daily standups in **Google Meet** where people speak in **alphabetical order**.

Meet always puts you at the top of the People list, so you have to work out who is before you.
This Chrome extension shows it in a small card in the call:

<img src="docs/hero.png" alt="The card in a Google Meet call: You speak after David Varga, 7 of 8, Today starts Nóra Pap" width="720">

- **You speak after David Varga**: the person alphabetically before you among the people in the call.
- **7 of 8**: your place in today's order (shown when "Today starts" is set).
- **Today starts**: optional. Pick it once; on the next days the next person alphabetically starts.

No account, no setup, no team list. Names come from the call and never leave your browser.

## Install

You need Chrome (or another Chromium browser: Edge, Brave, Arc).

**1. Get the files**

With git (recommended, makes updates one command):

```bash
git clone https://github.com/ibro-makhmudov/meet-standup-turn.git ~/meet-standup-turn
```

Without git: on this page click the green **Code** button → **Download ZIP**, then unzip it somewhere you'll keep it.

**2. Load it into Chrome**

1. Open `chrome://extensions` (paste it into the address bar).
2. Turn on **Developer mode** (switch in the top right corner).
3. Click **Load unpacked** (top left) and choose the `meet-standup-turn` folder.
4. "Meet Standup Turn" appears in the list. Optional: pin it from the puzzle icon in the toolbar.

**3. Join a Meet call**

The card appears in the top left corner a second or two after you join.
Don't delete or move the folder: Chrome runs the extension from it.

## Using it

### Your turn

<img src="docs/no-starter.png" alt="Card: You speak after David Varga, Today starts Choose" width="330">

That's all you need: when David finishes, it's you. The card updates when people join or leave.

To read the names, the extension opens Meet's People panel for a moment when you join
(you may see it flash once) and closes it again. It never does this while chat or another side panel is open.

### Who starts today (optional)

If your team rotates the first speaker every day, click **Choose** and pick today's first speaker:

<img src="docs/menu.png" alt="Menu with everyone in the call, Nóra Pap selected" width="330">

From then on:

- the card shows your place in today's order;
- on the next standup day, the **next person alphabetically** starts, and so on around the list;
- people who are not in the call are skipped; weekends don't count;
- after the call has run for 3 minutes, today's starter is remembered, so the rotation continues by itself;
- if you missed some days, those days are skipped over (one person per weekday). If the guess is wrong, just pick the right person.

The starter is remembered **per meeting link**, so different meetings don't mix.
Pick **Don't track who starts** at the bottom of the menu to turn it off.

When it's you:

<img src="docs/you-start.png" alt="Card: Your turn, You start today" width="330">

### Minimize

Click **–** to shrink the card to a round button; click the button to open it again.

<img src="docs/minimized.png" alt="Minimized round button" width="56">

## Update

When a new version is out, the card shows a link:

<img src="docs/update.png" alt="Card with Update 1.2.0 available" width="330">

Then:

1. Get the new files. With git:
   ```bash
   cd ~/meet-standup-turn && git pull
   ```
   With the ZIP: download it again and replace the folder contents.
2. Open `chrome://extensions` and press **↻** on Meet Standup Turn.
3. Reload the Meet tab.

## Questions

**The card doesn't appear.** Reload the Meet tab. The card only shows inside a call, not on the Meet home page
or the "Ready to join?" screen. If you just installed or updated, check that you pressed ↻ on the extension.

**The People panel flashed when I joined.** That's the extension reading the names. It happens once per call.

**Someone is in the order who doesn't do standup (a guest).** Everyone in the call is counted for now.

**"Merged audio".** People joining from a meeting room device are grouped by Meet; they are counted as normal people.

**Privacy.** Nothing is sent anywhere. The extension stores only who started last and the names seen in each meeting,
in your browser. Its only network request reads the latest version number from this repository.
See [PRIVACY.md](PRIVACY.md).

## Develop

```bash
node --test test/*.test.js   # logic tests
./pack.sh                    # zip for the Chrome Web Store
```

`demo/index.html` is a fake Meet call for trying the card without Meet (made-up names). Serve the folder over http:

```bash
python3 -m http.server 8765   # then open http://localhost:8765/demo/index.html?open=1
```

Demo URL options: `date=2026-10-13` fakes today, `reset=1` clears saved data, `open=1` opens People,
`lazy=1` renders the list only after People is opened once (like Meet), `chat=1` starts with chat open,
`people=A,B,C` sets who is in the call, `merged=A,B` groups people under "Merged audio",
`starter=Name` presets today's starter, `menu=1`, `min=1`, `update=1.2.0`, `clean=1` for screenshots.
