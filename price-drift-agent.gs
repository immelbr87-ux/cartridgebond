/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  price-drift-agent.gs                                        ║
 * ║  Price Drift Watch                                            ║
 * ║  ──────────────────────────────────────────────────────────  ║
 * ║  Compares cartridgeBondPrice against the eBay-net comp range  ║
 * ║  and GameStop trade-in already tracked per game in games.json ║
 * ║  and emails a digest to the founder when something looks off. ║
 * ║                                                                ║
 * ║  DELIBERATELY DOES NOT auto-change any price - flags only.    ║
 * ║  At low trade volume, one bad automated repricing costs more  ║
 * ║  trust than a stale price ever would.                         ║
 * ║                                                                ║
 * ║  Runs weekly, right after refreshProductIntelligence, so it   ║
 * ║  is always checking the same games.json snapshot.             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

var DRIFT_CONFIG = {
  driftThresholdPct: 0.15,   // CB price >15% outside the eBay-net band = flagged
  minAbsoluteDollarGap: 3,   // ignore drift under $3 - not worth an alert on a $10 game
};

function checkPriceDrift() {
  var games = fetchGamesJson_();
  if (!games.length) { Logger.log('checkPriceDrift: no games loaded, aborting'); return; }

  var flags = [];

  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (g.cartridgeBondPrice == null || g.ebayNetLow == null || g.ebayNetHigh == null) continue;

    var issues = driftIssuesForGame_(g);
    if (issues.length) flags.push({ game: g, issues: issues });
  }

  Logger.log('checkPriceDrift: ' + flags.length + ' games flagged out of ' + games.length);
  if (flags.length) sendDriftDigest_(flags);
}

function driftIssuesForGame_(g) {
  var issues = [];
  var cb = g.cartridgeBondPrice;
  var lowBand = g.ebayNetLow * (1 - DRIFT_CONFIG.driftThresholdPct);
  var highBand = g.ebayNetHigh * (1 + DRIFT_CONFIG.driftThresholdPct);

  if (cb < lowBand && (lowBand - cb) >= DRIFT_CONFIG.minAbsoluteDollarGap) {
    issues.push('CB price ($' + cb + ') is ' + pct_(lowBand, cb) + '% below the eBay-net range ($' +
      g.ebayNetLow + '-' + g.ebayNetHigh + ') - sellers may be leaving money on the table.');
  }
  if (cb > highBand && (cb - highBand) >= DRIFT_CONFIG.minAbsoluteDollarGap) {
    issues.push('CB price ($' + cb + ') is ' + pct_(cb, highBand) + '% above the eBay-net range ($' +
      g.ebayNetLow + '-' + g.ebayNetHigh + ') - buyers may balk or go elsewhere.');
  }
  if (g.gameStopTradeIn != null && g.gameStopTradeIn > cb) {
    issues.push('GameStop trade-in ($' + g.gameStopTradeIn + ') is currently HIGHER than the CB price ($' +
      cb + ') - this undercuts the whole value prop for sellers on this title.');
  }
  return issues;
}

function pct_(a, b) {
  if (!b) return '?';
  return Math.round(Math.abs((a - b) / b) * 100);
}

function sendDriftDigest_(flags) {
  var rows = flags.map(function(f) {
    return '<tr><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-weight:700;">' + esc_(f.game.title) + '</td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#444;">' +
        f.issues.map(esc_).join('<br>') + '</td></tr>';
  }).join('');

  var body =
    section(flags.length + ' game' + (flags.length === 1 ? '' : 's') + ' need a price look') +
    para('Weekly drift check compared each game\u2019s CartridgeBond price against its tracked eBay-net range and GameStop trade-in. Nothing was changed automatically - these are flags for you to review in games.json.') +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">' +
    '<tr><td style="padding:8px;font-size:11px;text-transform:uppercase;color:#888;border-bottom:2px solid #0a1f12;">Game</td>' +
    '<td style="padding:8px;font-size:11px;text-transform:uppercase;color:#888;border-bottom:2px solid #0a1f12;">Issue</td></tr>' +
    rows + '</table>';

  sendEmail(CONFIG.adminEmail, subjectLine('Price drift check', flags.length + ' game(s) flagged'),
    emailWrap('Price Drift Watch', 'Weekly review', body));
}
