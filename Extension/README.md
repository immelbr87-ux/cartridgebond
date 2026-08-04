# CartridgeBond Chrome Extension

Shows the full CartridgeBond buy/sell pill — locked price, live buyer/seller
counts, browse-real-offers dropdown, and price breakdown — on Nintendo
Switch game product pages across Amazon, GameStop, Best Buy, Target, and
Walmart. Every site gets the identical experience.

Not yet published to the Chrome Web Store.

---

## File Structure

```
Extension/
├── manifest.json     — Extension configuration (Manifest V3)
├── background.js     — Service worker: first-run tab, storage cleanup on nav
├── popup.html/js      — Toolbar popup, shows the currently-detected game
├── welcome.html       — First-run onboarding + age verification page
├── pill-engine.js     — SHARED: the pill, dropdown, offer list, age gate,
│                         breakdown panel, and submission flow. Loaded on
│                         every site alongside that site's own file below.
├── content.js         — Amazon: constants, games list, anchor/game detection
├── gamestop.js        — GameStop: same, for trade-in pages
├── bestbuy.js         — Best Buy: same
├── target.js          — Target: same
├── walmart.js         — Walmart: same
├── styles.css         — Shared styles for all injected UI (pill + dropdown)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Why the split

Every site's `content_scripts` entry in `manifest.json` loads
`pill-engine.js` first, then that site's own file. Scripts listed together
in one `content_scripts` entry share the same execution context (like two
`<script>` tags on one page), so the site file's `CB_API`/`CB_SITE`
constants and `CBMount(anchor, game)` call are visible to the engine, and
the engine's functions are visible to the site file.

A site file's only job:
1. Define `CB_API` and `CB_SITE`
2. Define its own games list (`title`/`price`/`slug`, same 28 titles
   everywhere — keep in sync with `games.json` when pricing changes)
3. Detect whether the current page is a matching Switch game product page,
   and find the DOM anchor to inject next to
4. Call `CBMount(anchor, game)`

Everything else — pill markup, the offer-browsing dropdown, the age gate,
the price breakdown, submitting a bond — lives once in `pill-engine.js`.
Fixing a bug or changing copy there fixes it everywhere; there's no more
"the fix only landed on Amazon" risk.

---

## Backend dependency

`pill-engine.js` calls, per game:

```
GET {webapp_url}?action=gameStatus&game=<title>
GET {webapp_url}?action=listOffers&game=<title>&role=buy|sell
GET {webapp_url}?action=productIntelligence&slug=<slug>
POST {webapp_url}   { email, zip, role, game, price, condition, timeline, matchOfferId? }
```

All implemented directly in the main `cartridgebond-webapp.gs` deployment
(same URL used everywhere else on the site) plus `direct-match.gs` and
`intelligence-engine.gs` — no separate deployment to manage.

---

## Setup (Do This Once Before Launching)

1. Confirm the deployed Apps Script backend includes `gameStatus`,
   `listOffers`, and `productIntelligence` (see above).
2. Load unpacked in Chrome: `chrome://extensions` → Developer mode →
   Load unpacked → select this folder.
3. Visit an Amazon, GameStop, Best Buy, Target, or Walmart product page
   for a Nintendo Switch game to test — every site should show the same
   pill and dropdown.
4. When ready to publish, package this folder and submit to the
   Chrome Web Store developer dashboard.

---

## Known limitations

- Best Buy, Target, and Walmart anchor selectors are best-effort guesses
  at each site's current DOM structure — not yet verified against live
  pages. Retailers change markup without notice; if the pill stops
  appearing on one of these sites, the `find*Anchor()` function in that
  site's file is the first thing to check.
- GameStop only mounts on pages it detects as trade-in context
  (`/trade.in|trade in/i` against the URL/title). It doesn't currently
  run on regular GameStop product pages.
- Game/price lists are still duplicated across all five site files
  (Manifest V3 content scripts don't share module state), though they're
  now identical (all 28 titles) rather than partial subsets like before.
  Keep them in sync manually when `games.json` pricing changes.
