/**
 * CartridgeBond — Google Apps Script Web App
 * ═══════════════════════════════════════════
 *
 * SETUP INSTRUCTIONS (do this once):
 * ────────────────────────────────────
 * 1. Go to sheets.google.com (signed in as cartridgebond@gmail.com)
 * 2. Create a new blank spreadsheet — name it "CartridgeBond Submissions"
 * 3. Click Extensions → Apps Script
 * 4. Delete all existing code and paste THIS entire file
 * 5. Click Save (💾)
 * 6. Click Deploy → New Deployment
 *    - Type: Web App
 *    - Description: CartridgeBond v1
 *    - Execute as: Me (cartridgebond@gmail.com)
 *    - Who has access: Anyone
 * 7. Click Deploy → Copy the Web App URL (looks like https://script.google.com/macros/s/ABC.../exec)
 * 8. Paste that URL into index.html where it says PASTE_YOUR_WEBAPP_URL_HERE
 *
 * EVERY TIME you edit this script you must:
 *    Deploy → Manage Deployments → Edit → New Version → Deploy
 *    (The URL stays the same — only the code updates)
 */

// ─── CONFIGURATION ────────────────────────────────────────────

var CONFIG = {
  adminEmail:    'cartridgebond@gmail.com',
  senderName:    'CartridgeBond',
  sheetName:     'Submissions',        // Tab name inside the spreadsheet
  siteName:      'CartridgeBond',
  meetupGuide:   'https://cartridgebond.com/meetup.html',
  faqUrl:        'https://cartridgebond.com/faq.html',
  ratingFormUrl: 'https://forms.gle/REPLACE_WITH_YOUR_RATING_FORM', // create a Google Form later
};

// ─── WEB APP ENTRY POINT ──────────────────────────────────────

/**
 * Handles GET requests — returns a simple status page
 * (useful for testing the deployment is live)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'CartridgeBond API live ✓' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests from the CartridgeBond form
 */
function doPost(e) {
  var response = { success: false, message: '' };

  try {
    // Parse the incoming form data
    var data = {};
    if (e.postData && e.postData.contents) {
      // JSON body (fetch with JSON.stringify)
      try {
        data = JSON.parse(e.postData.contents);
      } catch(err) {
        // URL-encoded fallback
        var params = e.postData.contents.split('&');
        params.forEach(function(p) {
          var kv = p.split('=');
          if (kv.length === 2) {
            data[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1].replace(/\+/g, ' '));
          }
        });
      }
    } else if (e.parameter) {
      data = e.parameter;
    }

    // Write to Google Sheet
    writeToSheet(data);

    // Send confirmation email to user
    if (data.email) {
      sendConfirmationEmail(data);
    }

    // Send admin notification
    sendAdminNotification(data);

    response.success = true;
    response.message = 'Submission received';

  } catch(err) {
    response.message = 'Error: ' + err.toString();
    Logger.log('doPost error: ' + err.toString());
  }

  // Allow CORS so the browser form can post to this endpoint
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── WRITE TO SHEET ───────────────────────────────────────────

function writeToSheet(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.sheetName);

  // Create sheet and headers if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.sheetName);
    var headers = [
      'Timestamp',           // A
      'Name',                // B
      'Email',               // C
      'Phone',               // D
      'Zip',                 // E
      'Role',                // F
      'Game(s)',             // G
      'Price(s)',            // H
      'Condition',           // I
      'Timeline',            // J
      'Notes',               // K
      'Form Type',           // L
      'City (Waitlist)',     // M
      'Status',              // N  ← type "Matched" to fire match email
      'Matched With (Row)',  // O  ← row number of their match
      'Founder Status',      // P  ← "Founder — Free for Life" for first 25
      'Match Email Sent',    // Q  ← auto-filled
      'Follow-Up Sent',      // R  ← auto-filled
      'No-Show Flag',        // S  ← manual
      'Rating Received',     // T  ← manual 1-5
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Style header row
    var hdr = sheet.getRange(1, 1, 1, headers.length);
    hdr.setBackground('#0d2318');
    hdr.setFontColor('#22c55e');
    hdr.setFontWeight('bold');
    hdr.setFontSize(11);

    // Highlight action columns
    sheet.getRange(1, 14).setBackground('#16a34a').setFontColor('white'); // Status
    sheet.getRange(1, 15).setBackground('#16a34a').setFontColor('white'); // Matched With
    sheet.setFrozenRows(1);
  }

  // Append the new row
  var row = [
    new Date(),                          // Timestamp
    data.name        || '',              // Name
    data.email       || '',              // Email
    data.phone       || '',              // Phone
    data.zip         || '',              // Zip
    data.role        || '',              // Role
    data.game        || '',              // Game(s)
    data.resale_price|| '',              // Price(s)
    data.condition   || '',              // Condition
    data.timeline    || '',              // Timeline
    data.notes       || '',              // Notes
    data.form_type   || 'Main Form',    // Form Type
    data.city        || '',              // City (Waitlist)
    '',                                  // Status (manual)
    '',                                  // Matched With (manual)
    '',                                  // Founder Status (manual)
    '',                                  // Match Email Sent (auto)
    '',                                  // Follow-Up Sent (auto)
    '',                                  // No-Show Flag (manual)
    '',                                  // Rating (manual)
  ];

  sheet.appendRow(row);
  Logger.log('Row written for: ' + (data.email || 'unknown'));
}

