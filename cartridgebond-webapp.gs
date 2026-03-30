/**
 * CartridgeBond — Google Apps Script Web App
 * ===========================================
 *
 * SETUP INSTRUCTIONS (do this once):
 * ------------------------------------
 * 1. Open your CartridgeBond Submissions Google Sheet
 * 2. Extensions → Apps Script
 * 3. Delete all existing code and paste this entire file
 * 4. Save
 * 5. Deploy → New Deployment
 *    - Type: Web App
 *    - Execute as: Me (cartridgebond@gmail.com)
 *    - Who has access: Anyone
 * 6. Copy the Web App URL
 * 7. Paste that URL into index.html where it says PASTE_YOUR_WEBAPP_URL_HERE
 *
 * EVERY TIME you edit this script:
 *    Deploy → Manage Deployments → Edit → New Version → Deploy
 *    (URL stays the same - only the code updates)
 */

// ─── CONFIGURATION ────────────────────────────────────────────

var CONFIG = {
  adminEmail:    'cartridgebond@gmail.com',
  senderName:    'CartridgeBond',
  sheetName:     'Submissions',
  siteName:      'CartridgeBond',
  siteUrl:       'https://cartridgebond.com',
  meetupGuide:   'https://cartridgebond.com/meetup.html',
  faqUrl:        'https://cartridgebond.com/faq.html',
  priceGuide:    'https://cartridgebond.com/prices.html',
  blogUrl:       'https://cartridgebond.com/blog/index.html',
  ratingFormUrl: 'https://forms.gle/REPLACE_WITH_YOUR_RATING_FORM',
};

// ─── WEB APP ENTRY POINT ──────────────────────────────────────

