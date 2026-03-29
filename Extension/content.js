/**
 * CartridgeBond Content Script
 * Runs on Amazon, GameStop, Best Buy, Target, Walmart product pages.
 * Checks if there are active CartridgeBond buyers/sellers for the
 * current game and injects a badge if a match is found.
 */

// ─── CONFIGURATION ────────────────────────────────────────────

var CB_CONFIG = {
  // Your Apps Script Web App URL (the buyer feed endpoint)
  // Replace this with the URL from your cartridgebond-buyerfeed.gs deployment
  dataUrl: 'PASTE_YOUR_BUYERFEED_WEBAPP_URL_HERE',

  // CartridgeBond site URL — links in the badge point here
  siteUrl: 'https://cartridgebond.com',

  // How long to cache the buyer feed (milliseconds) — 15 minutes
  cacheMs: 15 * 60 * 1000,

  // Minimum fuzzy match score to show a badge (0–1)
  matchThreshold: 0.55,
};

// ─── SITE SELECTORS ───────────────────────────────────────────
// Each site needs a selector for the product title and optionally
// a selector for where to inject the badge (defaults to body).

var SITE_CONFIGS = {
  'amazon.com': {
    titleSelector:  '#productTitle',
    injectTarget:   '#apex_desktop, #centerCol, #ppd',
    injectPosition: 'prepend',  // inject at top of element
  },
  'gamestop.com': {
    titleSelector:  'h1.product-name, h1[class*="product-name"]',
    injectTarget:   '.product-details, .pdp-wrapper',
    injectPosition: 'prepend',
  },
  'bestbuy.com': {
    titleSelector:  'h1.sku-title, div.sku-title h1',
    injectTarget:   '.shop-product-title, .pdp-header',
    injectPosition: 'after',
  },
  'target.com': {
    titleSelector:  'h1[data-test="product-title"]',
    injectTarget:   'div[data-test="product-details-title"]',
    injectPosition: 'after',
  },
  'walmart.com': {
    titleSelector:  'h1.prod-ProductTitle, h1[itemprop="name"]',
    injectTarget:   '.prod-product-cta-area, .prod-content-section-main',
    injectPosition: 'prepend',
  },
};

// ─── MAIN ─────────────────────────────────────────────────────

(function() {
  'use strict';

  // Don't run if no data URL configured yet
  if (!CB_CONFIG.dataUrl || CB_CONFIG.dataUrl.includes('PASTE_YOUR')) return;

  // Identify current site
  var hostname = window.location.hostname.replace('www.', '');
  var siteConfig = null;
  for (var site in SITE_CONFIGS) {
    if (hostname.includes(site)) {
      siteConfig = SITE_CONFIGS[site];
      break;
    }
  }
  if (!siteConfig) return;

  // Wait for page to settle then extract title and check
  waitForElement(siteConfig.titleSelector, function(el) {
    var rawTitle = el.textContent.trim();
    if (!rawTitle) return;

    // Only proceed if this looks like a Nintendo Switch game
    if (!looksLikeSwitchGame(rawTitle)) return;

    var cleanTitle = cleanGameTitle(rawTitle);
    fetchBuyerFeed(function(feed) {
      if (!feed || !feed.buyers) return;
      var matches = findMatches(cleanTitle, feed.buyers);
      if (matches.length > 0) {
        injectBadge(matches, cleanTitle, siteConfig);
      }
    });
  }, 5000);
})();

// ─── TITLE DETECTION ──────────────────────────────────────────

function looksLikeSwitchGame(title) {
  var t = title.toLowerCase();
  // Must mention Switch, Nintendo, or be a known Switch franchise
  var switchTerms = ['switch', 'nintendo', 'mario', 'zelda', 'pokemon', 'kirby',
    'donkey kong', 'metroid', 'splatoon', 'animal crossing', 'smash', 'pikmin',
    'xenoblade', 'fire emblem', 'bayonetta', 'luigi', 'yoshi'];
  return switchTerms.some(function(term) { return t.includes(term); });
}

