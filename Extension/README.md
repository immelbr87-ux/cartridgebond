# CartridgeBond Chrome Extension

Shows a live comparison badge on Nintendo Switch game product pages (Amazon,
GameStop, Best Buy, Target, Walmart) when there's a price advantage or a
waiting buyer/seller on CartridgeBond.

Not yet published to the Chrome Web Store.

---

## File Structure

```
Extension/
├── manifest.json    — Extension configuration (Manifest V3)
├── background.js    — Service worker: first-run age verification gate
├── popup.html/js     — Toolbar popup, shows the currently-detected game
├── welcome.html      — First-run onboarding + age verification page
├── content.js        — Amazon: live buyer/seller pill + timeline dropdown
├── gamestop.js        — GameStop: trade-in vs CartridgeBond comparison card
├── bestbuy.js          — Best Buy: buy-new vs buy-used comparison card
├── target.js            — Target: buy-new vs buy-used comparison card
├── walmart.js            — Walmart: buy-new vs buy-used comparison card
├── styles.css        — Shared styles for all injected UI
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

Only `content.js` (Amazon) calls the live backend for real buyer/seller
counts. The other four sites show a static price comparison card using the
hardcoded game/price list in each file — update those lists when your
`games.json` pricing changes, since they are not currently pulled live.

---

## Backend dependency

`content.js` calls:

```
GET {webapp_url}?action=gameStatus&game=<title>&minBuyerTimeline=30
```

This must return `{ ok: true, buyers: <n>, sellers: <n> }` — counts of
Active submissions matching that game, split by role. This action is
implemented directly in the main `cartridgebond-webapp.gs` deployment
(same URL used everywhere else on the site) — there is no separate
buyer-feed deployment to manage.

---

## Setup (Do This Once Before Launching)

1. Confirm the deployed `cartridgebond-webapp.gs` includes the
   `gameStatus` action (see backend dependency above).
2. Load unpacked in Chrome: `chrome://extensions` → Developer mode →
   Load unpacked → select this folder.
3. Visit an Amazon, GameStop, Best Buy, Target, or Walmart product page
   for a Nintendo Switch game to test.
4. When ready to publish, package this folder and submit to the
   Chrome Web Store developer dashboard.

---

## Known limitations

- Best Buy, Target, and Walmart selectors are best-effort guesses at
  each site's current DOM structure. Retailers change their markup
  without notice — if a badge stops appearing on one of these sites,
  the selector in that file is the first thing to check.
- Game/price lists are duplicated across all five scripts rather than
  shared, since Manifest V3 content scripts don't share module state
  by default. Keep them in sync manually when pricing changes.
