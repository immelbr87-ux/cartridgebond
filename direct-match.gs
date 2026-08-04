/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  direct-match.gs                                              ║
 * ║  Lets a buyer/seller browse real committed offers for a game  ║
 * ║  and bond with a specific one, instead of only submitting     ║
 * ║  blind into the black-box auto-matcher.                       ║
 * ║  ──────────────────────────────────────────────────────────  ║
 * ║  doGet  ?action=listOffers&game=X&role=buy|sell                ║
 * ║    role = the role the VIEWER wants to take. Returns the       ║
 * ║    OPPOSITE role's active offers (anonymized - no PII).       ║
 * ║  doPost handleSubmission already wires data.matchOfferId       ║
 * ║    through to lockDirectMatch() below, with a safe fallback   ║
 * ║    to the normal auto-matcher if the offer went stale.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

function handleListOffers(gameParam, wantRole) {
  gameParam = normalizeGame(String(gameParam || ''));
  wantRole = String(wantRole || '').toLowerCase();
  var wantsToSell = wantRole.indexOf('sell') !== -1;
  var wantsToBuy = wantRole.indexOf('buy') !== -1;
  if (!gameParam || (!wantsToSell && !wantsToBuy)) return { ok: false, error: 'missing_params' };

  var sheet = getSheet(CONFIG.sheetName);
  var rows = sheet.getDataRange().getValues();
  var offers = [];

  for (var i = 1; i < rows.length; i++) {
    var status = String(rows[i][COL.status - 1] || '').toLowerCase();
    if (status !== 'active') continue;

    var role = String(rows[i][COL.role - 1] || '').toLowerCase();
    // Viewer wants to SELL -> show BUYER offers they could bond with, and vice versa
    if (wantsToSell && role.indexOf('buy') === -1) continue;
    if (wantsToBuy && role.indexOf('sell') === -1) continue;

    var rowGame = normalizeGame(String(rows[i][COL.game - 1] || ''));
    if (!gamesMatch(gameParam, rowGame)) continue;

    var price = parseFloat(String(rows[i][COL.price - 1] || '0').replace(/[^0-9.]/g, '')) || 0;
    if (price <= 0) continue;

    // Condition is NOT a differentiator between offers - every trade on
    // CartridgeBond is A1-only by design. Price, though, CAN legitimately
    // differ between two offers on the same game: each person locked in at
    // whatever CartridgeBond's researched price was on the day they
    // submitted, and that reference price does move over time as the
    // weekly intelligence refresh updates games.json. So price is shown
    // per-offer (it's what THAT person actually locked), while condition is
    // stated once, up front, since it never varies.
    offers.push({
      offerId: i + 1, // sheet row number - stable enough for a short-lived offer list
      price: price,
      timeline: String(rows[i][COL.timeline - 1] || ''),
      rating: parseFloat(rows[i][COL.rating - 1]) || 0,
      reviewCount: parseInt(rows[i][COL.reviewCount - 1], 10) || 0,
    });
  }

  return {
    ok: true,
    condition: 'A1',            // always - shown once, above the list; price is per-offer below
    offers: offers.slice(0, 20),
    // Sorting is done client-side (soonest / top-rated) since this is the
    // full small list already. Distance sort is meaningless right now since
    // matching is already zip-radius gated during the local-meetup beta -
    // it becomes a real sort dimension once national shipping ships.
  };
}

// Called from handleSubmission when the person picked a specific offer instead

