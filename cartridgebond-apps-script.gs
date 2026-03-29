/**
 * CartridgeBond - Google Apps Script Match Emailer
 * ─────────────────────────────────────────────────
 * HOW TO SET UP:
 * 1. Open your Google Sheet (the one Formspree feeds into)
 * 2. Click Extensions → Apps Script
 * 3. Paste this entire file, replacing any existing code
 * 4. Click Save, then Run → onOpen (grant permissions when prompted)
 * 5. A "CartridgeBond" menu will appear in your Sheet
 *
 * COLUMN SETUP - Your sheet needs these columns (add if missing):
 *   A: Timestamp
 *   B: Name
 *   C: Email
 *   D: Role (Sell Used / Buy Used)
 *   E: Game(s)
 *   F: Price(s)
 *   G: Condition
 *   H: Zip
 *   I: Notes
 *   J: Status         ← Type "Matched" here to trigger emails
 *   K: Matched With   ← Type the ROW NUMBER of their match here
 *   L: Founder Status ← Type "Founder - Free for Life" for first 25
 *   M: Email Sent     ← Script auto-fills this (do not edit)
 *   N: Follow-Up Sent ← Script auto-fills this
 *
 * TRIGGERING A MATCH:
 *   1. Find both submissions (seller row + buyer row)
 *   2. In column J (Status), type "Matched" for BOTH rows
 *   3. In column K (Matched With), enter the other person's row number
 *      e.g. Seller is row 4, Buyer is row 7
 *      → Row 4 col K: 7  |  Row 7 col K: 4
 *   4. The script watches for "Matched" and fires the emails automatically
 *      via the onEdit trigger - or run "Send Pending Match Emails" from the menu
 */

// ─── CONFIGURATION - update these ───────────────────────────

var CONFIG = {
  senderName:    'CartridgeBond',
  senderEmail:   'hello@cartridgebond.com',   // Your CartridgeBond Gmail
  siteName:      'CartridgeBond',
  meetupGuide:   'https://cartridgebond.com/meetup.html',
  faqUrl:        'https://cartridgebond.com/faq.html',
  ratingFormUrl: 'https://forms.gle/REPLACE_WITH_YOUR_GOOGLE_FORM',  // Create a simple Google Form for post-trade ratings
  sheetName:     'Form Responses 1',  // Tab name in your Google Sheet - update if different
  statusCol:     10,   // Column J (1-indexed)
  matchedCol:    11,   // Column K
  founderCol:    12,   // Column L
  emailSentCol:  13,   // Column M
  followUpCol:   14,   // Column N
};

// ─── MENU ────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎮 CartridgeBond')
    .addItem('Send Pending Match Emails', 'sendPendingMatchEmails')
    .addItem('Send Follow-Up Emails (48hr)', 'sendFollowUpEmails')
    .addItem('Install Auto Daily Trigger', 'installTriggers')
    .addSeparator()
    .addItem('Test: Email Yourself', 'sendTestEmail')
    .addItem('Setup: Create Column Headers', 'setupSheetHeaders')
    .addToUi();
}

// ─── AUTO TRIGGER (fires on any cell edit) ───────────────────

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CONFIG.sheetName) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row <= 1) return; // skip header

  // Only fire when Status column (J) is set to "Matched"
  if (col === CONFIG.statusCol && e.value === 'Matched') {
    sendMatchEmailForRow(sheet, row);
  }
}

// ─── SEND ALL PENDING MATCH EMAILS ───────────────────────────

function sendPendingMatchEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  var data  = sheet.getDataRange().getValues();

  var sent = 0;
  for (var i = 1; i < data.length; i++) {
    var row    = i + 1;
    var status = String(data[i][CONFIG.statusCol - 1]).trim();
    var emailSent = String(data[i][CONFIG.emailSentCol - 1]).trim();

    if (status === 'Matched' && !emailSent) {
      sendMatchEmailForRow(sheet, row);
      sent++;
    }
  }

  SpreadsheetApp.getUi().alert('Done. ' + sent + ' match email(s) sent.');
}

// ─── SEND MATCH EMAIL FOR ONE ROW ────────────────────────────