// ─── CONFIRMATION EMAIL TO USER ───────────────────────────────

function sendConfirmationEmail(data) {
  var firstName = (data.name || 'there').split(' ')[0];
  var isSell    = String(data.role).toLowerCase().includes('sell');
  var isWaitlist = String(data.form_type).toLowerCase().includes('waitlist');

  var subject, body;

  if (isWaitlist) {
    subject = 'You\'re on the CartridgeBond waitlist!';
    body    = buildWaitlistConfirmEmail(firstName, data);
  } else if (isSell) {
    subject = '🎮 CartridgeBond — We Got Your Listing';
    body    = buildSellerConfirmEmail(firstName, data);
  } else {
    subject = '🎮 CartridgeBond — We Got Your Request';
    body    = buildBuyerConfirmEmail(firstName, data);
  }

  try {
    GmailApp.sendEmail(data.email, subject, '', {
      name:     CONFIG.senderName,
      replyTo:  CONFIG.adminEmail,
      htmlBody: body,
    });
    Logger.log('Confirmation sent to: ' + data.email);
  } catch(err) {
    Logger.log('Confirmation email error: ' + err);
  }
}

// ─── ADMIN NOTIFICATION ───────────────────────────────────────

function sendAdminNotification(data) {
  var subject = '📬 New CartridgeBond submission — ' + (data.name || '?') + ' (' + (data.role || data.form_type || '?') + ')';
  var lines = [
    'Name: '      + (data.name || '—'),
    'Email: '     + (data.email || '—'),
    'Phone: '     + (data.phone || '—'),
    'Zip: '       + (data.zip || '—'),
    'Role: '      + (data.role || data.form_type || '—'),
    'Game(s): '   + (data.game || '—'),
    'Price(s): '  + (data.resale_price || '—'),
    'Condition: ' + (data.condition || '—'),
    'Timeline: '  + (data.timeline || '—'),
    'Notes: '     + (data.notes || '—'),
    'City: '      + (data.city || '—'),
    '',
    'Open your Sheet to review and match.',
  ];

  try {
    GmailApp.sendEmail(CONFIG.adminEmail, subject, lines.join('\n'), {
      name: CONFIG.senderName,
    });
  } catch(err) {
    Logger.log('Admin notification error: ' + err);
  }
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────

function emailWrapper(content) {
  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:20px;background:#f8f8f5;font-family:\'Helvetica Neue\',Arial,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;border:1.5px solid #e2e2da;">',

    // Header
    '<div style="background:#0d2318;padding:22px 24px 18px;text-align:center;">',
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;color:rgba(34,197,94,0.6);margin-bottom:4px;">Cartridge<span style="color:#22c55e;">Bond</span></div>',
    '</div>',

    // Content
    content,

    // Footer
    '<div style="background:#111;padding:14px 24px;text-align:center;">',
    '<div style="font-size:11px;color:rgba(255,255,255,0.3);">',
    '<a href="' + CONFIG.faqUrl + '" style="color:rgba(255,255,255,0.3);">FAQ</a> &nbsp;·&nbsp; ',
    '<a href="' + CONFIG.meetupGuide + '" style="color:rgba(255,255,255,0.3);">Safe Meetup Guide</a>',
    '</div>',
    '<div style="font-size:10px;color:rgba(255,255,255,0.15);margin-top:6px;">CartridgeBond is a connection platform only — not a party to any transaction.</div>',
    '</div>',

    '</div></body></html>',
  ].join('');
}

