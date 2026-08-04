/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  intelligence-engine.gs                                      ║
 * ║  Product Intelligence Agent - live Ownership Score + AI copy ║
 * ║  ──────────────────────────────────────────────────────────  ║
 * ║  Owns:                                                        ║
 * ║    - Ownership Score (0-100) + 5 star sub-scores              ║
 * ║    - Waitlist tracking ("N members want this")                ║
 * ║    - Real time-to-sell / demand pulled from Submissions       ║
 * ║    - AI narrative generation (Claude API) - numbers-in only,  ║
 * ║      never lets the model invent a stat                       ║
 * ║    - Weekly refresh trigger -> IntelligenceCache sheet         ║
 * ║                                                                ║
 * ║  Frontend reads results via:                                  ║
 * ║    doGet ?action=productIntelligence&slug=X                   ║
 * ║    doGet ?action=productIntelligenceAll                       ║
 * ║    doPost {action:'joinWaitlist', slug, email}                ║
 * ║                                                                ║
 * ║  ONE-TIME SETUP:                                               ║
 * ║    1. Script Properties -> add CLAUDE_API_KEY                 ║
 * ║    2. Run initIntelligenceSheets()                             ║
 * ║    3. Run refreshProductIntelligence() once to backfill        ║
 * ║    4. installIntelligenceTriggers()                            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

var INTEL_CONFIG = {
  intelligenceSheet: 'IntelligenceCache',
  waitlistSheet:     'Waitlist',
  priceHistorySheet: 'PriceHistory',
  gamesJsonUrl:      'https://www.cartridgebond.com/games.json',
  claudeModel:       'claude-sonnet-4-6',
  minDataForConfidence: 3,   // trades+waitlist below this = "limited data" cap
};

// ── SHEET SETUP ──────────────────────────────────────────────────────────────
function initIntelligenceSheets() {
  var ic = getSheet(INTEL_CONFIG.intelligenceSheet);
  if (!ic.getRange(1, 1).getValue()) {
    ic.getRange(1, 1, 1, 14).setValues([[
      'slug', 'title', 'ownershipScore', 'resaleStrength', 'liquidity',
      'depreciation', 'demand', 'easeOfSelling', 'buyWaitRecommendation',
      'confidencePct', 'expectedTimeToSellDays', 'waitlistCount',
      'aiAnalysis', 'lastRefreshed',
    ]]);
    ic.setFrozenRows(1);
  }

  var wl = getSheet(INTEL_CONFIG.waitlistSheet);
  if (!wl.getRange(1, 1).getValue()) {
    wl.getRange(1, 1, 1, 3).setValues([['slug', 'email', 'timestamp']]);
    wl.setFrozenRows(1);
  }

  var ph = getSheet(INTEL_CONFIG.priceHistorySheet);
  if (!ph.getRange(1, 1).getValue()) {
    ph.getRange(1, 1, 1, 3).setValues([['slug', 'cartridgeBondPrice', 'timestamp']]);
    ph.setFrozenRows(1);
  }
}

function installIntelligenceTriggers() {
  ScriptApp.newTrigger('refreshProductIntelligence')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
}

// ── doGet ROUTES (call these from doGet in cartridgebond-webapp.gs) ─────────
function handleProductIntelligence(slug) {
  var row = findIntelligenceRow_(slug);
  if (!row) return { ok: false, error: 'not_found' };
  return { ok: true, data: row };
}

function handleProductIntelligenceAll() {
  var ic = getSheet(INTEL_CONFIG.intelligenceSheet);
  var rows = ic.getDataRange().getValues();
  var headers = rows[0];
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = rows[i][c];
    out.push(obj);
  }
  return { ok: true, data: out };
}

// ── doPost ROUTE (call from doPost in cartridgebond-webapp.gs) ──────────────
function handleJoinWaitlist(data) {
  var slug = String(data.slug || '').trim();
  var email = String(data.email || '').trim().toLowerCase();
  if (!slug || !email || email.indexOf('@') === -1) {
    return { ok: false, error: 'missing_fields' };
  }
  var wl = getSheet(INTEL_CONFIG.waitlistSheet);
  var rows = wl.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === slug && String(rows[i][1]).toLowerCase() === email) {
      return { ok: true, alreadyJoined: true, count: countWaitlist_(slug) };
    }
  }
  wl.appendRow([slug, email, new Date()]);
  return { ok: true, alreadyJoined: false, count: countWaitlist_(slug) };
}

function countWaitlist_(slug) {
  var wl = getSheet(INTEL_CONFIG.waitlistSheet);
  var rows = wl.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === slug) n++;
  }
  return n;
}

function findIntelligenceRow_(slug) {
  var ic = getSheet(INTEL_CONFIG.intelligenceSheet);
  var rows = ic.getDataRange().getValues();
  var headers = rows[0];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === slug) {
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = rows[i][c];
      return obj;
    }
  }
  return null;
}