function doGet(e) {
  // Status lookup for status.html page
  if (e && e.parameter && e.parameter.action === 'status') {
    var email = (e.parameter.email || '').trim().toLowerCase();
    var result = getStatusByEmail(email);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'CartridgeBond API live' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStatusByEmail(email) {
  if (!email) return { submissions: [] };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
    if (!sheet) return { submissions: [] };
    var data = sheet.getDataRange().getValues();
    var found = [];

    for (var i = 1; i < data.length; i++) {
      var rowEmail = String(data[i][2] || '').trim().toLowerCase();
      if (rowEmail === email) {
        found.push({
          date:     data[i][0] ? new Date(data[i][0]).toLocaleDateString() : '',
          role:     String(data[i][5] || ''),
          game:     String(data[i][6] || ''),
          price:    String(data[i][7] || ''),
          timeline: String(data[i][9] || ''),
          status:   String(data[i][13] || 'Under Review'),
        });
      }
    }
    return { submissions: found };
  } catch(err) {
    Logger.log('Status lookup error: ' + err);
    return { submissions: [] };
  }
}

function doPost(e) {
  var output = ContentService
    .createTextOutput(JSON.stringify({ result: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName)
             || SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONFIG.sheetName);

    // Write row to sheet
    var row = [
      new Date(),           // A - Timestamp
      data.name      || '', // B - Name
      data.email     || '', // C - Email
      data.phone     || '', // D - Phone
      data.zip       || '', // E - Zip
      data.role      || '', // F - Role
      data.game      || '', // G - Game(s)
      data.price     || '', // H - Price(s)
      data.condition || '', // I - Condition
      data.timeline  || '', // J - Timeline
      data.notes     || '', // K - Notes
      data.formType  || '', // L - Form Type
      data.city      || '', // M - City
    ];
    sheet.appendRow(row);

    // Send confirmation email
    var firstName = (data.name || 'there').trim().split(' ')[0];
    var role      = (data.role || '').toLowerCase();
    var emailHtml = '';

    if (role.includes('sell')) {
      emailHtml = buildSellerConfirmEmail(firstName, data);
      GmailApp.sendEmail(data.email, 'Got your listing - CartridgeBond', '', {
        name: CONFIG.senderName, replyTo: CONFIG.adminEmail, htmlBody: emailHtml,
      });
    } else if (role.includes('buy')) {
      emailHtml = buildBuyerConfirmEmail(firstName, data);
      GmailApp.sendEmail(data.email, 'Got your request - CartridgeBond', '', {
        name: CONFIG.senderName, replyTo: CONFIG.adminEmail, htmlBody: emailHtml,
      });
    } else if (role.includes('waitlist') || data.formType === 'waitlist') {
      emailHtml = buildWaitlistConfirmEmail(firstName, data);
      GmailApp.sendEmail(data.email, "You're on the waitlist - CartridgeBond", '', {
        name: CONFIG.senderName, replyTo: CONFIG.adminEmail, htmlBody: emailHtml,
      });
    }

    // Notify admin
    notifyAdmin(data);

  } catch(err) {
    Logger.log('doPost error: ' + err);
  }

  return output;
}

function notifyAdmin(data) {
  try {
    var role  = (data.role  || 'Submission').replace(' Used', '');
    var game  = (data.game  || 'Unknown game').split(' | ')[0]; // first game only in subject
    var zip   = (data.zip   || '?????');
    var price = (data.resale_price || data.price || '?');

    var subject = '[CB] ' + role + ': ' + game + ' - $' + price.replace('$','') + ' (' + zip + ')';

    var body = [
      'NEW CARTRIDGEBOND SUBMISSION',
      '==============================',
      'Name:      ' + (data.name     || '-'),
      'Email:     ' + (data.email    || '-'),
      'Phone:     ' + (data.phone    || '-'),
      'Zip:       ' + (data.zip      || '-'),
      'Role:      ' + (data.role     || '-'),
      'Game(s):   ' + (data.game     || '-'),
      'Price(s):  ' + (price),
      'Timeline:  ' + (data.timeline || '-'),
      'Condition: ' + (data.condition|| 'A1'),
      'Notes:     ' + (data.notes    || 'none'),
      '==============================',
      'Reply directly to this email to contact the submitter.',
      'Open Sheet: https://docs.google.com/spreadsheets',
    ].join('\n');

    GmailApp.sendEmail(CONFIG.adminEmail, subject, body, {
      replyTo: data.email || CONFIG.adminEmail
    });
  } catch(err) {
    Logger.log('Admin notify error: ' + err);
  }
}

// ─── EMAIL WRAPPER ────────────────────────────────────────────

function emailWrapper(headerText, headerSub, content) {
  return [
    '<!DOCTYPE html><html><head>',
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '</head>',
    '<body style="margin:0;padding:0;background:#f0f2f0;font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f0;padding:24px 16px;">',
    '<tr><td align="center">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">',

    // Header
    '<tr><td style="background:#0d2318;border-radius:12px 12px 0 0;padding:28px 28px 24px;text-align:center;">',
    '<div style="font-family:\'Helvetica Neue\',Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;">',
    '<span style="color:white;">CARTRIDGE</span><span style="color:#22c55e;">BOND</span>',
    '</div>',
    headerText ? '<div style="font-size:18px;font-weight:700;color:white;margin-bottom:6px;line-height:1.2;">' + headerText + '</div>' : '',
    headerSub  ? '<div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.5;">' + headerSub + '</div>' : '',
    '</td></tr>',

    // Body
    '<tr><td style="background:#ffffff;padding:28px 28px 24px;">',
    content,
    '</td></tr>',

    // Footer
    '<tr><td style="background:#111111;border-radius:0 0 12px 12px;padding:18px 24px;">',
    '<table width="100%" cellpadding="0" cellspacing="0">',
    '<tr>',
    '<td style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.8;">',
    '<a href="' + CONFIG.faqUrl + '" style="color:rgba(255,255,255,0.4);text-decoration:none;">FAQ</a>',
    ' &nbsp;·&nbsp; ',
    '<a href="' + CONFIG.meetupGuide + '" style="color:rgba(255,255,255,0.4);text-decoration:none;">Safe Meetup Guide</a>',
    ' &nbsp;·&nbsp; ',
    '<a href="' + CONFIG.priceGuide + '" style="color:rgba(255,255,255,0.4);text-decoration:none;">Price Guide</a>',
    '<br>CartridgeBond - Milwaukee &amp; North Shore',
    '<br>Questions? Reply to this email - a real person reads every message.',
    '</td>',
    '</tr>',
    '</table>',
    '<div style="font-size:10px;color:rgba(255,255,255,0.15);margin-top:10px;">CartridgeBond is a connection platform only - not a party to any transaction.</div>',
    '</td></tr>',

    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
}

// ─── REUSABLE EMAIL COMPONENTS ────────────────────────────────

function summaryCard(label, rows) {
  var rowsHtml = rows.map(function(r) {
    return '<tr>'
      + '<td style="padding:8px 0;border-bottom:1px solid #d1fae5;font-size:13px;color:#166534;width:40%;">' + r[0] + '</td>'
      + '<td style="padding:8px 0;border-bottom:1px solid #d1fae5;font-size:13px;color:#14532d;font-weight:700;">' + r[1] + '</td>'
      + '</tr>';
  }).join('');

  return [
    '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:18px 20px;margin:20px 0;">',
    '<div style="font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#16a34a;margin-bottom:12px;">' + label + '</div>',
    '<table width="100%" cellpadding="0" cellspacing="0">' + rowsHtml + '</table>',
    '</div>',
  ].join('');
}

function infoBox(text) {
  return '<div style="background:#f8f8f5;border-left:3px solid #16a34a;border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:13px;color:#3a3a3a;line-height:1.7;">' + text + '</div>';
}

function ctaButton(text, url) {
  return '<div style="text-align:center;margin:24px 0 8px;">'
    + '<a href="' + url + '" style="display:inline-block;padding:14px 32px;background:#16a34a;color:white;text-decoration:none;border-radius:8px;font-size:15px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;">' + text + '</a>'
    + '</div>';
}

function stepList(steps) {
  var html = '<ol style="margin:12px 0;padding-left:20px;">';
  steps.forEach(function(s) {
    html += '<li style="font-size:14px;color:#3a3a3a;line-height:1.7;margin-bottom:8px;">' + s + '</li>';
  });
  html += '</ol>';
  return html;
}

function founderPerk() {
  return '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#14532d;line-height:1.6;">'
    + '<strong>Founder Perk:</strong> You are one of our first 25 users. Your trades are free for life - even after we introduce fees. Thank you for being early.'
    + '</div>';
}

// ─── CONFIRMATION: SELLER ─────────────────────────────────────

function buildSellerConfirmEmail(firstName, data) {
  var content = [
    '<p style="font-size:15px;color:#0f0f0f;font-weight:600;margin:0 0 6px;">Hey ' + firstName + ' - you\'re in the queue.</p>',
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 4px;">We received your listing and a real person will review it within 24 hours. When we find a buyer whose price, game, and timeline match yours, we\'ll email you immediately.</p>',

    summaryCard('Your Listing', [
      ['Game(s)',    data.game      || '-'],
      ['Your price', data.price    || '-'],
      ['Condition',  'A1 - Like New / Original Case'],
      ['Timeline',   data.timeline || '-'],
      ['Location',   data.zip      || 'Milwaukee area'],
    ]),

    '<p style="font-size:14px;font-weight:700;color:#0f0f0f;margin:20px 0 8px;">What happens next</p>',
    stepList([
      'We review your submission and search for matching buyers in your area.',
      'When we find a match, we email both of you with each other\'s first name and contact info.',
      'You reach out directly, agree on a public meetup spot, and complete the exchange.',
      'Buyer inspects the game before paying. Cash changes hands. Done.',
    ]),

    infoBox('<strong>Prep tip:</strong> Clean the cartridge pins with isopropyl alcohol before your meetup - a clean cartridge inspects faster and builds buyer confidence instantly. '
      + '<a href="' + CONFIG.blogUrl + '" style="color:#16a34a;">Read our seller guides →</a>'),

    ctaButton('View Safe Meetup Guide', CONFIG.meetupGuide),

    '<p style="font-size:12px;color:#999;text-align:center;margin:8px 0 0;">Free during beta. No fees, no platform cut.</p>',
  ].join('');

  return emailWrapper(
    'Listing received.',
    'We\'ll find your buyer - usually within 48 hours.',
    content
  );
}

// ─── CONFIRMATION: BUYER ──────────────────────────────────────

function buildBuyerConfirmEmail(firstName, data) {
  var content = [
    '<p style="font-size:15px;color:#0f0f0f;font-weight:600;margin:0 0 6px;">Hey ' + firstName + ' - we\'re on it.</p>',
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 4px;">Your request is in. We\'ll search for a local seller whose game, condition, and price match what you\'re looking for. When we find one, you\'ll hear from us.</p>',

    summaryCard('Your Request', [
      ['Game(s)',    data.game      || '-'],
      ['Max price',  data.price    || '-'],
      ['Condition',  'A1 - Like New / Original Case'],
      ['Needed by',  data.timeline || '-'],
      ['Location',   data.zip      || 'Milwaukee area'],
    ]),

    '<p style="font-size:14px;font-weight:700;color:#0f0f0f;margin:20px 0 8px;">What happens next</p>',
    stepList([
      'We search for a seller in your area whose terms match yours.',
      'When matched, we email both of you with contact details. The price is already set - no haggling.',
      'You reach out, agree on a public meetup time and spot.',
      'Inspect the cartridge in a Switch before paying. No payment until you\'re comfortable.',
    ]),

    infoBox('<strong>Know before you go:</strong> At the meetup, insert the cartridge into a Switch and confirm it launches to the title screen. Check the pins (should be clean gold) and confirm the case matches what was listed. '
      + '<a href="' + CONFIG.meetupGuide + '" style="color:#16a34a;">Full inspection guide →</a>'),

    '<p style="font-size:13px;color:#555;line-height:1.7;margin:16px 0 0;">While you wait, check our '
      + '<a href="' + CONFIG.priceGuide + '" style="color:#16a34a;">Price Guide</a>'
      + ' to see current Milwaukee market rates for your game - so you know you\'re getting a fair deal.</p>',

    '<p style="font-size:12px;color:#999;text-align:center;margin:20px 0 0;">Free during beta. The price you locked in is the price you pay.</p>',
  ].join('');

  return emailWrapper(
    'Request received.',
    'We\'ll find your game - usually within 48 hours.',
    content
  );
}

// ─── CONFIRMATION: WAITLIST ───────────────────────────────────

function buildWaitlistConfirmEmail(firstName, data) {
  var content = [
    '<p style="font-size:15px;color:#0f0f0f;font-weight:600;margin:0 0 6px;">Hey ' + firstName + ' - you\'re on the list.</p>',
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">We\'ve logged your interest for <strong>' + (data.city || 'your city') + '</strong>. When enough people in your area join the waitlist, CartridgeBond launches there - and you\'ll be first in line.</p>',

    summaryCard('Your Waitlist Entry', [
      ['City / Area', data.city  || '-'],
      ['Status',      'On Waitlist - Priority Access'],
      ['Fees',        'Free - always, for waitlist members'],
    ]),

    infoBox('The fastest way to move your city up the list: share CartridgeBond with anyone nearby who has Switch games to buy or sell. Every signup in your area brings a local launch closer.'),

    ctaButton('Share CartridgeBond', CONFIG.siteUrl),

    '<p style="font-size:12px;color:#999;text-align:center;margin:8px 0 0;">We\'ll email you the moment CartridgeBond launches in your area.</p>',
  ].join('');

  return emailWrapper(
    "You're on the waitlist.",
    "We'll notify you the moment CartridgeBond launches in your area.",
    content
  );
}

// ─── MATCH EMAIL ──────────────────────────────────────────────

function buildMatchEmail(person, match) {
  var isSeller   = person.role.toLowerCase().includes('sell');
  var matchRole  = isSeller ? 'buyer' : 'seller';
  var actionLine = isSeller
    ? 'Your buyer is ready. Reach out to coordinate the meetup - the price is already agreed.'
    : 'Your seller is ready. Reach out to coordinate the meetup - the price is already agreed.';

  var meetupTips = isSeller ? [
    'Clean the cartridge pins before you go - takes 60 seconds and builds trust instantly.',
    'Bring the original case. A1 condition means case included.',
    'Confirm payment method (cash or Venmo) before leaving the house.',
    'Meet in public - library, Starbucks, or police station lobby.',
    'Let the buyer test the cartridge in their Switch before you hand it over.',
  ] : [
    'Bring a Nintendo Switch to the meetup to test the cartridge.',
    'Insert the game and confirm it launches to the title screen before paying.',
    'Check the pins (clean gold), label (no deep scratches), and case condition.',
    'Agree on payment method (cash or Venmo) before you leave the house.',
    'Only pay once you\'re satisfied with the condition.',
  ];

  var content = [
    '<p style="font-size:15px;color:#0f0f0f;font-weight:600;margin:0 0 6px;">Hey ' + person.name + ' - you have a match.</p>',
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 4px;">' + actionLine + '</p>',

    summaryCard('Your Match', [
      ['Game',          person.game],
      ['Agreed price',  person.price],
      ['Condition',     person.condition || 'A1 - Like New'],
      ['Your ' + matchRole, match.name + ' (near ' + match.zip + ')'],
      ['Contact',       '<a href="mailto:' + match.email + '" style="color:#16a34a;">' + match.email + '</a>'],
    ]),

    person.founder ? founderPerk() : '',

    '<p style="font-size:14px;font-weight:700;color:#0f0f0f;margin:20px 0 8px;">Your next steps</p>',
    stepList([
      'Email ' + match.name + ' at <a href="mailto:' + match.email + '" style="color:#16a34a;">' + match.email + '</a> to propose a meetup time and place.',
      'Confirm the payment method over email before you meet.',
      'Meet in a public spot in Milwaukee or the North Shore.',
      isSeller ? 'Let the buyer test the cartridge - then collect payment.' : 'Test the cartridge in your Switch - then pay.',
    ]),

    '<p style="font-size:14px;font-weight:700;color:#0f0f0f;margin:20px 0 8px;">Meetup checklist for ' + (isSeller ? 'sellers' : 'buyers') + '</p>',
    stepList(meetupTips),

    ctaButton('Read the Full Safe Meetup Guide', CONFIG.meetupGuide),

    '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13px;color:#14532d;line-height:1.6;">',
    '<strong>Important:</strong> The price you agreed to (' + person.price + ') is locked. No renegotiating at the meetup. If the other party attempts to change terms, you are not obligated to proceed.',
    '</div>',

    '<p style="font-size:13px;color:#999;margin:16px 0 0;">Something went wrong? Reply to this email within 48 hours and we\'ll help sort it out.</p>',
  ].join('');

  return emailWrapper(
    'Match found.',
    'You have a local ' + matchRole + ' ready for ' + person.game + '.',
    content
  );
}

// ─── FOLLOW-UP / RATING EMAIL ─────────────────────────────────

function buildFollowUpEmail(person) {
  var content = [
    '<p style="font-size:15px;color:#0f0f0f;font-weight:600;margin:0 0 6px;">Hey ' + person.name + ' - how did it go?</p>',
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">It\'s been 48 hours since we matched you for <strong>' + person.game + '</strong>. We hope the trade went smoothly. Rate your experience in 30 seconds - it helps keep CartridgeBond reliable for everyone in Milwaukee.</p>',

    ctaButton('Rate My Trade - 30 Seconds', CONFIG.ratingFormUrl),

    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">',
    '<tr>',
    ratingOption('5', 'Perfect', 'Smooth and exactly as agreed'),
    ratingOption('4', 'Good', 'Minor hiccup but done'),
    ratingOption('3', 'Okay', 'Could have been better'),
    '</tr>',
    '</table>',

    infoBox('<strong>Trade not complete yet?</strong> No problem - reply to this email with a quick update and we\'ll note it. If you hit a no-show or condition issue, let us know - we track reliability and it affects future matching.'),

    '<p style="font-size:13px;color:#555;line-height:1.7;margin:16px 0 8px;">Have another game to sell or buy? <a href="' + CONFIG.siteUrl + '" style="color:#16a34a;">Submit it on CartridgeBond →</a></p>',
  ].join('');

  return emailWrapper(
    'How was your trade?',
    'Rate in 30 seconds - keep CartridgeBond reliable.',
    content
  );
}

function ratingOption(star, label, sub) {
  return '<td style="text-align:center;padding:0 6px;">'
    + '<a href="' + CONFIG.ratingFormUrl + '" style="display:block;background:#f8f8f5;border:1.5px solid #e2e2da;border-radius:8px;padding:12px 8px;text-decoration:none;">'
    + '<div style="font-size:22px;margin-bottom:4px;">' + star + '</div>'
    + '<div style="font-size:12px;font-weight:700;color:#0f0f0f;">' + label + '</div>'
    + '<div style="font-size:11px;color:#999;">' + sub + '</div>'
    + '</a></td>';
}

// ─── SHEET MENU ───────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CartridgeBond')
    .addItem('Send Pending Match Emails', 'sendPendingMatchEmails')
    .addItem('Send Follow-Up Emails (48hr)', 'sendFollowUpEmails')
    .addItem('Install Auto Daily Trigger', 'installTriggers')
    .addSeparator()
    .addItem('Test: Email Yourself (Seller Confirm)', 'sendTestSellerEmail')
    .addItem('Test: Email Yourself (Match)', 'sendTestMatchEmail')
    .addItem('Test: Email Yourself (Follow-Up)', 'sendTestFollowUpEmail')
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
    condition: String(rowData[8] || '').trim() || 'A1 - Like New / Very Good',
    zip:       String(rowData[4] || '').trim(),
    timeline:  String(rowData[9] || '').trim(),
    founder:   String(rowData[15] || '').toLowerCase().includes('founder'),
  };
}