function buildSellerConfirmEmail(firstName, data) {
  var content = [
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 14px;">Hey ' + firstName + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">We got your listing. Here\'s what we have on file:</p>',

    '<div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;">',
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#16a34a;margin-bottom:10px;">Your Submission</div>',
    '<table style="width:100%;font-size:13px;color:#14532d;border-collapse:collapse;">',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;width:38%;">Game(s)</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + (data.game || '—') + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Your price</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + (data.resale_price || '—') + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Condition</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + (data.condition || 'A1') + '</td></tr>',
    '<tr><td style="padding:5px 0;">Window</td><td style="padding:5px 0;font-weight:600;">' + (data.timeline || '—') + '</td></tr>',
    '</table>',
    '</div>',

    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 14px;"><strong>What happens next:</strong> We\'ll review your submission within 24–48 hours. If we find a buyer who matches your game, price, and window, we\'ll email you directly to coordinate the local meetup.</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">No payment changes hands until you\'ve met in person and you\'re comfortable. Zero obligation.</p>',

    '<div style="background:#f8f8f5;border:1.5px solid #e2e2da;border-radius:8px;padding:14px;margin-bottom:6px;">',
    '<div style="font-size:12px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">While you wait</div>',
    '<p style="font-size:13px;color:#3a3a3a;line-height:1.7;margin:0;">Read our <a href="' + CONFIG.meetupGuide + '" style="color:#16a34a;">Safe Meetup Guide</a> so you\'re ready when your match comes in. Knowing where to meet and what to inspect makes everything smoother.</p>',
    '</div>',
    '</div>',
  ].join('');

  return emailWrapper(content);
}

function buildBuyerConfirmEmail(firstName, data) {
  var content = [
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 14px;">Hey ' + firstName + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">We got your request. Here\'s what we have on file:</p>',

    '<div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;">',
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#16a34a;margin-bottom:10px;">Your Request</div>',
    '<table style="width:100%;font-size:13px;color:#14532d;border-collapse:collapse;">',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;width:38%;">Game(s)</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + (data.game || '—') + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Locked price</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + (data.resale_price || '—') + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Condition</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">A1 — Like New / Very Good</td></tr>',
    '<tr><td style="padding:5px 0;">Needed by</td><td style="padding:5px 0;font-weight:600;">' + (data.timeline || '—') + '</td></tr>',
    '</table>',
    '</div>',

    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 14px;"><strong>What happens next:</strong> We\'ll search for a seller who matches your game, price, and timeline. If we find one, we\'ll connect you by email to set up a local meetup. First in, first matched.</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">The price you see is the price you pay. No bidding, no haggling at the meetup. Inspect before you pay — that\'s the only rule.</p>',

    '<div style="background:#f8f8f5;border:1.5px solid #e2e2da;border-radius:8px;padding:14px;">',
    '<p style="font-size:13px;color:#3a3a3a;line-height:1.7;margin:0;">Questions? Just reply to this email. A real person reads every message.</p>',
    '</div>',
    '</div>',
  ].join('');

  return emailWrapper(content);
}

function buildWaitlistConfirmEmail(firstName, data) {
  var content = [
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 14px;">Hey ' + firstName + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">You\'re on the CartridgeBond waitlist for <strong>' + (data.city || 'your city') + '</strong>. We\'ve logged your demand signal.</p>',

    '<div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;">',
    '<p style="font-size:14px;color:#14532d;line-height:1.7;margin:0;">When enough people in your area join the waitlist, we launch there. You\'ll be notified first and get priority matching ahead of new signups — <strong>free, always.</strong></p>',
    '</div>',

    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 14px;">The fastest way to move your city up the list: share CartridgeBond with anyone nearby who has Switch games to sell or buy.</p>',
    '<p style="font-size:13px;color:#777;margin:0;">Questions? Reply to this email anytime.</p>',
    '</div>',
  ].join('');

  return emailWrapper(content);
}

// ─── MATCH EMAIL (same as before, triggered from Sheet) ───────