// ── MAIN REFRESH - the "agent" that runs weekly ──────────────────────────────
function refreshProductIntelligence() {
  var games = fetchGamesJson_();
  if (!games.length) { Logger.log('refreshProductIntelligence: no games loaded, aborting'); return; }

  var subRows = getSheet(CONFIG.sheetName).getDataRange().getValues();
  var ic = getSheet(INTEL_CONFIG.intelligenceSheet);
  var existing = ic.getDataRange().getValues();
  var existingBySlug = {};
  for (var i = 1; i < existing.length; i++) existingBySlug[String(existing[i][0]).trim()] = i + 1; // 1-indexed row

  logPriceSnapshot_(games);

  for (var g = 0; g < games.length; g++) {
    var game = games[g];
    if (!game.slug) continue;

    var metrics = computeGameMetrics_(game, subRows);
    var scores = computeOwnershipScore_(game, metrics);
    var narrative = generateAIAnalysis_(game, metrics, scores);

    var record = [
      game.slug,
      game.title,
      scores.ownershipScore,
      scores.resaleStrength,
      scores.liquidity,
      scores.depreciation,
      scores.demand,
      scores.easeOfSelling,
      scores.buyWaitRecommendation,
      scores.confidencePct,
      metrics.medianTimeToSellDays,
      metrics.waitlistCount,
      narrative,
      new Date(),
    ];

    var existingRow = existingBySlug[game.slug];
    if (existingRow) {
      ic.getRange(existingRow, 1, 1, record.length).setValues([record]);
    } else {
      ic.appendRow(record);
    }
    Utilities.sleep(300); // stay well under Claude API rate limits across ~28 games
  }
  Logger.log('refreshProductIntelligence: done, ' + games.length + ' games processed');
}

function fetchGamesJson_() {
  try {
    var resp = UrlFetchApp.fetch(INTEL_CONFIG.gamesJsonUrl + '?v=' + new Date().getTime());
    var json = JSON.parse(resp.getContentText());
    return json.games || [];
  } catch (err) {
    Logger.log('fetchGamesJson_ failed: ' + err);
    return [];
  }
}

function logPriceSnapshot_(games) {
  var ph = getSheet(INTEL_CONFIG.priceHistorySheet);
  var now = new Date();
  var rows = games.filter(function(g){ return g.slug; })
    .map(function(g){ return [g.slug, g.cartridgeBondPrice, now]; });
  if (rows.length) ph.getRange(ph.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}

// ── REAL METRICS (derived only from actual data - no invented numbers) ──────
function computeGameMetrics_(game, subRows) {
  var titleLC = String(game.title).trim().toLowerCase();
  var completedDays = [];
  var activeBuyers = 0, activeSellers = 0, completedCount = 0;

  for (var i = 1; i < subRows.length; i++) {
    var rowGame = String(subRows[i][COL.game - 1] || '').trim().toLowerCase();
    if (rowGame !== titleLC) continue;

    var status = String(subRows[i][COL.status - 1] || '').toLowerCase();
    var role = String(subRows[i][COL.role - 1] || '').toLowerCase();

    if (status === 'active') {
      if (role.indexOf('buy') !== -1) activeBuyers++;
      else if (role.indexOf('sell') !== -1) activeSellers++;
    }

    var ts = subRows[i][COL.timestamp - 1];
    var matchedAt = subRows[i][COL.matchedAt - 1];
    if (ts && matchedAt) {
      var days = (new Date(matchedAt) - new Date(ts)) / 86400000;
      if (days >= 0 && days < 365) completedDays.push(days);
    }
    if (status === 'completed') completedCount++;
  }

  completedDays.sort(function(a, b){ return a - b; });
  var median = completedDays.length
    ? completedDays[Math.floor(completedDays.length / 2)]
    : null;

  var waitlistCount = countWaitlist_(game.slug);
  var retentionPct = game.retailPrice
    ? Math.round((game.cartridgeBondPrice / game.retailPrice) * 100)
    : null;
  var ownershipCost = game.retailPrice
    ? Math.max(0, game.retailPrice - game.cartridgeBondPrice)
    : null;

  return {
    activeBuyers: activeBuyers,
    activeSellers: activeSellers,
    completedCount: completedCount,
    medianTimeToSellDays: median === null ? null : Math.round(median * 10) / 10,
    waitlistCount: waitlistCount,
    retentionPct: retentionPct,
    ownershipCost: ownershipCost,
    dataPoints: completedCount + waitlistCount + activeBuyers + activeSellers,
  };
}

// ── SCORING FORMULAS (rule-based, honest, no AI guessing) ───────────────────
function computeOwnershipScore_(game, m) {
  var resaleStrength = starsFromRetention_(m.retentionPct);
  var demand = starsFromDemand_(m.activeBuyers + m.waitlistCount);
  var liquidity = starsFromLiquidity_(m.completedCount, m.activeBuyers + m.activeSellers);
  var easeOfSelling = starsFromTimeToSell_(m.medianTimeToSellDays);
  // Depreciation stars: until PriceHistory has >=2 monthly snapshots per game,
  // this mirrors resaleStrength (single-point retention) rather than a fabricated trend.
  var depreciation = depreciationStars_(game.slug, resaleStrength);

  var ownershipScore = Math.round(
    ((resaleStrength + liquidity + depreciation + demand + easeOfSelling) / 25) * 100
  );

  var confidencePct = confidenceFromDataPoints_(m.dataPoints);
  var buyWaitRecommendation = (resaleStrength >= 4 && confidencePct >= 65) ? 'BUY_NOW' : 'RESEARCH_FIRST';

  return {
    resaleStrength: resaleStrength,
    liquidity: liquidity,
    depreciation: depreciation,
    demand: demand,
    easeOfSelling: easeOfSelling,
    ownershipScore: ownershipScore,
    confidencePct: confidencePct,
    buyWaitRecommendation: buyWaitRecommendation,
  };
}

function starsFromRetention_(pct) {
  if (pct === null) return 3;
  if (pct >= 70) return 5;
  if (pct >= 60) return 4;
  if (pct >= 50) return 3;
  if (pct >= 40) return 2;
  return 1;
}
function starsFromDemand_(signal) {
  if (signal >= 20) return 5;
  if (signal >= 10) return 4;
  if (signal >= 5) return 3;
  if (signal >= 1) return 2;
  return 1;
}
function starsFromLiquidity_(completedCount, activeCount) {
  var vol = completedCount + activeCount;
  if (vol >= 10) return 5;
  if (vol >= 5) return 4;
  if (vol >= 2) return 3;
  if (vol >= 1) return 2;
  return 1; // no trade history yet - honest floor, not a guess
}
function starsFromTimeToSell_(days) {
  if (days === null) return 3; // no data yet - neutral, not fabricated "2-5 days"
  if (days <= 3) return 5;
  if (days <= 7) return 4;
  if (days <= 14) return 3;
  if (days <= 30) return 2;
  return 1;
}
function depreciationStars_(slug, fallbackStars) {
  var ph = getSheet(INTEL_CONFIG.priceHistorySheet);
  var rows = ph.getDataRange().getValues();
  var points = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === slug) points.push({ price: rows[i][1], date: new Date(rows[i][2]) });
  }
  if (points.length < 2) return fallbackStars; // not enough history yet
  points.sort(function(a, b){ return a.date - b.date; });
  var first = points[0].price, last = points[points.length - 1].price;
  if (!first) return fallbackStars;
  var monthsSpan = Math.max(1, (points[points.length-1].date - points[0].date) / (30 * 86400000));
  var monthlyDropPct = ((first - last) / first) / monthsSpan * 100;
  if (monthlyDropPct <= 0.5) return 5;
  if (monthlyDropPct <= 1.5) return 4;
  if (monthlyDropPct <= 3) return 3;
  if (monthlyDropPct <= 6) return 2;
  return 1;
}
function confidenceFromDataPoints_(dataPoints) {
  if (dataPoints < INTEL_CONFIG.minDataForConfidence) {
    return Math.min(55, 30 + dataPoints * 8); // capped low - genuinely limited data
  }
  return Math.min(95, 45 + dataPoints * 3);
}