function sendMatchEmailForRow(sheet, row) {
  var data = sheet.getDataRange().getValues();
  var idx  = row - 1;

  var emailSent  = String(data[idx][CONFIG.emailSentCol - 1]).trim();
  if (emailSent) return; // already sent

  var matchedRowNum = parseInt(data[idx][CONFIG.matchedCol - 1]);
  if (!matchedRowNum || isNaN(matchedRowNum)) {
    Logger.log('Row ' + row + ': No match row number in column K - skipping.');
    return;
  }

  var matchIdx = matchedRowNum - 1;
  if (matchIdx < 0 || matchIdx >= data.length) {
    Logger.log('Row ' + row + ': Match row ' + matchedRowNum + ' out of range.');
    return;
  }

  // Parse this person
  var person = parseRow(data[idx], row);

  // Parse their match
  var match  = parseRow(data[matchIdx], matchedRowNum);

  if (!person.email || !match.email) {
    Logger.log('Missing email for row ' + row + ' or match row ' + matchedRowNum);
    return;
  }

  // Build and send email to THIS person
  var subject = '🎮 CartridgeBond - Your Match is Ready!';
  var body    = buildMatchEmail(person, match);

  try {
    GmailApp.sendEmail(person.email, subject, '', {
      name:     CONFIG.senderName,
      replyTo:  CONFIG.senderEmail,
      htmlBody: body
    });

    // Mark as sent with timestamp
    sheet.getRange(row, CONFIG.emailSentCol).setValue('Sent ' + new Date().toLocaleDateString());
    Logger.log('Match email sent to ' + person.email + ' (row ' + row + ')');
  } catch (err) {
    Logger.log('Error sending to row ' + row + ': ' + err);
  }
}

// ─── SEND FOLLOW-UP EMAILS (48 HOURS AFTER MATCH) ────────────

function sendFollowUpEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  var sent  = 0;

  for (var i = 1; i < data.length; i++) {
    var row         = i + 1;
    var status      = String(data[i][CONFIG.statusCol - 1]).trim();
    var emailSent   = String(data[i][CONFIG.emailSentCol - 1]).trim();
    var followUpSent = String(data[i][CONFIG.followUpCol - 1]).trim();

    if (status !== 'Matched' || !emailSent || followUpSent) continue;

    // Parse the sent date from the emailSent cell
    var sentDate = new Date(emailSent.replace('Sent ', ''));
    var hoursSince = (now - sentDate) / (1000 * 60 * 60);

    if (hoursSince >= 48) {
      var person = parseRow(data[i], row);
      sendFollowUpEmail(person);
      sheet.getRange(row, CONFIG.followUpCol).setValue('Sent ' + now.toLocaleDateString());
      sent++;
    }
  }

  SpreadsheetApp.getUi().alert('Done. ' + sent + ' follow-up email(s) sent.');
}

// ─── PARSE ROW INTO PERSON OBJECT ────────────────────────────

function parseRow(rowData, rowNum) {
  return {
    row:       rowNum,
    name:      String(rowData[1] || '').trim().split(' ')[0] || 'there', // first name only
    email:     String(rowData[2] || '').trim(),
    role:      String(rowData[3] || '').trim(),
    game:      String(rowData[4] || '').trim(),
    price:     String(rowData[5] || '').trim(),
    condition: String(rowData[6] || '').trim() || 'A1 - Like New / Very Good',
    zip:       String(rowData[7] || '').trim(),
    notes:     String(rowData[8] || '').trim(),
    founder:   String(rowData[11] || '').toLowerCase().includes('founder'),
  };
}

// ─── BUILD MATCH EMAIL HTML ───────────────────────────────────

