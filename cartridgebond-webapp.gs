/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  CartridgeBond — webapp.gs   (v4.0 fresh build)              ║
 * ║  ──────────────────────────────────────────────────────────  ║
 * ║  Core file. Owns:                                            ║
 * ║    - doGet / doPost routing                                  ║
 * ║    - Form submissions + dedup + daily caps                   ║
 * ║    - Auto-matching engine                                    ║
 * ║    - Ratings (signed token flow)                             ║
 * ║    - Email templates (shared with auth.gs and escrow.gs)     ║
 * ║    - Sheet setup + scheduled triggers                        ║
 * ║                                                              ║
 * ║  Sister files:                                               ║
 * ║    auth.gs    — Google OAuth + email-code login              ║
 * ║    escrow.gs  — Stripe escrow + Shippo shipping (optional)   ║
 * ║                                                              ║
 * ║  ──────────────────────────────────────────────────────────  ║
 * ║  DEPLOY (one-time setup):                                    ║
 * ║    1. Project Settings → Script Properties → add:            ║
 * ║         SESSION_SECRET  = (run generateSecret() once)        ║
 * ║         RATING_SECRET   = (run generateSecret() again)       ║
 * ║         GOOGLE_CLIENT_ID = (from Google Cloud Console)       ║
 * ║       (Stripe/Shippo/Admin tokens optional - escrow only)    ║
 * ║    2. Run initSheets()                                       ║
 * ║    3. Run installTriggers()                                  ║
 * ║    4. Run testEmailDelivery()                                ║
 * ║    5. Deploy → New Deployment → Web app → Anyone             ║
 * ║    6. Copy URL into login.html + dashboard.html (GAS_URL)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── CONFIGURATION ────────────────────────────────────────────────────────────
var CONFIG = {
  adminEmail:        'cartridgebond@gmail.com',
  senderName:        'CartridgeBond',
  sheetName:         'Submissions',
  ratingsSheet:      'Ratings',
  siteUrl:           'https://cartridgebond.com',
  meetupGuide:       'https://cartridgebond.com/meetup.html',
  faqUrl:            'https://cartridgebond.com/faq.html',
  priceGuide:        'https://cartridgebond.com/prices.html',
  ratingUrl:         'https://cartridgebond.com/rate.html',
  portalUrl:         'https://cartridgebond.com/dashboard.html',
  founderCount:      25,
  matchRadius:       3,        // zip prefix length to count as "near"
  priceTolerancePct: 0.10,     // sellers within 10% of buyer price still match
  dedupSeconds:      300,      // block duplicate submissions within 5min
  maxDailySubmits:   10,       // per-email per-day cap
  apiVersion:        'v4.0',
};

// ── SHEET COLUMN MAP (1-indexed) ─────────────────────────────────────────────
var COL = {
  timestamp:      1,   // A
  name:           2,   // B
  email:          3,   // C
  phone:          4,   // D
  zip:            5,   // E
  role:           6,   // F
  game:           7,   // G
  price:          8,   // H
  condition:      9,   // I
  timeline:       10,  // J
  notes:          11,  // K
  formType:       12,  // L
  city:           13,  // M
  status:         14,  // N
  matchedRow:     15,  // O
  matchedEmail:   16,  // P
  matchedAt:      17,  // Q
  matchEmailSent: 18,  // R
  followUpSent:   19,  // S
  meetupPref:     20,  // T
  rating:         21,  // U
  reviewCount:    22,  // V
  founderNumber:  23,  // W
  tradeNumber:    24,  // X
};
var TOTAL_COLS = 24;


// ════════════════════════════════════════════════════════════════════════════
//  HTML escape — every user-supplied value goes through this before
//  appearing in any email template. Prevents HTML injection.
// ════════════════════════════════════════════════════════════════════════════
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ════════════════════════════════════════════════════════════════════════════
//  Cryptographically secure secret generation. Run once in editor and copy
//  output into Script Properties as SESSION_SECRET / RATING_SECRET.
// ════════════════════════════════════════════════════════════════════════════
function generateSecret() {
  // Use a high-entropy seed: UUID + timestamp + active user email
  var seed = Utilities.getUuid() + ':' + Date.now() + ':' + Session.getActiveUser().getEmail();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  var hex = bytes.map(function(b) {
    var v = b < 0 ? b + 256 : b;
    var s = v.toString(16);
    return s.length === 1 ? '0' + s : s;
  }).join('');
  Logger.log('=== Generated 64-char secret. Copy to Script Properties: ===');
  Logger.log(hex);
  Logger.log('=== Run this twice: once for SESSION_SECRET, once for RATING_SECRET ===');
  return hex;
}


// ════════════════════════════════════════════════════════════════════════════
//  Rating tokens: HMAC-signed, encode rater+ratee+trade+timestamp.
//  Rate URLs never expose email addresses.
// ════════════════════════════════════════════════════════════════════════════
function getRatingSecret() {
  var s = PropertiesService.getScriptProperties().getProperty('RATING_SECRET');
  if (!s) throw new Error('RATING_SECRET not set in Script Properties');
  return s;
}

function generateRatingToken(raterEmail, rateeEmail, tradeNum) {
  var secret = getRatingSecret();
  var ts = Date.now().toString();
  var payload = raterEmail + '|' + rateeEmail + '|' + tradeNum + '|' + ts;
  var hash = Utilities.computeHmacSha256Signature(payload, secret)
    .map(function(b) { var v = b<0?b+256:b; var s = v.toString(16); return s.length===1?'0'+s:s; })
    .join('').substring(0, 32);
  return Utilities.base64Encode(payload + '|' + hash);
}

function verifyRatingToken(token) {
  try {
    var secret = getRatingSecret();
    var decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    var parts = decoded.split('|');
    if (parts.length !== 5) return null;
    var raterEmail = parts[0], rateeEmail = parts[1], tradeNum = parts[2], ts = parts[3], hash = parts[4];
    var payload = raterEmail + '|' + rateeEmail + '|' + tradeNum + '|' + ts;
    var expected = Utilities.computeHmacSha256Signature(payload, secret)
      .map(function(b) { var v = b<0?b+256:b; var s = v.toString(16); return s.length===1?'0'+s:s; })
      .join('').substring(0, 32);
    if (hash !== expected) return null;
    if (Date.now() - parseInt(ts) > 14 * 86400000) return null; // 14 day expiry
    return { raterEmail: raterEmail, rateeEmail: rateeEmail, tradeNum: tradeNum };
  } catch(e) { return null; }
}