function cleanGameTitle(raw) {
  return raw
    .replace(/\(Nintendo Switch\)/gi, '')
    .replace(/- Nintendo Switch/gi, '')
    .replace(/Nintendo Switch/gi, '')
    .replace(/\[.*?\]/g, '')          // remove [Digital Code] etc
    .replace(/\(.*?Edition.*?\)/gi, '') // remove (Special Edition) etc
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── FUZZY MATCHING ───────────────────────────────────────────

function findMatches(pageTitle, buyers) {
  var matches = [];
  var pageLower = pageTitle.toLowerCase();

  buyers.forEach(function(buyer) {
    var buyerTitle = (buyer.game || '').toLowerCase()
      .replace(/\(nintendo switch\)/gi, '')
      .replace(/- nintendo switch/gi, '')
      .trim();

    var score = fuzzyScore(pageLower, buyerTitle);
    if (score >= CB_CONFIG.matchThreshold) {
      matches.push({ buyer: buyer, score: score });
    }
  });

  // Sort by score descending
  matches.sort(function(a, b) { return b.score - a.score; });
  return matches;
}

function fuzzyScore(a, b) {
  // Simple but effective: check word overlap
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  var wordsA = a.split(/\s+/).filter(function(w) { return w.length > 2; });
  var wordsB = b.split(/\s+/).filter(function(w) { return w.length > 2; });

  if (!wordsA.length || !wordsB.length) return 0;

  var matches = wordsA.filter(function(w) {
    return wordsB.some(function(wb) {
      return wb.includes(w) || w.includes(wb);
    });
  });

  return matches.length / Math.max(wordsA.length, wordsB.length);
}

// ─── DATA FETCHING ────────────────────────────────────────────

function fetchBuyerFeed(callback) {
  // Check cache first
  var cacheKey = 'cb_feed_cache';
  var cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < CB_CONFIG.cacheMs) {
        callback(parsed.data);
        return;
      }
    } catch(e) {}
  }

  // Fetch fresh data
  fetch(CB_CONFIG.dataUrl + '?action=buyers', { method: 'GET' })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      // Cache it
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: data }));
      callback(data);
    })
    .catch(function(err) {
      console.log('CartridgeBond: Could not fetch buyer feed', err);
    });
}

// ─── BADGE INJECTION ──────────────────────────────────────────

function injectBadge(matches, pageTitle, siteConfig) {
  // Don't inject twice
  if (document.getElementById('cb-badge')) return;

  var topMatch = matches[0].buyer;
  var count    = matches.length;

  // Build the sell URL — pre-selects Switch and pre-fills the game title
  var sellUrl = CB_CONFIG.siteUrl + '/?utm_source=extension&utm_medium=badge&game=' +
    encodeURIComponent(pageTitle);

  // Build badge HTML
  var badge = document.createElement('div');
  badge.id = 'cb-badge';
  badge.innerHTML = [
    '<div class="cb-badge-inner">',
      '<div class="cb-badge-left">',
        '<div class="cb-dot"></div>',
      '</div>',
      '<div class="cb-badge-content">',
        '<div class="cb-badge-title">',
          count === 1
            ? '1 local buyer wants this on CartridgeBond'
            : count + ' local buyers want this on CartridgeBond',
        '</div>',
        '<div class="cb-badge-detail">',
          'Paying <strong>$' + topMatch.price + '</strong>',
          topMatch.timeline ? ' &bull; Needs it ' + topMatch.timeline.toLowerCase() : '',
          ' &bull; Milwaukee area',
        '</div>',
      '</div>',
      '<a href="' + sellUrl + '" target="_blank" class="cb-badge-cta">',
        'Sell yours',
        '<span class="cb-arrow">&#8594;</span>',
      '</a>',
      '<button class="cb-badge-close" aria-label="Dismiss">&#10005;</button>',
    '</div>',
  ].join('');

  // Close button
  badge.querySelector('.cb-badge-close').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    badge.classList.add('cb-hidden');
    setTimeout(function() { badge.remove(); }, 300);
  });

  // Find inject target
  var targets = siteConfig.injectTarget.split(', ');
  var targetEl = null;
  for (var i = 0; i < targets.length; i++) {
    targetEl = document.querySelector(targets[i]);
    if (targetEl) break;
  }

  if (!targetEl) {
    // Fallback — inject as fixed overlay
    badge.classList.add('cb-fixed');
    document.body.appendChild(badge);
  } else {
    if (siteConfig.injectPosition === 'prepend') {
      targetEl.insertBefore(badge, targetEl.firstChild);
    } else {
      targetEl.parentNode.insertBefore(badge, targetEl.nextSibling);
    }
  }

  // Animate in
  requestAnimationFrame(function() {
    badge.classList.add('cb-visible');
  });
}

// ─── UTILITIES ────────────────────────────────────────────────

function waitForElement(selector, callback, timeout) {
  var start = Date.now();
  var selectors = selector.split(', ');

  function check() {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i].trim());
      if (el && el.textContent.trim()) {
        callback(el);
        return;
      }
    }
    if (Date.now() - start < timeout) {
      setTimeout(check, 300);
    }
  }
  check();
}