function buildMatchEmail(person, match) {
  var isSeller = person.role.toLowerCase().includes('sell');
  var roleLabel   = isSeller ? 'seller' : 'buyer';
  var matchLabel  = isSeller ? 'buyer' : 'seller';
  var actionVerb  = isSeller ? 'sell' : 'buy';

  var founderNote = person.founder
    ? '<p style="margin:0 0 12px;padding:10px 14px;background:#dcfce7;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#14532d;">🎁 <strong>Founder perk:</strong> Your trades are free for life - even after we introduce fees. Thanks for being one of our first 25.</p>'
    : '';

  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:\'Helvetica Neue\',Arial,sans-serif;background:#f8f8f5;margin:0;padding:20px;">',
    '<div style="max-width:520px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;border:1.5px solid #e2e2da;">',

    // Header
    '<div style="background:#0d2318;padding:24px 24px 20px;text-align:center;">',
    '<div style="font-family:\'Arial Narrow\',\'Barlow Condensed\',sans-serif;font-size:11px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;color:rgba(34,197,94,0.6);margin-bottom:6px;">CartridgeBond</div>',
    '<h1 style="font-family:\'Arial Narrow\',Arial,sans-serif;font-size:28px;font-weight:bold;color:white;margin:0 0 4px;letter-spacing:-.01em;">Your Match is Ready 🎮</h1>',
    '<p style="font-size:13px;color:rgba(255,255,255,0.45);margin:0;">A ' + matchLabel + ' has been found for your game.</p>',
    '</div>',

    // Body
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 18px;">Hey ' + person.name + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">Good news - we found a <strong>' + matchLabel + '</strong> for your submission. Here are the details:</p>',

    // Match summary box
    '<div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;">',
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#16a34a;margin-bottom:10px;">Match Details</div>',
    '<table style="width:100%;font-size:13px;color:#14532d;border-collapse:collapse;">',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;width:40%;">Your game</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + person.game + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Agreed price</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + person.price + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Condition</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + person.condition + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Your match</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + match.name + ' (near ' + match.zip + ')</td></tr>',
    '<tr><td style="padding:5px 0;">Their email</td><td style="padding:5px 0;font-weight:600;"><a href="mailto:' + match.email + '" style="color:#16a34a;">' + match.email + '</a></td></tr>',
    '</table>',
    '</div>',

    founderNote,

    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 12px;"><strong>Your next step:</strong> Reach out to ' + match.name + ' at the email above to coordinate your meetup. Agree on a time, place, and payment method before you meet.</p>',

    // Meetup reminder
    '<div style="background:#f8f8f5;border:1.5px solid #e2e2da;border-radius:8px;padding:14px;margin-bottom:20px;">',
    '<div style="font-size:12px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Before you meet</div>',
    '<ul style="font-size:13px;color:#3a3a3a;line-height:1.8;margin:0;padding-left:18px;">',
    '<li>Meet in a public place (library, coffee shop, police station lobby)</li>',
    '<li>Inspect the game <em>before</em> exchanging payment</li>',
    '<li>Test the cartridge in a Switch - confirm it boots</li>',
    '<li>Agree on payment method in advance</li>',
    '</ul>',
    '<a href="' + CONFIG.meetupGuide + '" style="display:inline-block;margin-top:10px;font-size:12px;color:#16a34a;text-decoration:underline;">Read the full Safe Meetup Guide →</a>',
    '</div>',

    '<p style="font-size:13px;color:#777;line-height:1.7;margin:0;">Questions? Reply to this email - we\'re here. Once your trade is complete, we\'ll send a quick rating request so your match knows you\'re reliable.</p>',
    '</div>',

    // Footer
    '<div style="background:#111;padding:16px 24px;text-align:center;">',
    '<div style="font-size:11px;color:rgba(255,255,255,0.25);">CartridgeBond · Milwaukee &amp; North Shore · <a href="' + CONFIG.faqUrl + '" style="color:rgba(255,255,255,0.3);">FAQ</a></div>',
    '<div style="font-size:10px;color:rgba(255,255,255,0.15);margin-top:4px;">CartridgeBond is a connection platform only and is not a party to this transaction.</div>',
    '</div>',

    '</div></body></html>'
  ].join('');
}

// ─── FOLLOW-UP EMAIL (post-trade rating request) ──────────────

function sendFollowUpEmail(person) {
  var subject = 'How did your CartridgeBond trade go?';
  var body = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:\'Helvetica Neue\',Arial,sans-serif;background:#f8f8f5;margin:0;padding:20px;">',
    '<div style="max-width:520px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;border:1.5px solid #e2e2da;">',
    '<div style="background:#0d2318;padding:20px 24px;text-align:center;">',
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;color:rgba(34,197,94,0.6);">CartridgeBond</div>',
    '<h1 style="font-size:22px;font-weight:bold;color:white;margin:8px 0 0;">How did it go? 🎮</h1>',
    '</div>',
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 14px;">Hey ' + person.name + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">It\'s been a couple days since we matched you. We hope the trade went smoothly! Rate your experience in 30 seconds - it helps keep CartridgeBond trustworthy for everyone.</p>',
    '<div style="text-align:center;margin-bottom:20px;">',
    '<a href="' + CONFIG.ratingFormUrl + '" style="display:inline-block;padding:13px 28px;background:#16a34a;color:white;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;letter-spacing:.04em;text-transform:uppercase;">Rate My Trade →</a>',
    '</div>',
    '<p style="font-size:13px;color:#777;line-height:1.7;margin:0;">If something went wrong - no-show, condition issue, anything - reply to this email and let us know. We track reliability and use it to improve future matches.</p>',
    '</div>',
    '<div style="background:#111;padding:14px 24px;text-align:center;">',
    '<div style="font-size:10px;color:rgba(255,255,255,0.2);">CartridgeBond · A connection platform only · not a party to any transaction.</div>',
    '</div>',
    '</div></body></html>'
  ].join('');

  try {
    GmailApp.sendEmail(person.email, subject, '', {
      name:     CONFIG.senderName,
      replyTo:  CONFIG.senderEmail,
      htmlBody: body
    });
    Logger.log('Follow-up sent to ' + person.email);
  } catch(err) {
    Logger.log('Follow-up error for ' + person.email + ': ' + err);
  }
}

