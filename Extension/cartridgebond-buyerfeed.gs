/**
 * CartridgeBond — Buyer Feed Endpoint
 * ════════════════════════════════════
 * This is a SEPARATE Google Apps Script deployment from your main webapp.
 * It serves active buy requests as JSON so the Chrome extension can read them.
 *
 * SETUP (do once):
 * ─────────────────
 * 1. Open your CartridgeBond Submissions Google Sheet
 * 2. Extensions → Apps Script
 * 3. Create a NEW file (File → New → Script file) named "BuyerFeed"
 * 4. Paste this entire file into it
 * 5. Deploy → New Deployment
 *    - Type: Web App
 *    - Execute as: Me (cartridgebond@gmail.com)
 *    - Who has access: Anyone
 * 6. Copy the Web App URL
 * 7. Paste that URL into content.js where it says PASTE_YOUR_BUYERFEED_WEBAPP_URL_HERE
 *
 * The URL stays the same after updates. When you redeploy just pick "New Version".
 */

// ─── CONFIGURATION ────────────────────────────────────────────

var FEED_CONFIG = {
  sheetName: 'Submissions',   // Must match your main sheet tab name
  // Column indices (1-based, matching your sheet layout):
  COL_NAME:      2,   // B — Name
  COL_EMAIL:     3,   // C — Email
  COL_ROLE:      6,   // F — Role
  COL_GAME:      7,   // G — Game(s)
  COL_PRICE:     8,   // H — Price(s)
  COL_CONDITION: 9,   // I — Condition
  COL_TIMELINE:  10,  // J — Timeline
  COL_ZIP:       5,   // E — Zip
  COL_STATUS:    14,  // N — Status (skip "Matched" rows — already handled)
};

// ─── MAIN ENDPOINT ────────────────────────────────────────────

function doGet(e) {
  // Allow CORS so the extension can call this
  var output = ContentService
    .createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);

  try {
    var action = (e && e.parameter && e.parameter.action) || 'buyers';

    if (action === 'buyers') {
      output.setContent(JSON.stringify(getActiveBuyers()));
    } else if (action === 'stats') {
      output.setContent(JSON.stringify(getStats()));
    } else {
      output.setContent(JSON.stringify({ error: 'Unknown action' }));
    }
  } catch(err) {
    output.setContent(JSON.stringify({ error: err.toString(), buyers: [] }));
  }

  return output;
}

// ─── GET ACTIVE BUYERS ────────────────────────────────────────

function getActiveBuyers() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEED_CONFIG.sheetName);
  if (!sheet) return { buyers: [], count: 0, lastUpdated: new Date().toISOString() };

  var data  = sheet.getDataRange().getValues();
  var buyers = [];

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[FEED_CONFIG.COL_ROLE - 1] || '').toLowerCase();
    var status = String(row[FEED_CONFIG.COL_STATUS - 1] || '').toLowerCase();

    // Only include active buy requests (not already matched)
    if (!role.includes('buy')) continue;
    if (status === 'matched') continue;

    var games    = String(row[FEED_CONFIG.COL_GAME - 1] || '').trim();
    var prices   = String(row[FEED_CONFIG.COL_PRICE - 1] || '').trim();
    var timeline = String(row[FEED_CONFIG.COL_TIMELINE - 1] || '').trim();
    var zip      = String(row[FEED_CONFIG.COL_ZIP - 1] || '').trim();

    if (!games) continue;

    // Handle multiple games per submission (pipe-separated)
    var gameList  = games.split('|');
    var priceList = prices.split('|');

    gameList.forEach(function(game, idx) {
      var price = (priceList[idx] || priceList[0] || '').trim().replace('$', '');
      var gameName = game.trim();
      if (!gameName) return;

      buyers.push({
        game:     gameName,
        price:    price,
        timeline: timeline,
        zip:      zip.substring(0, 3) + 'xx', // Partially anonymize zip
      });
    });
  }

  return {
    buyers:      buyers,
    count:       buyers.length,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── STATS (for popup display) ────────────────────────────────

function getStats() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEED_CONFIG.sheetName);
  if (!sheet) return { totalTrades: 0, activeBuyers: 0, activeSellers: 0 };

  var data = sheet.getDataRange().getValues();
  var totalTrades = 0, activeBuyers = 0, activeSellers = 0;

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[FEED_CONFIG.COL_ROLE - 1] || '').toLowerCase();
    var status = String(row[FEED_CONFIG.COL_STATUS - 1] || '').toLowerCase();

    if (status === 'matched') { totalTrades++; continue; }
    if (role.includes('buy'))  activeBuyers++;
    if (role.includes('sell')) activeSellers++;
  }

  return {
    totalTrades:   totalTrades,
    activeBuyers:  activeBuyers,
    activeSellers: activeSellers,
    lastUpdated:   new Date().toISOString(),
  };
}

// ─── TEST ─────────────────────────────────────────────────────

function testFeed() {
  var result = getActiveBuyers();
  Logger.log('Active buyers: ' + result.count);
  Logger.log(JSON.stringify(result, null, 2));
}