// ════════════════════════════════════════════════════════════════════════════
//  doGet — status lookups + health check
// ════════════════════════════════════════════════════════════════════════════
function doGet(e) {
  if (!e || !e.parameter) return respond({ status: 'CartridgeBond API', version: CONFIG.apiVersion });
  var action = e.parameter.action || '';
  if (action === 'status') {
    var email = (e.parameter.email || '').trim().toLowerCase();
    if (!email) return respond({ submissions: [] });
    return respond({ submissions: lookupSubmissionsByEmail(email) });
  }
  if (action === 'getMyBonds') {
    var token = e.parameter.token || '';
    var session = validateToken(token);
    if (!session) return respond({ error: 'invalid_session', submissions: [] });
    return respond({ submissions: lookupSubmissionsByEmail(session) });
  }
  return respond({ status: 'CartridgeBond API', version: CONFIG.apiVersion });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function lookupSubmissionsByEmail(email) {
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var found = [];
  email = String(email).toLowerCase().trim();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.email-1]||'').toLowerCase().trim() !== email) continue;
    found.push({
      date:          rows[i][COL.timestamp-1] ? new Date(rows[i][COL.timestamp-1]).toLocaleDateString() : '',
      role:          String(rows[i][COL.role-1]      || ''),
      game:          String(rows[i][COL.game-1]      || ''),
      price:         String(rows[i][COL.price-1]     || ''),
      condition:     String(rows[i][COL.condition-1] || ''),
      timeline:      String(rows[i][COL.timeline-1]  || ''),
      status:        String(rows[i][COL.status-1]    || 'Under Review'),
      matchedAt:     rows[i][COL.matchedAt-1] ? new Date(rows[i][COL.matchedAt-1]).toLocaleDateString() : '',
      tradeNumber:   rows[i][COL.tradeNumber-1] || '',
      founderNumber: rows[i][COL.founderNumber-1] || '',
    });
  }
  return found;
}


// ════════════════════════════════════════════════════════════════════════════
//  doPost — main routing
// ════════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var data = parseRequestBody(e);

    // ── Auth actions (defined in auth.gs) ──────────────────────────────────
    if (data.action === 'sendLoginCode')      return sendLoginCode(data.email);
    if (data.action === 'verifyLoginCode')    return verifyLoginCode(data.email, data.code);
    if (data.action === 'googleAuth')         return googleAuth(data.idToken);
    if (data.action === 'signOut')            return signOut(data.token);
    if (data.action === 'getUserData')        return getProtectedUserData(data.token);
    if (data.action === 'updateProfile')      return updateUserProfile(data);

    // ── Rating actions ─────────────────────────────────────────────────────
    if (data.action === 'getTradeForRating')  return getTradeForRating(data.token);
    if (data.action === 'submitRating')       return submitRating(data);

    // ── My bonds (authenticated) ───────────────────────────────────────────
    if (data.action === 'getMyBonds') {
      var session = validateToken(data.token);
      if (!session) return respond({ error: 'invalid_session', submissions: [] });
      return respond({ submissions: lookupSubmissionsByEmail(session) });
    }

    // ── Escrow actions (defined in escrow.gs - guarded if not configured) ──
    if (data.action === 'initEscrow' ||
        data.action === 'markShipped' ||
        data.action === 'releaseEscrow' ||
        data.action === 'openDispute' ||
        data.action === 'resolveDispute') {
      if (typeof handleEscrowAction !== 'function') {
        return respond({ error: 'Escrow not yet configured' });
      }
      return handleEscrowAction(data);
    }

    // ── Stripe webhook (defined in escrow.gs) ──────────────────────────────
    if (data.stripeEvent && typeof stripeWebhook === 'function') {
      return stripeWebhook(e);
    }

    // ── Default: form submission ───────────────────────────────────────────
    return handleSubmission(data);

  } catch(err) {
    Logger.log('doPost ERROR: ' + err.toString() + '\n' + (err.stack || ''));
    return respond({ result: 'error', error: 'server_error', message: err.toString() });
  }
}

function parseRequestBody(e) {
  if (!e || !e.postData) return {};
  var contents = e.postData.contents || '';
  // Handle JSON body OR form-encoded fallback
  if (contents && contents.charAt(0) === '{') {
    try { return JSON.parse(contents); } catch(err) {}
  }
  if (e.parameter) return e.parameter;
  return {};
}


// ════════════════════════════════════════════════════════════════════════════
//  FORM SUBMISSION
// ════════════════════════════════════════════════════════════════════════════
function handleSubmission(data) {
  if (!data.email || !data.game || !data.role) {
    return respond({ result: 'ok' }); // Soft-fail to match old behavior
  }

  var sheet = getSheet(CONFIG.sheetName);

  // Dedup + rate limit
  if (isDuplicate(sheet, data)) {
    Logger.log('Dedup blocked: ' + data.email + ' / ' + data.game);
    return respond({ result: 'ok' });
  }
  if (isOverDailyLimit(sheet, data.email)) {
    Logger.log('Daily cap reached: ' + data.email);
    return respond({ error: 'Daily submission limit reached. Try again tomorrow.' });
  }

  // Optional: link to user if authenticated
  var userEmail = '';
  if (data.token) {
    var session = validateToken(data.token);
    if (session) userEmail = session;
  }

  var now = new Date();
  var price = parseFloat(String(data.resale_price || data.price || '0').replace(/[^0-9.]/g, '')) || 0;
  var row = new Array(TOTAL_COLS).fill('');
  row[COL.timestamp-1]  = now;
  row[COL.name-1]       = String(data.name      || '').trim().substring(0, 100);
  row[COL.email-1]      = String(data.email     || '').trim().toLowerCase().substring(0, 200);
  row[COL.phone-1]      = String(data.phone     || '').trim().substring(0, 20);
  row[COL.zip-1]        = String(data.zip       || '').replace(/\D/g, '').substring(0, 5);
  row[COL.role-1]       = String(data.role      || '').trim().substring(0, 10);
  row[COL.game-1]       = String(data.game      || '').trim().substring(0, 150);
  row[COL.price-1]      = price;
  row[COL.condition-1]  = String(data.condition || 'A1').trim().substring(0, 5);
  row[COL.timeline-1]   = String(data.timeline  || '').trim().substring(0, 50);
  row[COL.notes-1]      = String(data.notes     || '').trim().substring(0, 500);
  row[COL.formType-1]   = String(data.formType  || '').trim().substring(0, 30);
  row[COL.city-1]       = String(data.city      || '').trim().substring(0, 100);
  row[COL.status-1]     = 'Active';
  row[COL.meetupPref-1] = String(data.meetupPref || '').trim().substring(0, 200);
  sheet.appendRow(row);
  var newRowNum = sheet.getLastRow();

  // Confirmation email to user
  try {
    var firstName = String(data.name || 'there').trim().split(' ')[0].substring(0, 30);
    var role = String(data.role || '').toLowerCase();
    if (role.indexOf('sell') !== -1) {
      sendEmail(data.email, subjectLine('Listing confirmed', data.game), buildSellerConfirmHtml(firstName, data, price));
    } else if (role.indexOf('buy') !== -1) {
      sendEmail(data.email, subjectLine('Request confirmed', data.game), buildBuyerConfirmHtml(firstName, data, price));
    } else if (role.indexOf('waitlist') !== -1 || data.formType === 'waitlist') {
      sendEmail(data.email, "You're on the waitlist - CartridgeBond",
        emailWrap('Waitlist confirmed', "We'll let you know when we launch in your area.",
          section('Hey ' + esc(firstName) + ' - you are on the list.') +
          para("We'll email you when CartridgeBond launches in " + esc(data.city || 'your area') + ".") +
          learnMore()
        ));
    }
  } catch(err) { Logger.log('User email failed: ' + err); }

  // Admin notification
  try {
    GmailApp.sendEmail(CONFIG.adminEmail,
      '[CB] ' + (data.role || '?') + ' - ' + String(data.game || '?').substring(0, 50) + ' - $' + price + ' - ' + (data.zip || '?'),
      'Row: ' + newRowNum + '\nName: ' + (data.name || '') + '\nEmail: ' + (data.email || '') +
      '\nZip: ' + (data.zip || '') + '\nGame: ' + (data.game || '') + '\nPrice: $' + price +
      '\nCondition: ' + (data.condition || '') + '\nTimeline: ' + (data.timeline || '') +
      '\nMeetup: ' + (data.meetupPref || '') + '\nNotes: ' + (data.notes || '') +
      (userEmail ? '\nAuth: ' + userEmail : '\nAuth: (anonymous)'),
      { replyTo: data.email || CONFIG.adminEmail }
    );
  } catch(err) { Logger.log('Admin email failed: ' + err); }

  // Try auto-match
  try { tryAutoMatch(sheet, newRowNum, data, price); }
  catch(err) { Logger.log('Auto-match failed: ' + err); }

  Logger.log('Submission OK row ' + newRowNum + ': ' + data.email + ' | ' + data.game);
  return respond({ result: 'ok' });
}