// ── AI NARRATIVE - numbers go IN, prose comes OUT. Model never invents stats ──
function generateAIAnalysis_(game, m, scores) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) return ''; // no key configured yet - skip narrative, keep the real numbers

  var facts = {
    title: game.title,
    retailPrice: game.retailPrice,
    cartridgeBondPrice: game.cartridgeBondPrice,
    retentionPct: m.retentionPct,
    ownershipCost: m.ownershipCost,
    medianTimeToSellDays: m.medianTimeToSellDays,
    activeBuyers: m.activeBuyers,
    activeSellers: m.activeSellers,
    waitlistCount: m.waitlistCount,
    completedTrades: m.completedCount,
    ownershipScore: scores.ownershipScore,
    confidencePct: scores.confidencePct,
  };

  var prompt = 'Write a 2-3 sentence "CartridgeBond Intelligence" analysis for this Nintendo Switch game listing, ' +
    'in the voice of a knowledgeable, calm marketplace analyst.\n\n' +
    'STRICT RULES:\n' +
    '- Use ONLY the numbers given below. Never state a percentage, dollar amount, day count, or date that is not in this data.\n' +
    '- If a field is null, do not mention it or guess at it - write around the gap instead of inventing a figure.\n' +
    '- You may reference general public knowledge about the game (genre, first-party vs third-party) but not specific sales/retention stats about it beyond what is given.\n' +
    '- No exclamation points. No "act now" urgency language. Plain, factual, confident tone.\n\n' +
    'DATA:\n' + JSON.stringify(facts, null, 2);

  var payload = {
    model: INTEL_CONFIG.claudeModel,
    max_tokens: 220,
    messages: [{ role: 'user', content: prompt }],
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    var body = JSON.parse(resp.getContentText());
    if (body.content && body.content[0] && body.content[0].text) {
      return body.content[0].text.trim();
    }
    Logger.log('generateAIAnalysis_ unexpected response: ' + resp.getContentText());
    return '';
  } catch (err) {
    Logger.log('generateAIAnalysis_ failed for ' + game.title + ': ' + err);
    return '';
  }
}
