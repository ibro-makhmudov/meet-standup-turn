# Chrome Web Store listing (copy into the developer dashboard)

Upload: `./pack.sh` → `dist/meet-standup-turn-<version>.zip`.

## Store listing tab

- **Name:** Meet Standup Turn (taken from the manifest)
- **Summary:** taken from the manifest description (max 132 characters):
  "Google Meet standup in alphabetical order: shows after whom you speak, and optionally who starts today."
- **Category:** Workflow & Planning
- **Language:** English
- **Store icon:** `icons/icon128.png` (96×96 artwork with 16 px transparent padding)
- **Screenshots (1280×800):**
  1. `store/screenshot-1-call.png`: the card in a call, who is speaking, today's order
  2. `store/screenshot-2-rotation.png`: who starts today, exceptions
  3. `store/screenshot-3-popup.png`: the toolbar window
- **Promo tile:** not needed for an unlisted item.
- **Official URL / Homepage:** https://github.com/ibro-makhmudov/meet-standup-turn
- **Support URL:** https://github.com/ibro-makhmudov/meet-standup-turn/issues

**Description:**

```
For daily standups in Google Meet where people speak in alphabetical order.

Meet always puts you at the top of the People list, so you have to work out who is before you. Meet Standup Turn shows it in a small card in the call:

• You speak after Anna: the person alphabetically before you among the people in the call, updated live when people join or leave.
• Who starts today (optional): pick it once, then it rotates alphabetically every weekday by itself. People who are not in the call are skipped.
• Today's order: the numbered list starting with today's first speaker, you highlighted, teammates who are not here shown greyed.
• Who is speaking (beta): "Anna is speaking · 2 before you", "you're next".
• Exceptions: the meeting lead can speak last, guests can be left out.
• One standup, several Meet links: recognised by who is in the call.

Click the toolbar icon to see who starts today and on the next standup day for each of your standups.

No account, no setup, no server. Names are read from the Meet page and stay in your browser.
```

## Privacy practices tab

- **Single purpose:**
  `Shows a Google Meet participant their turn in an alphabetical standup (after whom they speak, who starts today).`
- **Permission justifications:**
  - **storage:** `Remembers, for each standup team, who started the last standup, the names seen in its calls, the meeting links it used and the speaking-order exceptions, so the next starter can be worked out. Stored locally in the browser only.`
  - **alarms:** `Only for copies installed from source (unpacked): checks once an hour whether a newer version is published on GitHub and shows an update badge. Copies installed from the Chrome Web Store do not use it; Chrome updates them.`
  - **Host permission (content script on https://meet.google.com/\*):** `Reads participant names and Meet's sound indicator in the current call to compute the speaking order and shows a small card with the result. It runs only on Google Meet.`
- **Are you using remote code?** No.
- **Data usage**, what user data do you plan to collect: tick **Personally identifiable information** (participant names)
  and **Website content** (the Meet participant list). Over-disclosing is safer for review than leaving them out;
  the data is processed and stored only in the user's browser and never sent anywhere. Certify all three:
  not sold or transferred to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.
- **Privacy policy URL:** https://github.com/ibro-makhmudov/meet-standup-turn/blob/main/PRIVACY.md

## Distribution tab

- **Payments:** Free.
- **Visibility:** **Unlisted** (not in search; anyone with the link can install it).
- **Regions:** All regions.

## Account (one time, at registration)

- Trader / non-trader declaration (EU): **non-trader** (free personal tool, no commercial activity).
- The publisher name and the contact email are shown on the listing: pick the email you are fine with being visible.