// of setting their own parameters. Mirrors tryAutoMatch's "lock + trade number
// + email both sides" block, but against one chosen row instead of a search.
function lockDirectMatch(sheet, newRowNum, newData, newPrice, targetRowNum) {
  var lastRow = sheet.getLastRow();
  if (!targetRowNum || targetRowNum < 2 || targetRowNum > lastRow || targetRowNum === newRowNum) return false;

  var t = sheet.getRange(targetRowNum, 1, 1, TOTAL_COLS).getValues()[0];
  var tStatus = String(t[COL.status - 1] || '').toLowerCase();
  if (tStatus !== 'active') return false; // someone else took it first - fall back to auto-match

  var newRole = String(newData.role || '').toLowerCase();
  var tRole = String(t[COL.role - 1] || '').toLowerCase();
  var isSeller = newRole.indexOf('sell') !== -1;
  var wantsOpposite = isSeller ? tRole.indexOf('buy') !== -1 : tRole.indexOf('sell') !== -1;
  if (!wantsOpposite) return false;

  var newGame = normalizeGame(newData.game);
  var tGame = normalizeGame(String(t[COL.game - 1] || ''));
  if (!gamesMatch(newGame, tGame)) return false;

  var tEmail = String(t[COL.email - 1] || '').trim().toLowerCase();
  var newEmail = String(newData.email || '').trim().toLowerCase();
  if (tEmail === newEmail) return false;

  var tPrice = parseFloat(String(t[COL.price - 1] || '0').replace(/[^0-9.]/g, '')) || 0;
  var sellPr = isSeller ? newPrice : tPrice;
  var buyPr = isSeller ? tPrice : newPrice;
  if (sellPr <= 0 || buyPr <= 0 || sellPr > buyPr * (1 + CONFIG.priceTolerancePct)) return false;

  // Lock the match
  var matchedAt = new Date();
  sheet.getRange(newRowNum, COL.status).setValue('Matched');
  sheet.getRange(newRowNum, COL.matchedRow).setValue(targetRowNum);
  sheet.getRange(newRowNum, COL.matchedEmail).setValue(tEmail);
  sheet.getRange(newRowNum, COL.matchedAt).setValue(matchedAt);
  sheet.getRange(targetRowNum, COL.status).setValue('Matched');
  sheet.getRange(targetRowNum, COL.matchedRow).setValue(newRowNum);
  sheet.getRange(targetRowNum, COL.matchedEmail).setValue(newEmail);
  sheet.getRange(targetRowNum, COL.matchedAt).setValue(matchedAt);

  var tradeNum = getAndIncrementTradeCounter();
  sheet.getRange(newRowNum, COL.tradeNumber).setValue(tradeNum);
  sheet.getRange(targetRowNum, COL.tradeNumber).setValue(tradeNum);
  var founder = tradeNum <= CONFIG.founderCount ? tradeNum : '';
  if (founder) {
    sheet.getRange(newRowNum, COL.founderNumber).setValue(founder);
    sheet.getRange(targetRowNum, COL.founderNumber).setValue(founder);
  }

  var p1 = {
    name: String(newData.name || '').trim(), email: newEmail, role: newData.role,
    game: newData.game, price: newPrice, condition: String(newData.condition || 'A1'),
    timeline: newData.timeline || '', zip: String(newData.zip || ''), founder: founder, tradeNum: tradeNum,
  };
  var p2 = {
    name: String(t[COL.name - 1] || '').trim(), email: tEmail,
    role: String(t[COL.role - 1] || ''), game: String(t[COL.game - 1] || ''),
    price: tPrice, condition: String(t[COL.condition - 1] || 'A1'),
    timeline: String(t[COL.timeline - 1] || ''), zip: String(t[COL.zip - 1] || ''),
    founder: founder, tradeNum: tradeNum,
  };

  try {
    sendEmail(p1.email, subjectLine('Match found', p1.game), buildMatchHtml(p1, p2));
    sendEmail(p2.email, subjectLine('Match found', p2.game), buildMatchHtml(p2, p1));
    sheet.getRange(newRowNum, COL.matchEmailSent).setValue(matchedAt);
    sheet.getRange(targetRowNum, COL.matchEmailSent).setValue(matchedAt);

    GmailApp.sendEmail(CONFIG.adminEmail,
      '[CB] DIRECT-PICK MATCH #' + tradeNum + ' - ' + p1.game + ' - $' + newPrice,
      'Trade #' + tradeNum + ' (person picked this offer directly)\n' +
      p1.name + ' <' + p1.email + '> (' + p1.role + ')\n  matched with\n' +
      p2.name + ' <' + p2.email + '> (' + p2.role + ')\nGame: ' + p1.game +
      '\nRows: ' + newRowNum + ' <-> ' + targetRowNum,
      { replyTo: CONFIG.adminEmail });

    Logger.log('DIRECT MATCH Trade#' + tradeNum + ' rows ' + newRowNum + '<->' + targetRowNum);
  } catch (err) { Logger.log('Direct match email error: ' + err); }

  return true;
}