// ─── TEST EMAIL ───────────────────────────────────────────────

function sendTestEmail() {
  var ui    = SpreadsheetApp.getUi();
  var email = Session.getActiveUser().getEmail();

  var fakeSeller = { name:'Test Seller', email:email, role:'Sell Used', game:'Mario Kart 8 Deluxe (Nintendo Switch)', price:'$43', condition:'A1 - Like New / Very Good', zip:'53097', notes:'', founder:true };
  var fakeBuyer  = { name:'Test Buyer',  email:email, role:'Buy Used',  game:'Mario Kart 8 Deluxe (Nintendo Switch)', price:'$43', condition:'A1 - Like New / Very Good', zip:'53092', notes:'', founder:false };

  var body = buildMatchEmail(fakeSeller, fakeBuyer);
  GmailApp.sendEmail(email, '[TEST] CartridgeBond Match Email', '', { name: CONFIG.senderName, htmlBody: body });
  ui.alert('Test email sent to ' + email);
}

// ─── TIME-BASED TRIGGER SETUP ─────────────────────────────────
/**
 * Run ONCE from the CartridgeBond menu to install automatic daily
 * follow-up email checks. After that it runs every morning at 9am.
 *
 * To view/remove: Extensions → Apps Script → Triggers (clock icon)
 */
function installTriggers() {
  // Remove any existing follow-up triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendFollowUpEmails') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Fire follow-up email check every day at 9am
  ScriptApp.newTrigger('sendFollowUpEmails')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  SpreadsheetApp.getUi().alert(
    '✓ Auto-trigger installed!\n\n' +
    'Follow-up emails will now send automatically every morning at 9am ' +
    'for any matches that are 48+ hours old without a follow-up.\n\n' +
    'Verify at: Extensions → Apps Script → Triggers (clock icon in left sidebar).'
  );
}

// ─── SHEET COLUMN SETUP ───────────────────────────────────────
/**
 * Run once to write correct column headers to your Sheet.
 * WARNING: Overwrites Row 1. Back up first if you have existing data there.
 */
function setupSheetHeaders() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    'Setup Column Headers',
    'This writes CartridgeBond headers to Row 1 of "' + CONFIG.sheetName + '".\n\nRow 1 will be overwritten. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) {
    ui.alert('Sheet "' + CONFIG.sheetName + '" not found. Update CONFIG.sheetName and retry.');
    return;
  }

  var headers = [
    'Timestamp',           // A  col 1
    'Name',                // B  col 2
    'Email',               // C  col 3
    'Role',                // D  col 4
    'Game(s)',             // E  col 5
    'Price(s)',            // F  col 6
    'Condition',           // G  col 7
    'Zip Code',            // H  col 8
    'Notes',               // I  col 9
    'Status',              // J  col 10 ← type "Matched" to trigger email
    'Matched With (Row)',  // K  col 11 ← row number of their match
    'Founder Status',      // L  col 12 ← "Founder - Free for Life" for first 25
    'Match Email Sent',    // M  col 13 ← auto-filled by script
    'Follow-Up Sent',      // N  col 14 ← auto-filled by script
    'No-Show Flag',        // O  col 15 ← type "No-Show" if they ghost
    'Rating Received',     // P  col 16 ← post-trade rating 1–5
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Style the header row
  var hdrRange = sheet.getRange(1, 1, 1, headers.length);
  hdrRange.setBackground('#0d2318');
  hdrRange.setFontColor('#22c55e');
  hdrRange.setFontWeight('bold');
  hdrRange.setFontSize(11);

  // Highlight the two action columns in brighter green
  sheet.getRange(1, 10).setBackground('#16a34a').setFontColor('white'); // Status
  sheet.getRange(1, 11).setBackground('#16a34a').setFontColor('white'); // Matched With

  sheet.setFrozenRows(1);

  ui.alert(
    '✓ Headers created in "' + CONFIG.sheetName + '"!\n\n' +
    'Key columns to fill manually:\n' +
    '• Col J - Status: type "Matched" to fire match emails\n' +
    '• Col K - Matched With: enter the row number of their match\n' +
    '• Col L - Founder Status: "Founder - Free for Life" for first 25\n' +
    '• Col O - No-Show Flag: "No-Show" to log ghosts\n' +
    '• Col P - Rating Received: 1–5 stars after trade completes'
  );
}