// ════════════════════════════════════════════════════════════════════════════
//  AUTO-MATCHING
// ════════════════════════════════════════════════════════════════════════════
function tryAutoMatch(sheet, newRowNum, newData, newPrice) {
  var rows = sheet.getDataRange().getValues();
  var newRole = String(newData.role || '').toLowerCase();
  var isSeller = newRole.indexOf('sell') !== -1;
  var isBuyer = newRole.indexOf('buy') !== -1;
  if (!isSeller && !isBuyer) return;

  var newGame = normalizeGame(newData.game);
  var newZip = String(newData.zip || '').replace(/\D/g, '').substring(0, 5);
  var newCond = String(newData.condition || 'A1').toUpperCase();
  var newEmail = String(newData.email || '').trim().toLowerCase();
  var candidates = [];
  var distantCandidatesCount = 0;  // track interest outside zip prefix - for "shipping coming soon" messaging

  for (var i = 1; i < rows.length; i++) {
    var rNum = i + 1;
    if (rNum === newRowNum) continue;
    var rRole = String(rows[i][COL.role-1] || '').toLowerCase();
    var rStatus = String(rows[i][COL.status-1] || '').toLowerCase();
    var rEmail = String(rows[i][COL.email-1] || '').trim().toLowerCase();
    var rGame = normalizeGame(String(rows[i][COL.game-1] || ''));
    if (rStatus !== 'active') continue;
    if (rEmail === newEmail) continue;
    if (isSeller && rRole.indexOf('buy') === -1) continue;
    if (isBuyer && rRole.indexOf('sell') === -1) continue;
    if (!gamesMatch(newGame, rGame)) continue;

    var rPrice = parseFloat(String(rows[i][COL.price-1] || '0').replace(/[^0-9.]/g, '')) || 0;
    var sellPr = isSeller ? newPrice : rPrice;
    var buyPr = isSeller ? rPrice : newPrice;
    if (sellPr <= 0 || buyPr <= 0) continue;
    if (sellPr > buyPr * (1 + CONFIG.priceTolerancePct)) continue;

    var rZip = String(rows[i][COL.zip-1] || '').replace(/\D/g, '').substring(0, 5);
    var rCond = String(rows[i][COL.condition-1] || 'A1').toUpperCase();
    var rTime = String(rows[i][COL.timeline-1] || '');
    var rRating = parseFloat(rows[i][COL.rating-1]) || 0;
    var rReviews = parseInt(rows[i][COL.reviewCount-1]) || 0;

    // STRICT PREFIX GATE: during local-meetup beta, only match same 3-digit zip prefix
    // (without shipping/escrow, distant matches can't actually transact)
    // Track distant candidates separately so we can mention "shipping coming soon" in confirmation emails
    if (newZip && rZip && newZip.substring(0, CONFIG.matchRadius) !== rZip.substring(0, CONFIG.matchRadius)) {
      distantCandidatesCount++;
      Logger.log('Distant candidate skipped: row ' + rNum + ' (zip ' + rZip + ' vs ' + newZip + ')');
      continue;
    }

    var score = scoreMatch(newZip, rZip, newCond, rCond, sellPr, buyPr, rTime, rRating, rReviews, i);
    candidates.push({ rowNum: rNum, score: score, rowData: rows[i], email: rEmail, price: sellPr });
  }

  // Stash distant-interest count on the row for confirmation email logic to read later
  // (Note: we do NOT email-match distant candidates; this is only for messaging)
  if (distantCandidatesCount > 0) {
    Logger.log('Row ' + newRowNum + ' has ' + distantCandidatesCount + ' distant candidates (shipping coming soon)');
  }

  if (!candidates.length) {
    Logger.log('No local candidates for row ' + newRowNum + ' (distant candidates: ' + distantCandidatesCount + ')');
    return;
  }
  candidates.sort(function(a, b) { return b.score - a.score; });
  var best = candidates[0];
  if (best.score < 20) {
    Logger.log('No quality match (best score: ' + best.score + ')');
    return;
  }

  // Lock the match
  var matchedAt = new Date();
  sheet.getRange(newRowNum, COL.status).setValue('Matched');
  sheet.getRange(newRowNum, COL.matchedRow).setValue(best.rowNum);
  sheet.getRange(newRowNum, COL.matchedEmail).setValue(best.email);
  sheet.getRange(newRowNum, COL.matchedAt).setValue(matchedAt);
  sheet.getRange(best.rowNum, COL.status).setValue('Matched');
  sheet.getRange(best.rowNum, COL.matchedRow).setValue(newRowNum);
  sheet.getRange(best.rowNum, COL.matchedEmail).setValue(newEmail);
  sheet.getRange(best.rowNum, COL.matchedAt).setValue(matchedAt);

  // Trade number + founder check
  var tradeNum = getAndIncrementTradeCounter();
  sheet.getRange(newRowNum, COL.tradeNumber).setValue(tradeNum);
  sheet.getRange(best.rowNum, COL.tradeNumber).setValue(tradeNum);
  var founder = tradeNum <= CONFIG.founderCount ? tradeNum : '';
  if (founder) {
    sheet.getRange(newRowNum, COL.founderNumber).setValue(founder);
    sheet.getRange(best.rowNum, COL.founderNumber).setValue(founder);
  }

  // Email both sides
  var p1 = {
    name: String(newData.name || '').trim(), email: newEmail, role: newData.role,
    game: newData.game, price: newPrice, condition: newCond,
    timeline: newData.timeline || '', zip: newZip, founder: founder, tradeNum: tradeNum
  };
  var br = best.rowData;
  var p2 = {
    name: String(br[COL.name-1] || '').trim(), email: best.email,
    role: String(br[COL.role-1] || ''), game: String(br[COL.game-1] || ''),
    price: parseFloat(String(br[COL.price-1] || '0')) || 0,
    condition: String(br[COL.condition-1] || 'A1'), timeline: String(br[COL.timeline-1] || ''),
    zip: String(br[COL.zip-1] || ''), founder: founder, tradeNum: tradeNum
  };

  try {
    sendEmail(p1.email, subjectLine('Match found', p1.game), buildMatchHtml(p1, p2));
    sendEmail(p2.email, subjectLine('Match found', p2.game), buildMatchHtml(p2, p1));
    sheet.getRange(newRowNum, COL.matchEmailSent).setValue(matchedAt);
    sheet.getRange(best.rowNum, COL.matchEmailSent).setValue(matchedAt);

    GmailApp.sendEmail(CONFIG.adminEmail,
      '[CB] AUTO-MATCH #' + tradeNum + ' - ' + p1.game + ' - $' + best.price,
      'Trade #' + tradeNum + '\n' + p1.name + ' <' + p1.email + '> (' + p1.role + ')' +
      '\n  matched with\n' + p2.name + ' <' + p2.email + '> (' + p2.role + ')' +
      '\nGame: ' + p1.game + '\nPrice: $' + best.price + '\nScore: ' + best.score +
      '\nRows: ' + newRowNum + ' <-> ' + best.rowNum,
      { replyTo: CONFIG.adminEmail });

    Logger.log('MATCH Trade#' + tradeNum + ' rows ' + newRowNum + '<->' + best.rowNum + ' score=' + best.score);
  } catch(err) { Logger.log('Match email error: ' + err); }
}