// ─── SEND MATCH EMAILS ────────────────────────────────────────

function sendPendingMatchEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "' + CONFIG.sheetName + '" not found.'); return; }
  var data = sheet.getDataRange().getValues();
  var sent = 0;

  for (var i = 1; i < data.length; i++) {
    var status    = String(data[i][13]).trim(); // Col N
    var emailSent = String(data[i][16]).trim(); // Col Q
    if (status === 'Matched' && !emailSent) {
      sendMatchEmailForRow(sheet, data, i + 1, i);
      sent++;
    }
  }
  SpreadsheetApp.getUi().alert('Done. ' + sent + ' match email(s) sent.');
}

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CONFIG.sheetName) return;
  if (e.range.getRow() <= 1) return;
  if (e.range.getColumn() === 14 && e.value === 'Matched') {
    var data = sheet.getDataRange().getValues();
    sendMatchEmailForRow(sheet, data, e.range.getRow(), e.range.getRow() - 1);
  }
}

function sendMatchEmailForRow(sheet, data, row, idx) {
  if (String(data[idx][16]).trim()) return; // already sent

  var matchedRowNum = parseInt(data[idx][14]); // Col O
  if (!matchedRowNum || isNaN(matchedRowNum)) {
    Logger.log('Row ' + row + ': No match row in Col O - skipping.');
    return;
  }

  var matchIdx = matchedRowNum - 1;
  if (matchIdx < 0 || matchIdx >= data.length) return;

  var person = parseRow(data[idx], row);
  var match  = parseRow(data[matchIdx], matchedRowNum);
  if (!person.email || !match.email) return;

  try {
    GmailApp.sendEmail(person.email, 'You have a match - CartridgeBond', '', {
      name: CONFIG.senderName, replyTo: CONFIG.adminEmail,
      htmlBody: buildMatchEmail(person, match),
    });
    sheet.getRange(row, 17).setValue('Sent ' + new Date().toLocaleDateString());
    Logger.log('Match email sent: row ' + row + ' to ' + person.email);
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
    var status       = String(data[i][13]).trim(); // Col N
    var emailSent    = String(data[i][16]).trim(); // Col Q
    var followUpSent = String(data[i][17]).trim(); // Col R

    if (status !== 'Matched' || !emailSent || followUpSent) continue;

    var sentDate   = new Date(emailSent.replace('Sent ', ''));
    var hoursSince = (now - sentDate) / (1000 * 60 * 60);

    if (hoursSince >= 48) {
      var person = parseRow(data[i], row);
      try {
        GmailApp.sendEmail(person.email, 'How did your CartridgeBond trade go?', '', {
          name: CONFIG.senderName, replyTo: CONFIG.adminEmail,
          htmlBody: buildFollowUpEmail(person),
        });
        sheet.getRange(row, 18).setValue('Sent ' + now.toLocaleDateString());
        sent++;
      } catch(err) {
        Logger.log('Follow-up error row ' + row + ': ' + err);
      }
    }
  }

  try { SpreadsheetApp.getUi().alert('Done. ' + sent + ' follow-up(s) sent.'); } catch(e) {}
}