function buildMatchEmail(person, match) {
  var isSeller  = person.role.toLowerCase().includes('sell');
  var matchLabel = isSeller ? 'buyer' : 'seller';

  var founderNote = person.founder
    ? '<p style="margin:0 0 12px;padding:10px 14px;background:#dcfce7;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#14532d;">🎁 <strong>Founder perk:</strong> Your trades are free for life — even after we introduce fees. Thanks for being one of our first 25.</p>'
    : '';

  var content = [
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 14px;">Hey ' + person.name + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">Good news — we found a <strong>' + matchLabel + '</strong> for your game. Here are the details:</p>',

    '<div style="background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;">',
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#16a34a;margin-bottom:10px;">Match Details</div>',
    '<table style="width:100%;font-size:13px;color:#14532d;border-collapse:collapse;">',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;width:40%;">Game</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + person.game + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Agreed price</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + person.price + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Condition</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + (person.condition || 'A1 — Like New') + '</td></tr>',
    '<tr><td style="padding:5px 0;border-bottom:1px solid #86efac;">Your match</td><td style="padding:5px 0;border-bottom:1px solid #86efac;font-weight:600;">' + match.name + ' (near ' + match.zip + ')</td></tr>',
    '<tr><td style="padding:5px 0;">Their email</td><td style="padding:5px 0;font-weight:600;"><a href="mailto:' + match.email + '" style="color:#16a34a;">' + match.email + '</a></td></tr>',
    '</table>',
    '</div>',

    founderNote,

    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 12px;"><strong>Next step:</strong> Reach out to ' + match.name + ' at the email above to agree on a meetup time, place, and payment method.</p>',

    '<div style="background:#f8f8f5;border:1.5px solid #e2e2da;border-radius:8px;padding:14px;margin-bottom:14px;">',
    '<div style="font-size:11px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Before you meet</div>',
    '<ul style="font-size:13px;color:#3a3a3a;line-height:1.9;margin:0;padding-left:18px;">',
    '<li>Meet in a public place — library, coffee shop, police station lobby</li>',
    '<li>Test the cartridge in a Switch before paying</li>',
    '<li>Inspect the case and confirm all components</li>',
    '<li>Agree on payment method before you leave the house</li>',
    '</ul>',
    '<a href="' + CONFIG.meetupGuide + '" style="display:inline-block;margin-top:10px;font-size:12px;color:#16a34a;">Read the full Safe Meetup Guide →</a>',
    '</div>',

    '<p style="font-size:13px;color:#777;">Questions? Reply to this email — we\'re here.</p>',
    '</div>',
  ].join('');

  return emailWrapper(content);
}

// ─── SEND MATCH EMAILS (triggered from Sheet menu) ────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎮 CartridgeBond')
    .addItem('Send Pending Match Emails', 'sendPendingMatchEmails')
    .addItem('Send Follow-Up Emails (48hr)', 'sendFollowUpEmails')
    .addItem('Install Auto Daily Trigger', 'installTriggers')
    .addSeparator()
    .addItem('Test: Email Yourself', 'sendTestEmail')
    .addToUi();
}

function parseRow(rowData, rowNum) {
  return {
    row:       rowNum,
    name:      String(rowData[1] || '').trim().split(' ')[0] || 'there',
    email:     String(rowData[2] || '').trim(),
    role:      String(rowData[5] || '').trim(),
    game:      String(rowData[6] || '').trim(),
    price:     String(rowData[7] || '').trim(),
    condition: String(rowData[8] || '').trim() || 'A1 — Like New / Very Good',
    zip:       String(rowData[4] || '').trim(),
    founder:   String(rowData[15] || '').toLowerCase().includes('founder'),
  };
}

function sendPendingMatchEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "' + CONFIG.sheetName + '" not found.'); return; }
  var data = sheet.getDataRange().getValues();
  var sent = 0;

  for (var i = 1; i < data.length; i++) {
    var row       = i + 1;
    var status    = String(data[i][13]).trim();  // Col N
    var emailSent = String(data[i][16]).trim();  // Col Q

    if (status === 'Matched' && !emailSent) {
      sendMatchEmailForRow(sheet, data, row, i);
      sent++;
    }
  }
  SpreadsheetApp.getUi().alert('Done. ' + sent + ' match email(s) sent.');
}

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CONFIG.sheetName) return;
  if (e.range.getRow() <= 1) return;
  if (e.range.getColumn() === 14 && e.value === 'Matched') { // Col N
    var data = sheet.getDataRange().getValues();
    sendMatchEmailForRow(sheet, data, e.range.getRow(), e.range.getRow() - 1);
  }
}