function scoreMatch(z1, z2, c1, c2, sellPr, buyPr, timeline, rating, reviewCount, rowIdx) {
  var s = 0;
  // Geography
  if (z1 && z2 && z1 === z2) s += 100;
  else if (z1 && z2 && z1.substring(0, CONFIG.matchRadius) === z2.substring(0, CONFIG.matchRadius)) s += 60;
  else if (z1 && z2) s += 10;
  // Condition
  if (c1 === 'A1') s += 30;
  else if (c1 === 'A2') s += 18;
  else if (c1 === 'B') s += 8;
  // Price gap (closer = better)
  if (buyPr > 0) s += Math.min(20, Math.round(((buyPr - sellPr) / buyPr) * 40));
  // Reputation
  if (reviewCount === 0) s += 5;
  else if (rating >= 4.5) s += 20;
  else if (rating >= 3.5) s += 12;
  else if (rating >= 3.0) s += 4;
  else s -= 15;
  // Timeline urgency
  var tl = String(timeline || '').toLowerCase();
  if (tl.indexOf('asap') !== -1 || tl.indexOf('now') !== -1) s += 10;
  else if (tl.indexOf('week') !== -1) s += 7;
  else if (tl.indexOf('month') !== -1) s += 4;
  else s += 2;
  // Recency bonus (slight)
  s += Math.max(0, 5 - Math.floor(rowIdx / 50));
  return s;
}

function scheduledMatchSweep() {
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.status-1] || '').toLowerCase() !== 'active') continue;
    var d = {
      name: String(rows[i][COL.name-1] || ''), email: String(rows[i][COL.email-1] || ''),
      role: String(rows[i][COL.role-1] || ''), game: String(rows[i][COL.game-1] || ''),
      zip: String(rows[i][COL.zip-1] || ''), condition: String(rows[i][COL.condition-1] || 'A1'),
      timeline: String(rows[i][COL.timeline-1] || '')
    };
    var pr = parseFloat(String(rows[i][COL.price-1] || '0')) || 0;
    if (!d.email || !d.game || !d.role) continue;
    tryAutoMatch(sheet, i + 1, d, pr);
    Utilities.sleep(400); // gentle rate limit
  }
}


// ════════════════════════════════════════════════════════════════════════════
//  RATINGS
// ════════════════════════════════════════════════════════════════════════════
function getTradeForRating(token) {
  if (!token) return respond({ error: 'Missing token' });
  var decoded = verifyRatingToken(token);
  if (!decoded) return respond({ error: 'Invalid or expired rating link' });

  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var game = '', price = '', rateeRole = 'seller';

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.tradeNumber-1] || '') !== String(decoded.tradeNum)) continue;
    var rowEmail = String(rows[i][COL.email-1] || '').toLowerCase().trim();
    if (rowEmail !== decoded.raterEmail) continue;
    game = String(rows[i][COL.game-1] || '');
    price = String(rows[i][COL.price-1] || '');
    var myRole = String(rows[i][COL.role-1] || '').toLowerCase();
    rateeRole = myRole.indexOf('sell') !== -1 ? 'buyer' : 'seller';
    break;
  }

  return respond({
    result: 'ok',
    trade: {
      game: game, platform: 'Nintendo Switch',
      rateeName: getNameForEmail(decoded.rateeEmail),
      rateeRole: rateeRole, price: price, tradeNum: decoded.tradeNum
      // NOTE: rateeEmail intentionally NOT returned. Kept server-side via token.
    }
  });
}