// ─── TRIGGER SETUP ────────────────────────────────────────────

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendFollowUpEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendFollowUpEmails').timeBased().everyDays(1).atHour(9).create();
  SpreadsheetApp.getUi().alert('Trigger installed. Follow-up emails fire automatically every morning at 9am.');
}

// ─── TEST EMAILS ──────────────────────────────────────────────

function sendTestSellerEmail() {
  var email = Session.getActiveUser().getEmail();
  var data = { name:'Chip', email:email, role:'Sell Used', game:'Mario Kart 8 Deluxe (Nintendo Switch)',
               price:'$43', condition:'A1', zip:'53097', timeline:'This week' };
  GmailApp.sendEmail(email, '[TEST] Seller Confirmation - CartridgeBond', '', {
    name: CONFIG.senderName, htmlBody: buildSellerConfirmEmail('Chip', data),
  });
  SpreadsheetApp.getUi().alert('Test seller email sent to ' + email);
}

function sendTestMatchEmail() {
  var email = Session.getActiveUser().getEmail();
  var seller = { name:'Chip', email:email, role:'Sell Used', game:'Mario Kart 8 Deluxe (Nintendo Switch)',
                 price:'$43', condition:'A1 - Like New', zip:'53097', founder:true };
  var buyer  = { name:'Alex', email:email, role:'Buy Used', game:'Mario Kart 8 Deluxe (Nintendo Switch)',
                 price:'$43', condition:'A1 - Like New', zip:'53092', founder:false };
  GmailApp.sendEmail(email, '[TEST] Match Email - CartridgeBond', '', {
    name: CONFIG.senderName, htmlBody: buildMatchEmail(seller, buyer),
  });
  SpreadsheetApp.getUi().alert('Test match email sent to ' + email);
}

function sendTestFollowUpEmail() {
  var email = Session.getActiveUser().getEmail();
  var person = { name:'Chip', email:email, game:'Mario Kart 8 Deluxe (Nintendo Switch)' };
  GmailApp.sendEmail(email, '[TEST] Follow-Up - CartridgeBond', '', {
    name: CONFIG.senderName, htmlBody: buildFollowUpEmail(person),
  });
  SpreadsheetApp.getUi().alert('Test follow-up email sent to ' + email);
}
