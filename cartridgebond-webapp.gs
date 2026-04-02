/**
 * CartridgeBond Google Apps Script
 * ---------------------------------
 * HOW TO UPDATE: Select all code, delete, paste this file, Save, then:
 * Deploy → Manage Deployments → pencil icon → New version → Deploy
 */

var CONFIG = {
  adminEmail:    'cartridgebond@gmail.com',
  senderName:    'CartridgeBond',
  sheetName:     'Submissions',
  siteUrl:       'https://cartridgebond.com',
  meetupGuide:   'https://cartridgebond.com/meetup.html',
  faqUrl:        'https://cartridgebond.com/faq.html',
  priceGuide:    'https://cartridgebond.com/prices.html',
  blogUrl:       'https://cartridgebond.com/blog/index.html',
};

// ── STATUS LOOKUP (for status.html) ─────────────────────────
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'status') {
    var email = (e.parameter.email || '').trim().toLowerCase();
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
      if (!sheet) return respond({ submissions: [] });
      var rows = sheet.getDataRange().getValues();
      var found = [];
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][2] || '').trim().toLowerCase() === email) {
          found.push({
            date:     rows[i][0] ? new Date(rows[i][0]).toLocaleDateString() : '',
            role:     String(rows[i][5] || ''),
            game:     String(rows[i][6] || ''),
            price:    String(rows[i][7] || ''),
            timeline: String(rows[i][9] || ''),
            status:   String(rows[i][13] || 'Under Review'),
          });
        }
      }
      return respond({ submissions: found });
    } catch(err) {
      return respond({ submissions: [] });
    }
  }
  return respond({ status: 'CartridgeBond API live' });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── FORM SUBMISSION ──────────────────────────────────────────
function doPost(e) {
  var output = ContentService.createTextOutput(JSON.stringify({ result: 'ok' })).setMimeType(ContentService.MimeType.JSON);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName)
             || SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONFIG.sheetName);

    // Write row first - always
    sheet.appendRow([
      new Date(),
      data.name         || '',
      data.email        || '',
      data.phone        || '',
      data.zip          || '',
      data.role         || '',
      data.game         || '',
      data.resale_price || data.price || '',
      data.condition    || '',
      data.timeline     || '',
      data.notes        || '',
      data.formType     || '',
      data.city         || '',
      '', '', '', '', '', '', '',
      data.meetupPref   || '',
    ]);

    // Send emails
    var firstName = (data.name || 'there').trim().split(' ')[0];
    var role = (data.role || '').toLowerCase();

    if (role.indexOf('sell') !== -1) {
      GmailApp.sendEmail(data.email, 'Got your listing - CartridgeBond', buildSellerText(firstName, data), {
        name: CONFIG.senderName, replyTo: CONFIG.adminEmail, htmlBody: buildSellerHtml(firstName, data),
      });
    } else if (role.indexOf('buy') !== -1) {
      GmailApp.sendEmail(data.email, 'Got your request - CartridgeBond', buildBuyerText(firstName, data), {
        name: CONFIG.senderName, replyTo: CONFIG.adminEmail, htmlBody: buildBuyerHtml(firstName, data),
      });
    } else if (role.indexOf('waitlist') !== -1 || data.formType === 'waitlist') {
      GmailApp.sendEmail(data.email, "You're on the waitlist - CartridgeBond", 'Thanks ' + firstName + '! We will notify you when CartridgeBond launches in ' + (data.city || 'your area') + '.', {
        name: CONFIG.senderName, replyTo: CONFIG.adminEmail,
      });
    }

    // Admin notification
    var price = data.resale_price || data.price || '?';
    var subject = '[CB] ' + (data.role || 'Submission') + ' - ' + (data.game || '?').split(' | ')[0] + ' (' + (data.zip || '?') + ')';
    GmailApp.sendEmail(CONFIG.adminEmail, subject,
      'Name: '      + (data.name      || '-') + '\n' +
      'Email: '     + (data.email     || '-') + '\n' +
      'Phone: '     + (data.phone     || '-') + '\n' +
      'Zip: '       + (data.zip       || '-') + '\n' +
      'Role: '      + (data.role      || '-') + '\n' +
      'Game: '      + (data.game      || '-') + '\n' +
      'Price: '     + price                   + '\n' +
      'Timeline: '  + (data.timeline  || '-') + '\n' +
      'Meetup: '    + (data.meetupPref|| '-') + '\n' +
      'Notes: '     + (data.notes     || '-'),
      { replyTo: data.email || CONFIG.adminEmail }
    );

    Logger.log('OK: ' + data.email + ' | ' + data.game);
  } catch(err) {
    Logger.log('ERROR: ' + err.toString());
  }
  return output;
}