function submitRating(data) {
  var decoded = verifyRatingToken(data.token || '');
  if (!decoded) {
    Logger.log('submitRating: invalid token');
    return respond({ error: 'Invalid rating token' });
  }
  var rater = decoded.raterEmail, ratee = decoded.rateeEmail, tradeNum = decoded.tradeNum;

  // Clamp star ratings to 1-5
  var stars = [
    Math.min(5, Math.max(1, parseFloat(data.stars_1) || 1)),
    Math.min(5, Math.max(1, parseFloat(data.stars_2) || 1)),
    Math.min(5, Math.max(1, parseFloat(data.stars_3) || 1)),
    Math.min(5, Math.max(1, parseFloat(data.stars_4) || 1))
  ];
  var avg = (stars.reduce(function(a, b) { return a + b; }, 0) / 4).toFixed(1);
  var comment = String(data.comment || '').trim().substring(0, 280);

  // Update ratee's running average
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var rateeName = 'there';
  for (var i = 1; i < rows.length; i++) {
    var rEmail = String(rows[i][COL.email-1] || '').toLowerCase().trim();
    if (rEmail !== ratee) continue;
    rateeName = String(rows[i][COL.name-1] || '').split(' ')[0] || 'there';
    var oldAvg = parseFloat(rows[i][COL.rating-1]) || 0;
    var oldCnt = parseInt(rows[i][COL.reviewCount-1]) || 0;
    var newCnt = oldCnt + 1;
    var newAvg = oldCnt === 0 ? parseFloat(avg) : ((oldAvg * oldCnt + parseFloat(avg)) / newCnt);
    sheet.getRange(i + 1, COL.rating).setValue(newAvg.toFixed(1));
    sheet.getRange(i + 1, COL.reviewCount).setValue(newCnt);
  }

  // Log to ratings sheet
  var rSheet = getSheet(CONFIG.ratingsSheet);
  rSheet.appendRow([new Date(), rater, ratee, tradeNum, data.rateeRole || '',
    stars[0], stars[1], stars[2], stars[3], parseFloat(avg), comment]);

  // Notify ratee
  try {
    sendEmail(ratee, 'New CartridgeBond rating - ' + avg + '/5',
      buildRatingReceivedHtml(rateeName, avg, { game: data.game, comment: comment }));
  } catch(err) { Logger.log('Rating notify failed: ' + err); }

  Logger.log('Rating: ' + rater + ' -> ' + ratee + ' = ' + avg);
  return respond({ result: 'ok' });
}


// ════════════════════════════════════════════════════════════════════════════
//  FOLLOW-UP RATING REQUESTS (3-10 days post-match)
// ════════════════════════════════════════════════════════════════════════════
function sendFollowUpRatingRequests() {
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var sent = 0;

  for (var i = 1; i < rows.length; i++) {
    var matchSent = rows[i][COL.matchEmailSent-1];
    var followSent = rows[i][COL.followUpSent-1];
    var email = String(rows[i][COL.email-1] || '');
    var name = String(rows[i][COL.name-1] || 'there');
    var game = String(rows[i][COL.game-1] || 'your game');
    var price = parseFloat(rows[i][COL.price-1]) || 0;
    var partner = String(rows[i][COL.matchedEmail-1] || '');
    var tradeNum = String(rows[i][COL.tradeNumber-1] || '');
    if (!matchSent || followSent || !email || !partner || !tradeNum) continue;

    var matchDate = new Date(matchSent);
    if (isNaN(matchDate)) continue;
    var days = (now - matchDate) / 86400000;
    if (days < 3 || days > 10) continue;

    try {
      var partnerName = 'Your trading partner';
      for (var j = 1; j < rows.length; j++) {
        if (String(rows[j][COL.email-1] || '').toLowerCase() === partner.toLowerCase()) {
          partnerName = String(rows[j][COL.name-1] || 'Your trading partner');
          break;
        }
      }
      var ratingToken = generateRatingToken(email, partner, tradeNum);
      var rateUrl = CONFIG.ratingUrl + '?trade=' + encodeURIComponent(tradeNum) +
                    '&token=' + encodeURIComponent(ratingToken);
      sendEmail(email, subjectLine('How did your Bond go', game),
        buildRateYourPartnerHtml(name.split(' ')[0], partnerName, game, price, rateUrl));
      sheet.getRange(i + 1, COL.followUpSent).setValue(now);
      sent++;
      Utilities.sleep(200);
    } catch(err) { Logger.log('Follow-up err row ' + (i+1) + ': ' + err); }
  }
  Logger.log('Follow-ups sent: ' + sent);
}


// ════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
//  All values via esc(). All templates share emailWrap() for consistent shell.
// ════════════════════════════════════════════════════════════════════════════
function buildSellerConfirmHtml(fn, data, price) {
  return emailWrap('Listing confirmed', 'Auto-matcher is now searching for buyers in your area.',
    section('Hey ' + esc(fn) + ' - your listing is live.') +
    para("Our auto-matcher runs every 15 minutes and pairs you with a verified buyer in your area at your locked price. The moment a match exists, we email both of you - no waiting on a human.") +
    para("If we don't have local buyers for this game right now, your Bond stays open until one shows up. Demand outside your area? We'll email you the moment shipping launches (we're working on it).") +
    detailCard([
      ['Game', esc(data.game || '-')],
      ['Your price', '$' + price],
      ['Condition', esc(data.condition || 'A1 - Like New')],
      ['Available', esc(data.timeline || '-')],
      ['Zip', esc(data.zip || '-')]
    ], 'green') +
    steps([
      'Our auto-matcher pairs you with a verified buyer in your area at the same locked price.',
      "When matched, you both get an email with each other's contact info.",
      'You coordinate a public meetup - library, coffee shop, or Target lobby.',
      'Buyer inspects the game before money changes hands. Price is locked - no haggling.'
    ]) + founderNote() + learnMore()
  );
}

function buildBuyerConfirmHtml(fn, data, price) {
  return emailWrap('Request confirmed', 'Auto-matcher is now searching for A1 sellers in your area.',
    section('Hey ' + esc(fn) + ' - we are on it.') +
    para('Our auto-matcher runs every 15 minutes and pairs you with a verified A1 seller in your area at your locked price. The moment a match exists, we email both of you.') +
    para("If we don't have local sellers for this game right now, your Bond stays open until one shows up. We'll also email you the moment shipping launches (so you can tap into supply outside your area).") +
    detailCard([
      ['Game', esc(data.game || '-')],
      ['Your budget', '$' + price],
      ['Condition', 'A1 - Like New (guaranteed)'],
      ['Needed by', esc(data.timeline || '-')],
      ['Zip', esc(data.zip || '-')]
    ], 'blue') +
    steps([
      'Our auto-matcher finds a local seller whose game, condition, and price match your request.',
      "You both get an email with each other's contact info.",
      'You arrange a public meetup - inspect the game before you pay.',
      'If the game is not as described, do not complete the trade. Email us immediately.'
    ]) + founderNote() + learnMore()
  );
}

