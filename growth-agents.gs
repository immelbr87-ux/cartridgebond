/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  growth-agents.gs                                             ║
 * ║  Match Concierge Agent                                       ║
 * ║  ──────────────────────────────────────────────────────────  ║
 * ║  Targets the founder's own ranked real pain points:           ║
 * ║    #1 haggling/inbox grind -> proactive logistics nudge       ║
 * ║    #3 no-shows/door renegotiation -> early check-in           ║
 * ║  before either becomes a bad experience worth complaining     ║
 * ║  about, instead of only reacting after a rating/cancellation. ║
 * ║                                                                ║
 * ║  Adds two columns to the Submissions sheet (26, 27) via a     ║
 * ║  safe additive migration - does not touch existing columns.   ║
 * ║                                                                ║
 * ║  ONE-TIME SETUP:                                               ║
 * ║    1. Run migrateAddConciergeColumns()                        ║
 * ║    2. installTriggers() already schedules both functions      ║
 * ║       below once you add the two lines noted at the bottom.   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

var CONCIERGE_COL = {
  conciergeNudgeSent: 26,  // Z  - sent ~24h after match: meetup logistics tips
  noShowCheckSent:    27,  // AA - sent ~5 days after match if still unresolved
};

function migrateAddConciergeColumns() {
  var sheet = getSheet(CONFIG.sheetName);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 26) {
    sheet.getRange(1, 26, 1, 2).setValues([['ConciergeNudgeSent', 'NoShowCheckSent']]);
    Logger.log('Concierge columns added at 26-27.');
  } else {
    Logger.log('Concierge columns already present (lastCol=' + lastCol + '). No change made.');
  }
}

// ── NUDGE 1: meetup logistics tips, ~20-30h after match ─────────────────────
// Goal: pre-empt haggling/renegotiation by restating the locked price/condition
// and pointing to the meetup guide before the two parties even talk.
function sendMatchConciergeNudges() {
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var sent = 0;

  for (var i = 1; i < rows.length; i++) {
    var status = String(rows[i][COL.status - 1] || '').toLowerCase();
    if (status !== 'matched') continue;

    var nudgeSent = rows[i][CONCIERGE_COL.conciergeNudgeSent - 1];
    var email = String(rows[i][COL.email - 1] || '');
    var matchedAt = rows[i][COL.matchedAt - 1];
    if (nudgeSent || !email || !matchedAt) continue;

    var matchDate = new Date(matchedAt);
    if (isNaN(matchDate)) continue;
    var hours = (now - matchDate) / 3600000;
    if (hours < 20 || hours > 30) continue; // one-shot window, not a spam retry

    try {
      var fn = String(rows[i][COL.name - 1] || '').trim().split(' ')[0] || 'there';
      var game = String(rows[i][COL.game - 1] || 'your game');
      var price = String(rows[i][COL.price - 1] || '');
      var role = String(rows[i][COL.role - 1] || '').toLowerCase();

      sendEmail(email, subjectLine('Quick tips before your meetup', game),
        buildConciergeTipsHtml(fn, game, price, role));

      sheet.getRange(i + 1, CONCIERGE_COL.conciergeNudgeSent).setValue(now);
      sent++;
      Utilities.sleep(200);
    } catch (err) { Logger.log('Concierge nudge err row ' + (i + 1) + ': ' + err); }
  }
  Logger.log('Concierge nudges sent: ' + sent);
}

// ── NUDGE 2: no-show / stalled-match check-in, ~5 days after match ──────────
// Goal: catch a trade that silently never happened, instead of letting it rot
// unmarked and quietly souring someone's impression of CartridgeBond.
function sendNoShowChecks() {
  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var sent = 0;

  for (var i = 1; i < rows.length; i++) {
    var status = String(rows[i][COL.status - 1] || '').toLowerCase();
    if (status !== 'matched') continue; // still not completed or canceled

    var checkSent = rows[i][CONCIERGE_COL.noShowCheckSent - 1];
    var email = String(rows[i][COL.email - 1] || '');
    var matchedAt = rows[i][COL.matchedAt - 1];
    if (checkSent || !email || !matchedAt) continue;

    var matchDate = new Date(matchedAt);
    if (isNaN(matchDate)) continue;
    var days = (now - matchDate) / 86400000;
    if (days < 5 || days > 7) continue;

    try {
      var fn = String(rows[i][COL.name - 1] || '').trim().split(' ')[0] || 'there';
      var game = String(rows[i][COL.game - 1] || 'your game');

      sendEmail(email, subjectLine('Did your trade happen?', game),
        buildNoShowCheckHtml(fn, game));

      sheet.getRange(i + 1, CONCIERGE_COL.noShowCheckSent).setValue(now);
      sent++;
      Utilities.sleep(200);
    } catch (err) { Logger.log('No-show check err row ' + (i + 1) + ': ' + err); }
  }
  Logger.log('No-show checks sent: ' + sent);
}

// ── EMAIL TEMPLATES (reuse emailWrap/section/para/divider from webapp.gs) ───
function buildConciergeTipsHtml(fn, game, price, role) {
  var body =
    section('Hey ' + fn + ',') +
    para('Your ' + esc_(game) + ' Bond is locked at $' + esc_(price) + ' - that price and the agreed A1 condition don\u2019t change at the meetup. That\u2019s the whole point of CartridgeBond: no renegotiating in person.') +
    divider() +
    section('Before you meet') +
    para('&bull; Confirm a public spot and rough time with your trading partner directly.<br>' +
         '&bull; ' + (role.indexOf('sell') !== -1
           ? 'Bring the cartridge in the condition you listed - buyers are expecting A1.'
           : 'Bring cash or a payment method you already agreed on.') + '<br>' +
         '&bull; Mark your trade complete on your dashboard right after - it takes 10 seconds and keeps your CartridgeBond history accurate.') +
    '<a href="' + CONFIG.meetupGuide + '" style="display:inline-block;margin-top:6px;background:#22c55e;color:#fff;font-weight:700;font-size:14px;padding:12px 20px;border-radius:100px;text-decoration:none;">Safe meetup guide &rarr;</a>';
  return emailWrap('Quick tips before you meet', game, body);
}

function buildNoShowCheckHtml(fn, game) {
  var body =
    section('Hey ' + fn + ',') +
    para('It\u2019s been a few days since your ' + esc_(game) + ' match. Just checking in - did the trade happen?') +
    divider() +
    para('If it went through, mark it complete on your dashboard so your history stays accurate. If it fell through - no-show, changed their mind, whatever - let us know and we\u2019ll get you re-matched right away.') +
    '<a href="' + CONFIG.portalUrl + '" style="display:inline-block;margin-top:6px;background:#22c55e;color:#fff;font-weight:700;font-size:14px;padding:12px 20px;border-radius:100px;text-decoration:none;">Go to my dashboard &rarr;</a>';
  return emailWrap('Did your trade happen?', game, body);
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Both triggers below are already registered by installTriggers() in
 * cartridgebond-webapp.gs - nothing further to wire up.
 */