// ── SELLER EMAIL ─────────────────────────────────────────────
function buildSellerText(firstName, data) {
  return 'Hey ' + firstName + ',\n\nYour listing is in. We will find your buyer within 48 hours and email you when matched.\n\nGame: ' + data.game + '\nPrice: ' + (data.resale_price || data.price) + '\nTimeline: ' + data.timeline + '\n\nQuestions? Reply to this email.\n\n- CartridgeBond';
}

function buildSellerHtml(firstName, data) {
  return wrap(
    'Listing received.',
    'We will find your buyer - usually within 48 hours.',
    '<p style="font-size:15px;font-weight:600;margin:0 0 12px;">Hey ' + firstName + ' - you are in the queue.</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">A real person will review your listing and email you when we find a matching buyer.</p>' +
    card([['Game', data.game || '-'], ['Price', data.resale_price || data.price || '-'], ['Available', data.timeline || '-'], ['Condition', 'A1 - Like New'], ['Zip', data.zip || '-']]) +
    steps(['We review your listing and search for a buyer in your area.', 'When we find a match we email both of you directly.', 'You meet locally, buyer inspects, cash changes hands.']) +
    '<p style="font-size:12px;color:#999;text-align:center;margin-top:20px;">Free during beta. No fees.</p>'
  );
}

// ── BUYER EMAIL ──────────────────────────────────────────────
function buildBuyerText(firstName, data) {
  return 'Hey ' + firstName + ',\n\nYour request is in. We will find a seller within 48 hours and email you when matched.\n\nGame: ' + data.game + '\nMax price: ' + (data.resale_price || data.price) + '\nNeeded by: ' + data.timeline + '\n\nQuestions? Reply to this email.\n\n- CartridgeBond';
}

function buildBuyerHtml(firstName, data) {
  return wrap(
    'Request received.',
    'We will find your seller - usually within 48 hours.',
    '<p style="font-size:15px;font-weight:600;margin:0 0 12px;">Hey ' + firstName + ' - we are on it.</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">A real person will find a local seller that matches your game, condition, and price.</p>' +
    card([['Game', data.game || '-'], ['Max price', data.resale_price || data.price || '-'], ['Needed by', data.timeline || '-'], ['Condition', 'A1 - Like New'], ['Zip', data.zip || '-']]) +
    steps(['We search for a seller in your area whose terms match yours.', 'When we find a match we email both of you directly.', 'You meet locally, inspect before paying, cash changes hands.']) +
    '<p style="font-size:12px;color:#999;text-align:center;margin-top:20px;">Free during beta. No fees.</p>'
  );
}

// ── EMAIL HELPERS ────────────────────────────────────────────
function wrap(title, sub, body) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f0;font-family:Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;background:#f0f2f0;"><tr><td align="center">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">' +
    '<tr><td style="background:#0d2318;border-radius:12px 12px 0 0;padding:28px;text-align:center;">' +
    '<div style="font-size:20px;font-weight:800;letter-spacing:.1em;margin-bottom:10px;"><span style="color:white;">CARTRIDGE</span><span style="color:#22c55e;">BOND</span></div>' +
    '<div style="font-size:18px;font-weight:700;color:white;margin-bottom:6px;">' + title + '</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,0.5);">' + sub + '</div>' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:28px;">' + body + '</td></tr>' +
    '<tr><td style="background:#111;border-radius:0 0 12px 12px;padding:18px 24px;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.8;">' +
    '<a href="' + CONFIG.faqUrl + '" style="color:rgba(255,255,255,0.4);">FAQ</a> &nbsp;·&nbsp; ' +
    '<a href="' + CONFIG.meetupGuide + '" style="color:rgba(255,255,255,0.4);">Safe Meetup Guide</a> &nbsp;·&nbsp; ' +
    '<a href="' + CONFIG.priceGuide + '" style="color:rgba(255,255,255,0.4);">Price Guide</a><br>' +
    'Questions? Reply to this email - a real person reads every message.' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function card(rows) {
  var html = '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:18px;margin:20px 0;"><table width="100%" cellpadding="0" cellspacing="0">';
  rows.forEach(function(r) {
    html += '<tr><td style="padding:7px 0;border-bottom:1px solid #d1fae5;font-size:13px;color:#166534;width:40%;">' + r[0] + '</td><td style="padding:7px 0;border-bottom:1px solid #d1fae5;font-size:13px;font-weight:700;color:#14532d;">' + r[1] + '</td></tr>';
  });
  return html + '</table></div>';
}

function steps(list) {
  var html = '<p style="font-size:14px;font-weight:700;color:#0f0f0f;margin:20px 0 8px;">What happens next</p><ol style="margin:0;padding-left:20px;">';
  list.forEach(function(s) { html += '<li style="font-size:14px;color:#3a3a3a;line-height:1.7;margin-bottom:8px;">' + s + '</li>'; });
  return html + '</ol>';
}