function buildMatchHtml(me, them) {
  var isSeller = String(me.role || '').toLowerCase().indexOf('sell') !== -1;
  var agreedPrice = Math.min(me.price || 999, them.price || 999);
  var theirFirst = esc(String(them.name || '').split(' ')[0] || 'Your match');
  var myFirst = esc(String(me.name || '').split(' ')[0] || 'there');
  return emailWrap(
    'Match found',
    isSeller ? 'A buyer wants your game. Here is their contact.' : 'A seller has your game. Here is their contact.',
    section('You have a match, ' + myFirst + '.') +
    para('Both of you submitted compatible listings. ' +
      (isSeller
        ? theirFirst + ' wants to buy your copy of ' + esc(me.game) + ' and agreed to your price.'
        : theirFirst + ' has a copy of ' + esc(me.game) + ' in ' + esc(them.condition || 'A1') + ' condition at your budget.') +
      ' Reach out within 24 hours to lock in the meetup.') +
    detailCard([
      ['Game', esc(me.game)],
      ['Agreed price', '$' + agreedPrice],
      ['Condition', isSeller ? esc(them.condition || 'A1') + ' expected' : esc(them.condition || 'A1') + ' - as listed'],
      [isSeller ? 'Buyer' : 'Seller', esc(them.name)],
      ['Their email', '<a href="mailto:' + esc(them.email) + '" style="color:#16a34a;">' + esc(them.email) + '</a>'],
      ['Their zip', esc(them.zip || '-')]
    ], 'green') +
    ctaButton('Email ' + theirFirst + ' Now', 'mailto:' + esc(them.email)) +
    divider() +
    steps([
      'Email ' + theirFirst + ' at ' + esc(them.email) + ' to say hello and propose a meetup time.',
      'Choose a public location - library lobby, Target, Starbucks, or police station community room.',
      isSeller ? 'Bring the game in its described condition. Buyer inspects before paying.'
               : 'Bring exact payment. Inspect the game before you pay.',
      'Once done, reply to this email to confirm. Both of you will be prompted to rate each other.'
    ]) + safety() + (me.founder ? founderCelebration(me.founder, me.tradeNum) : '') + learnMore()
  );
}

function buildRateYourPartnerHtml(fn, partnerName, game, price, rateUrl) {
  return emailWrap('Rate your Bond', 'How did it go? Takes 30 seconds.',
    section('Bond complete, ' + esc(fn) + '. How was it?') +
    para('Your trade for <strong>' + esc(game) + '</strong> with ' + esc(partnerName) + ' is confirmed complete. Your rating helps the whole community.') +
    detailCard([['Game', esc(game)], ['Price', '$' + price], ['Partner', esc(partnerName)]], 'green') +
    ctaButton('Rate ' + esc(String(partnerName).split(' ')[0] || 'Your Partner') + ' &rarr;', rateUrl || CONFIG.ratingUrl) +
    para('<em style="color:#999;font-size:12px;">You can also reply to this email with how it went and we will handle it.</em>') +
    learnMore()
  );
}

function buildRatingReceivedHtml(fn, avg, data) {
  var filled = Math.round(parseFloat(avg));
  var stars = '';
  for (var i = 0; i < 5; i++) stars += (i < filled ? '&#9733;' : '&#9734;');
  var good = parseFloat(avg) >= 4.0;
  var safeGame = esc(data.game || 'Recent Bond');
  var safeComment = esc(data.comment || '');
  return emailWrap(
    good ? 'New rating - ' + avg + '/5' : 'Rating received',
    good ? 'Great trade. Your reputation grows.' : 'A rating was left for your recent trade.',
    section('Hey ' + esc(fn) + ' - you received a rating.') +
    '<div style="text-align:center;padding:24px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;margin:20px 0;">' +
    '<div style="font-size:30px;color:#f59e0b;letter-spacing:3px;margin-bottom:8px;">' + stars + '</div>' +
    '<div style="font-size:38px;font-weight:800;color:#0d2318;margin-bottom:6px;">' + avg + '<span style="font-size:16px;color:#555;"> / 5</span></div>' +
    '<div style="font-size:13px;color:#555;">Trade: ' + safeGame + '</div>' +
    (safeComment ? '<div style="margin-top:12px;padding:12px;background:#fff;border-radius:8px;font-size:13px;color:#333;font-style:italic;">&ldquo;' + safeComment + '&rdquo;</div>' : '') +
    '</div>' +
    para(good
      ? 'Consistent ratings above 4.5 unlock your <strong>Trusted Trader</strong> badge and improve your match position.'
      : 'Reply to this email if you think this review was unfair and we will look into it.') +
    ctaButton('View Your Profile', CONFIG.portalUrl) + learnMore()
  );
}


// ════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATE BUILDING BLOCKS (shared across files)
// ════════════════════════════════════════════════════════════════════════════
function emailWrap(title, subtitle, body) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f7f7f4;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f7f7f4;"><tr><td align="center">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">' +
    '<tr><td style="background:#0a1f12;border-radius:14px 14px 0 0;padding:30px 28px 24px;text-align:center;">' +
    '<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:14px;"><span style="color:#fff;">Cartridge</span><span style="color:#22c55e;">Bond</span></div>' +
    '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">' + title + '</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,0.55);">' + subtitle + '</div>' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:30px 28px;">' + body + '</td></tr>' +
    '<tr><td style="background:#0a1f12;border-radius:0 0 14px 14px;padding:18px 28px;text-align:center;font-size:11px;color:rgba(255,255,255,0.4);line-height:1.9;">' +
    '<a href="' + CONFIG.faqUrl + '" style="color:rgba(255,255,255,0.55);text-decoration:none;">FAQ</a> &middot; ' +
    '<a href="' + CONFIG.meetupGuide + '" style="color:rgba(255,255,255,0.55);text-decoration:none;">Safe Meetup</a> &middot; ' +
    '<a href="' + CONFIG.priceGuide + '" style="color:rgba(255,255,255,0.55);text-decoration:none;">Price Guide</a> &middot; ' +
    '<a href="' + CONFIG.portalUrl + '" style="color:rgba(255,255,255,0.55);text-decoration:none;">My Bonds</a><br>' +
    '<span style="color:rgba(255,255,255,0.3);">Reply to this email - a real person reads every message.</span>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function section(t) { return '<p style="font-size:17px;font-weight:700;color:#0d0d0d;margin:0 0 12px;">' + t + '</p>'; }
