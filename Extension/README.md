# CartridgeBond Chrome Extension

Shows a badge on Nintendo Switch game product pages (Amazon, GameStop, Best Buy,
Target, Walmart) when local buyers in Milwaukee are waiting on CartridgeBond.

---

## File Structure

```
cartridgebond-extension/
├── manifest.json              — Extension configuration
├── content.js                 — Runs on product pages, injects badge
├── badge.css                  — Badge styles
├── popup.html                 — Extension toolbar popup
├── cartridgebond-buyerfeed.gs — Apps Script buyer feed endpoint
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Setup (Do This Once Before Launching)

### Step 1 — Deploy the Buyer Feed

1. Open your CartridgeBond Submissions Google Sheet
2. Extensions → Apps Script
3. File → New → Script file → name it `BuyerFeed`
4. Paste the contents of `cartridgebond-buyerfeed.gs` into it
5. Save
6. Run `testFeed` to confirm it reads your sheet correctly
7. Deploy → New Deployment
   - Type: Web App
   - Execute as: Me (cartridgebond@gmail.com)
   - Who has access: **Anyone**
8. Copy the Web App URL

### Step 2 — Wire the URL into the Extension

Open `content.js` and replace:
```
dataUrl: 'PASTE_YOUR_BUYERFEED_WEBAPP_URL_HERE',
```
with your actual URL:
```
dataUrl: 'https://script.google.com/macros/s/YOUR_ID_HERE/exec',
```

### Step 3 — Create Icons

You need three PNG icons in the `icons/` folder:
- `icon16.png`  — 16×16px
- `icon48.png`  — 48×48px
- `icon128.png` — 128×128px

Use the CartridgeBond green (background #0d2318, "CB" text in #22c55e).
Free tool: https://www.canva.com or just use any green circle PNG for now.

### Step 4 — Test Locally (Before Store Submission)

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `cartridgebond-extension/` folder
5. Go to amazon.com and search for "Mario Kart 8 Deluxe Nintendo Switch"
6. Open the product page — if there are active buyers in your sheet, the badge appears

**To test without real buyers:** Temporarily add a fake row to your sheet with
Role: "Buy Used", Game: "Mario Kart 8 Deluxe (Nintendo Switch)", Price: "$43",
Timeline: "Within 2 weeks", Status: (blank).

---

## Chrome Web Store Submission

Only do this when you have 25+ active buy requests in Milwaukee.

1. Zip the entire `cartridgebond-extension/` folder
2. Go to https://chrome.google.com/webstore/devconsole
3. Pay the one-time $5 developer registration fee
4. New Item → Upload your zip
5. Fill in:
   - **Name:** CartridgeBond — Local Switch Game Deals
   - **Category:** Shopping
   - **Description:** (see below)
   - **Screenshots:** Badge shown on an Amazon product page
6. Submit for review — typically 1–3 business days

### Store Description

```
CartridgeBond connects local Nintendo Switch game buyers and sellers in
Milwaukee, WI — no shipping, no strangers, no marketplace hassle.

This extension shows you when a local buyer near you is waiting on
CartridgeBond for the exact Switch game you're browsing — at a price
that beats what you'd pay new.

Works on:
• Amazon
• GameStop
• Best Buy
• Target
• Walmart

When a match exists, a small badge appears on the product page showing
the buyer's offer price and timeline. One click takes you to CartridgeBond
to list your game — price and title pre-filled.

Free. No account required to install. No data collected.

CartridgeBond is currently in free beta for Milwaukee & North Shore.
```

---

## How the Badge Works

1. You land on an Amazon (or other) product page for a Nintendo Switch game
2. The extension reads the page title and checks it against active buy requests
3. If a match is found (fuzzy title matching), a badge appears inline on the page
4. The badge shows: buyer count, price offered, timeline, and a "Sell yours →" link
5. The link opens CartridgeBond with the game pre-selected in the sell form
6. Data is cached for 15 minutes so it doesn't hammer the Apps Script endpoint

---

## When to Launch

Hold off on Chrome Web Store submission until:
- [ ] 25+ active buy requests across your 6 titles
- [ ] At least 3–4 titles with Milwaukee-area buyers
- [ ] The buyer feed URL is live and returning real data
- [ ] You've tested locally and confirmed badges show correctly

The extension can live in your GitHub repo in the meantime — no cost, ready to go.