// ── MATCH EMAIL (trigger from sheet: set Status=Matched, MatchedWithRow=row number) ─
function checkAndSendMatchEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var status    = String(rows[i][13] || '').trim();
    var matchRow  = parseInt(rows[i][14]) || 0;
    var emailSent = String(rows[i][16] || '').trim();
    if (status.toLowerCase() === 'matched' && matchRow > 0 && !emailSent) {
      var matchIdx = matchRow - 1;
      if (matchIdx >= 1 && matchIdx < rows.length) {
        try {
          var p1 = rowToPerson(rows[i]);
          var p2 = rowToPerson(rows[matchIdx]);
          GmailApp.sendEmail(p1.email, 'You have a match - CartridgeBond', '', {
            name: CONFIG.senderName, replyTo: p2.email,
            htmlBody: buildMatchHtml(p1, p2),
          });
          GmailApp.sendEmail(p2.email, 'You have a match - CartridgeBond', '', {
            name: CONFIG.senderName, replyTo: p1.email,
            htmlBody: buildMatchHtml(p2, p1),
          });
          sheet.getRange(i + 1, 17).setValue('Sent ' + new Date().toLocaleDateString());
          sheet.getRange(matchRow, 17).setValue('Sent ' + new Date().toLocaleDateString());
          Logger.log('Match emails sent: row ' + (i+1) + ' <-> row ' + matchRow);
        } catch(err) {
          Logger.log('Match email error: ' + err);
        }
      }
    }
  }
}

function rowToPerson(row) {
  return { name: String(row[1]||''), email: String(row[2]||''), role: String(row[5]||''), game: String(row[6]||''), price: String(row[7]||''), zip: String(row[4]||'') };
}

function buildMatchHtml(me, them) {
  var isSeller = me.role.toLowerCase().indexOf('sell') !== -1;
  return wrap(
    'You have a match!',
    isSeller ? 'A buyer wants your game.' : 'A seller has your game.',
    '<p style="font-size:15px;font-weight:600;margin:0 0 12px;">Great news - we found your match.</p>' +
    card([
      ['Game',  me.game],
      ['Price', me.price],
      [isSeller ? 'Buyer' : 'Seller', them.name],
      ['Contact', '<a href="mailto:' + them.email + '" style="color:#16a34a;">' + them.email + '</a>'],
    ]) +
    steps([
      'Email ' + them.name + ' directly at ' + them.email + ' to coordinate.',
      'Agree on a public meetup spot - coffee shop, library, or police station lobby.',
      isSeller ? 'Bring the game. Buyer will inspect before paying.' : 'Bring payment. Inspect the game before paying.',
      'Read our <a href="' + CONFIG.meetupGuide + '" style="color:#16a34a;">Safe Meetup Guide</a> before you go.',
    ])
  );
}

// ── FOLLOW-UP / RATING ───────────────────────────────────────
function sendFollowUpEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var sent = 0;
  for (var i = 1; i < rows.length; i++) {
    var matchSent  = String(rows[i][16] || '');
    var followSent = String(rows[i][17] || '');
    var email      = String(rows[i][2]  || '');
    var name       = String(rows[i][1]  || 'there');
    var game       = String(rows[i][6]  || 'your game');
    if (!matchSent || followSent || !email) continue;
    var matchDate = new Date(matchSent.replace('Sent ', ''));
    if (isNaN(matchDate)) continue;
    var daysSince = (now - matchDate) / (1000 * 60 * 60 * 24);
    if (daysSince >= 3 && daysSince <= 7) {
      try {
        GmailApp.sendEmail(email, 'How did your CartridgeBond trade go?', 'Hey ' + name.split(' ')[0] + ',\n\nHoping your exchange for ' + game + ' went smoothly! Would love to hear how it went.\n\n- CartridgeBond\ncartridgebond@gmail.com', {
          name: CONFIG.senderName, replyTo: CONFIG.adminEmail,
        });
        sheet.getRange(i + 1, 18).setValue('Sent ' + now.toLocaleDateString());
        sent++;
      } catch(err) { Logger.log('Follow-up error: ' + err); }
    }
  }
  Logger.log('Follow-ups sent: ' + sent);
}

// ── TRIGGERS ─────────────────────────────────────────────────
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendFollowUpEmails').timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger('checkAndSendMatchEmails').timeBased().everyMinutes(10).create();
}

// ── TEST - select this and click Run to verify emails work ───
function quickEmailTest() {
  var email = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(email, '[CB] Quick Test - Emails Are Working', 'GmailApp permissions are working. CartridgeBond email system is live.', { name: 'CartridgeBond' });
  Logger.log('Test email sent to ' + email);
}