function para(h) { return '<p style="font-size:14px;color:#444;line-height:1.75;margin:0 0 16px;">' + h + '</p>'; }
function divider() { return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">'; }

function detailCard(rows, accent) {
  var C = {
    green: { bg:'#f0fdf4', bo:'#86efac', la:'#166534', va:'#14532d', st:'#dcfce7' },
    blue:  { bg:'#eff6ff', bo:'#93c5fd', la:'#1e40af', va:'#1e3a8a', st:'#dbeafe' },
    red:   { bg:'#fef2f2', bo:'#fca5a5', la:'#991b1b', va:'#7f1d1d', st:'#fee2e2' }
  };
  var c = C[accent] || C.green;
  var h = '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + c.bg + ';border:1.5px solid ' + c.bo + ';border-radius:10px;margin:20px 0;overflow:hidden;">';
  rows.forEach(function(r, i) {
    var bg = i % 2 === 0 ? c.bg : c.st;
    h += '<tr style="background:' + bg + ';">' +
         '<td style="padding:10px 16px;font-size:12px;color:' + c.la + ';width:38%;border-bottom:1px solid ' + c.bo + ';">' + r[0] + '</td>' +
         '<td style="padding:10px 16px;font-size:13px;font-weight:700;color:' + c.va + ';border-bottom:1px solid ' + c.bo + ';">' + r[1] + '</td></tr>';
  });
  return h + '</table>';
}

function steps(list) {
  var h = '<p style="font-size:14px;font-weight:700;color:#0d0d0d;margin:20px 0 10px;">What happens next</p><table width="100%">';
  list.forEach(function(s, i) {
    h += '<tr><td style="padding:7px 0;vertical-align:top;width:28px;">' +
         '<div style="width:22px;height:22px;background:#22c55e;border-radius:50%;font-size:12px;font-weight:800;color:#fff;text-align:center;line-height:22px;">' + (i + 1) + '</div>' +
         '</td><td style="padding:7px 0 7px 10px;font-size:13px;color:#444;line-height:1.65;">' + s + '</td></tr>';
  });
  return h + '</table>';
}

function ctaButton(label, href) {
  return '<div style="text-align:center;margin:24px 0;"><a href="' + href + '" style="display:inline-block;background:#22c55e;color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:30px;text-decoration:none;letter-spacing:0.3px;">' + label + '</a></div>';
}

function safety() {
  return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:12px;color:#64748b;line-height:1.7;">' +
    '<strong style="color:#334155;">Safety reminder:</strong> Always meet in public. Inspect before paying. Never send payment before seeing the item. ' +
    '<a href="' + CONFIG.meetupGuide + '" style="color:#16a34a;">Meetup guide &rarr;</a></div>';
}

function founderNote() {
  return '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 18px;margin:20px 0;font-size:13px;color:#14532d;line-height:1.65;">' +
    '<div style="font-weight:800;color:#166534;font-size:14px;margin-bottom:6px;">You could be a Founder.</div>' +
    'The first 25 traders to complete a transaction on CartridgeBond get <strong>free trades for life</strong> - even after we introduce platform fees post-beta. ' +
    'Your slot locks in the moment your first trade completes.' +
    '</div>';
}

function founderCelebration(num, tradeNum) {
  return '<div style="background:#0a1f12;border-radius:10px;padding:20px;margin:20px 0;text-align:center;">' +
    '<div style="font-size:14px;font-weight:800;color:#22c55e;letter-spacing:3px;">FOUNDER #' + num + '</div>' +
    '<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:6px;">Free trades for life &middot; Trade #' + tradeNum + ' platform-wide</div>' +
    '</div>';
}

function learnMore() {
  return '<div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f0;">' +
    '<a href="' + CONFIG.portalUrl + '" style="font-size:12px;color:#16a34a;text-decoration:none;margin:0 10px;">My Bonds</a>' +
    '<a href="' + CONFIG.meetupGuide + '" style="font-size:12px;color:#16a34a;text-decoration:none;margin:0 10px;">Safe Meetup</a>' +
    '<a href="' + CONFIG.faqUrl + '" style="font-size:12px;color:#16a34a;text-decoration:none;margin:0 10px;">FAQ</a>' +
    '</div>';
}


// ════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════════════════
function sendEmail(to, subject, html) {
  GmailApp.sendEmail(to, subject,
    html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 400),
    { name: CONFIG.senderName, replyTo: CONFIG.adminEmail, htmlBody: html });
}

function subjectLine(prefix, game) {
  return prefix + ' - ' + String(game || '').split(' | ')[0].substring(0, 40) + ' - CartridgeBond';
}

function normalizeGame(g) {
  return String(g || '').toLowerCase().trim()
    .replace(/nintendo switch\s*2?/gi, '')
    .replace(/ps[45]/gi, '')
    .replace(/xbox\s*(series\s*[xs]+|one)?/gi, '')
    .replace(/\|.*$/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function gamesMatch(g1, g2) {
  if (!g1 || !g2) return false;
  var n1 = normalizeGame(g1), n2 = normalizeGame(g2);
  if (n1 === n2) return true;
  var l = Math.min(Math.max(n1.length, n2.length) - 2, 14);
  if (l > 4 && n2.indexOf(n1.substring(0, l)) !== -1) return true;
  if (l > 4 && n1.indexOf(n2.substring(0, l)) !== -1) return true;
  return false;
}

function isDuplicate(sheet, data) {
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var email = String(data.email || '').toLowerCase().trim();
  var game = normalizeGame(data.game);
  for (var i = rows.length - 1; i >= 1; i--) {
    var rTime = rows[i][COL.timestamp-1];
    if (!rTime) continue;
    if ((now - new Date(rTime)) / 1000 > CONFIG.dedupSeconds) break;
    if (String(rows[i][COL.email-1] || '').toLowerCase().trim() === email &&
        gamesMatch(game, normalizeGame(String(rows[i][COL.game-1] || ''))))
      return true;
  }
  return false;
}

function isOverDailyLimit(sheet, email) {
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var emailLC = String(email || '').toLowerCase().trim();
  var count = 0;
  for (var i = 1; i < rows.length; i++) {
    var rEmail = String(rows[i][COL.email-1] || '').toLowerCase().trim();
    var rTime = rows[i][COL.timestamp-1];
    if (rEmail !== emailLC || !rTime) continue;
    if (new Date(rTime) >= dayStart) count++;
  }
  return count >= CONFIG.maxDailySubmits;
}

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getAndIncrementTradeCounter() {
  var p = PropertiesService.getScriptProperties();
  var cnt = parseInt(p.getProperty('tradeCounter') || '0') + 1;
  p.setProperty('tradeCounter', cnt.toString());
  return cnt;
}

function getNameForEmail(email) {
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  email = String(email).toLowerCase().trim();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.email-1] || '').toLowerCase().trim() === email) {
      var n = String(rows[i][COL.name-1] || '').trim();
      if (n) return n;
    }
  }
  return email.split('@')[0];
}