function sendMatchEmailForRow(sheet, data, row, idx) {
  var emailSent    = String(data[idx][16]).trim(); // Col Q
  if (emailSent) return;

  var matchedRowNum = parseInt(data[idx][14]); // Col O
  if (!matchedRowNum || isNaN(matchedRowNum)) {
    Logger.log('Row ' + row + ': No match row in Col O — skipping.');
    return;
  }

  var matchIdx = matchedRowNum - 1;
  if (matchIdx < 0 || matchIdx >= data.length) return;

  var person = parseRow(data[idx], row);
  var match  = parseRow(data[matchIdx], matchedRowNum);
  if (!person.email || !match.email) return;

  var subject = '🎮 CartridgeBond — Your Match is Ready!';
  var body    = buildMatchEmail(person, match);

  try {
    GmailApp.sendEmail(person.email, subject, '', {
      name:     CONFIG.senderName,
      replyTo:  CONFIG.adminEmail,
      htmlBody: body,
    });
    sheet.getRange(row, 17).setValue('Sent ' + new Date().toLocaleDateString()); // Col Q
    Logger.log('Match email sent: row ' + row + ' → ' + person.email);
  } catch(err) {
    Logger.log('Match email error row ' + row + ': ' + err);
  }
}

// ─── FOLLOW-UP EMAILS ─────────────────────────────────────────

function sendFollowUpEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var now  = new Date();
  var sent = 0;

  for (var i = 1; i < data.length; i++) {
    var row          = i + 1;
    var status       = String(data[i][13]).trim();  // Col N
    var emailSent    = String(data[i][16]).trim();  // Col Q
    var followUpSent = String(data[i][17]).trim();  // Col R

    if (status !== 'Matched' || !emailSent || followUpSent) continue;

    var sentDate   = new Date(emailSent.replace('Sent ', ''));
    var hoursSince = (now - sentDate) / (1000 * 60 * 60);

    if (hoursSince >= 48) {
      var person = parseRow(data[i], row);
      sendFollowUpEmail(person);
      sheet.getRange(row, 18).setValue('Sent ' + now.toLocaleDateString()); // Col R
      sent++;
    }
  }

  if (typeof SpreadsheetApp.getUi === 'function') {
    try { SpreadsheetApp.getUi().alert('Done. ' + sent + ' follow-up(s) sent.'); } catch(e) {}
  }
}

function sendFollowUpEmail(person) {
  var content = [
    '<div style="padding:24px;">',
    '<p style="font-size:15px;color:#3a3a3a;margin:0 0 14px;">Hey ' + person.name + ',</p>',
    '<p style="font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 18px;">It\'s been a couple days since we matched you. We hope the trade went smoothly! Rate your experience in 30 seconds — it helps keep CartridgeBond reliable for everyone.</p>',
    '<div style="text-align:center;margin-bottom:20px;">',
    '<a href="' + CONFIG.ratingFormUrl + '" style="display:inline-block;padding:13px 28px;background:#16a34a;color:white;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;letter-spacing:.04em;text-transform:uppercase;">Rate My Trade →</a>',
    '</div>',
    '<p style="font-size:13px;color:#777;line-height:1.7;">If something went wrong — no-show, condition issue — just reply to this email. We track reliability and factor it into future matches.</p>',
    '</div>',
  ].join('');

  try {
    GmailApp.sendEmail(person.email, 'How did your CartridgeBond trade go?', '', {
      name:     CONFIG.senderName,
      replyTo:  CONFIG.adminEmail,
      htmlBody: emailWrapper(content),
    });
  } catch(err) {
    Logger.log('Follow-up error: ' + err);
  }
}

// ─── TRIGGER SETUP ────────────────────────────────────────────

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendFollowUpEmails') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sendFollowUpEmails')
    .timeBased().everyDays(1).atHour(9).create();

  SpreadsheetApp.getUi().alert(
    '✓ Trigger installed!\nFollow-up emails will now fire automatically every morning at 9am.'
  );
}

// ─── TEST ─────────────────────────────────────────────────────

function sendTestEmail() {
  var email = Session.getActiveUser().getEmail();
  var fakeSeller = { name:'Test', email:email, role:'Sell Used', game:'Mario Kart 8 Deluxe (Switch)', price:'$43', condition:'A1', zip:'53097', founder:true };
  var fakeBuyer  = { name:'Buyer', email:email, role:'Buy Used',  game:'Mario Kart 8 Deluxe (Switch)', price:'$43', condition:'A1', zip:'53092', founder:false };
  GmailApp.sendEmail(email, '[TEST] CartridgeBond Match Email', '', {
    name: CONFIG.senderName,
    htmlBody: buildMatchEmail(fakeSeller, fakeBuyer),
  });
  SpreadsheetApp.getUi().alert('Test match email sent to ' + email);
}