// ════════════════════════════════════════════════════════════════════════════
//  SHEET SETUP — run initSheets() once after deploy
// ════════════════════════════════════════════════════════════════════════════
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sub = ss.getSheetByName(CONFIG.sheetName) || ss.insertSheet(CONFIG.sheetName);
  if (!sub.getRange(1, 1).getValue()) {
    sub.getRange(1, 1, 1, 24).setValues([[
      'Timestamp', 'Name', 'Email', 'Phone', 'Zip', 'Role', 'Game', 'Price', 'Condition',
      'Timeline', 'Notes', 'Form Type', 'City', 'Status', 'Matched Row', 'Matched Email',
      'Matched At', 'Match Email Sent', 'Follow-up Sent', 'Meetup Pref',
      'Rating', 'Review Count', 'Founder Number', 'Trade Number'
    ]]);
    sub.getRange(1, 1, 1, 24).setFontWeight('bold').setBackground('#0a1f12').setFontColor('#22c55e');
    sub.setFrozenRows(1);
    Logger.log('Submissions sheet headers added');
  }

  var rat = ss.getSheetByName(CONFIG.ratingsSheet) || ss.insertSheet(CONFIG.ratingsSheet);
  if (!rat.getRange(1, 1).getValue()) {
    rat.getRange(1, 1, 1, 11).setValues([[
      'Timestamp', 'Rater Email', 'Ratee Email', 'Trade Number', 'Ratee Role',
      'Stars 1', 'Stars 2', 'Stars 3', 'Stars 4', 'Average', 'Comment'
    ]]);
    rat.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#0a1f12').setFontColor('#22c55e');
    rat.setFrozenRows(1);
    Logger.log('Ratings sheet headers added');
  }

  var esc2 = ss.getSheetByName('Escrow') || ss.insertSheet('Escrow');
  if (!esc2.getRange(1, 1).getValue()) {
    esc2.getRange(1, 1, 1, 27).setValues([[
      'Trade ID', 'Buyer Email', 'Seller Email', 'Game', 'Amount', 'BOND Fee', 'Stripe Fee',
      'Shippo Fee', 'Net to Seller', 'Status', 'Stripe Payment Intent', 'Stripe Transfer ID',
      'Shippo Shipment ID', 'Shippo Transaction ID', 'Tracking Number', 'Tracking URL',
      'From Zip', 'To Zip', 'Funded At', 'Label At', 'Shipped At', 'Delivered At',
      'Inspection Ends At', 'Released At', 'Disputed At', 'Dispute Reason', 'Notes'
    ]]);
    esc2.getRange(1, 1, 1, 27).setFontWeight('bold').setBackground('#0a1f12').setFontColor('#22c55e');
    esc2.setFrozenRows(1);
    Logger.log('Escrow sheet headers added');
  }

  Logger.log('All sheets initialized. Run installTriggers() next.');
}


// ════════════════════════════════════════════════════════════════════════════
//  TRIGGERS
// ════════════════════════════════════════════════════════════════════════════
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('scheduledMatchSweep').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('sendFollowUpRatingRequests').timeBased().everyDays(1).atHour(10).create();
  ScriptApp.newTrigger('cleanupExpiredSessions').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  if (typeof autoReleaseExpiredInspections === 'function') {
    ScriptApp.newTrigger('autoReleaseExpiredInspections').timeBased().everyHours(1).create();
  }
  Logger.log('Triggers installed: matchSweep(15m), followUp(daily 10am), sessionCleanup(weekly), escrowAutoRelease(hourly if escrow loaded)');
}


// ════════════════════════════════════════════════════════════════════════════
//  TESTS — run from the function dropdown in the editor
// ════════════════════════════════════════════════════════════════════════════
function testEmailDelivery() {
  var to = Session.getActiveUser().getEmail();
  sendEmail(to, 'CartridgeBond email system live',
    emailWrap('System test', 'All templates working.',
      section('Everything is working.') +
      para('GmailApp is authorized. All email templates are loaded. Auto-match is armed.') +
      detailCard([
        ['GmailApp', 'Authorized'],
        ['Templates', 'All loaded'],
        ['esc() guard', 'Active'],
        ['API version', CONFIG.apiVersion]
      ], 'green') +
      ctaButton('Visit CartridgeBond', CONFIG.siteUrl)
    )
  );
  Logger.log('Test email sent to ' + to);
}

function testSecurityChecks() {
  Logger.log('=== Security Checks ===');
  try { getSessionSecret(); Logger.log('SESSION_SECRET: SET'); }
  catch(e) { Logger.log('SESSION_SECRET: NOT SET - run generateSecret() and add to Script Properties'); }
  try { getRatingSecret(); Logger.log('RATING_SECRET: SET'); }
  catch(e) { Logger.log('RATING_SECRET: NOT SET - run generateSecret() and add to Script Properties'); }
  try { getGoogleClientId(); Logger.log('GOOGLE_CLIENT_ID: SET'); }
  catch(e) { Logger.log('GOOGLE_CLIENT_ID: NOT SET - get from Google Cloud Console and add to Script Properties'); }
  var dirty = '<script>alert("xss")</script>';
  var clean = esc(dirty);
  Logger.log('esc() test: ' + (clean.indexOf('<script>') === -1 ? 'PASS' : 'FAIL') + ' -> ' + clean);
  Logger.log('=== End Checks ===');
}

function testRatingTokenFlow() {
  var token = generateRatingToken('seller@example.com', 'buyer@example.com', '7');
  Logger.log('Token: ' + token.substring(0, 30) + '...');
  var d = verifyRatingToken(token);
  Logger.log('Decoded: ' + JSON.stringify(d));
  Logger.log('Match: ' + (d && d.raterEmail === 'seller@example.com' ? 'YES' : 'NO'));
  var tampered = token.substring(0, token.length - 4) + 'XXXX';
  Logger.log('Tampered token result: ' + verifyRatingToken(tampered) + ' (should be null)');
}

function testSellerSubmission() {
  doPost({ postData: { contents: JSON.stringify({
    name: 'Test Seller', email: Session.getActiveUser().getEmail(),
    zip: '53092', role: 'Sell', game: 'Mario Kart 8 Deluxe', price: '43',
    condition: 'A1', timeline: 'ASAP', meetupPref: 'Flexible', notes: 'Test submission'
  }) } });
  Logger.log('Seller test fired');
}

function testBuyerSubmission() {
  doPost({ postData: { contents: JSON.stringify({
    name: 'Test Buyer', email: Session.getActiveUser().getEmail(),
    zip: '53092', role: 'Buy', game: 'Mario Kart 8 Deluxe', price: '45',
    condition: 'A1', timeline: 'ASAP', meetupPref: 'Flexible', notes: 'Test buyer'
  }) } });
  Logger.log('Buyer test fired - auto-match should run');
}

function testHealthCheck() {
  var result = doGet({ parameter: { action: 'health' } });
  Logger.log('Health: ' + result.getContent());
}
