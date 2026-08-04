/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  pill-engine.js                                                ║
 * ║  Shared buy/sell pill + dropdown, used by every retailer's    ║
 * ║  content script (content.js, gamestop.js, bestbuy.js,         ║
 * ║  target.js, walmart.js). Every site gets the identical full   ║
 * ║  dual-mode experience - browse real offers, pick one or set   ║
 * ║  your own, age gate, breakdown panel, confirm/submit.         ║
 * ║                                                                 ║
 * ║  A site file only needs to:                                   ║
 * ║    1. Define CB_API and CB_SITE (top-level const)              ║
 * ║    2. Define its own GAMES list (needs title/price/slug)      ║
 * ║    3. Find its own anchor DOM node + match the game            ║
 * ║    4. Call CBMount(anchor, game)                               ║
 * ║  Everything else - pill markup, dropdown, offer list, age     ║
 * ║  gate, breakdown, submission - lives here, once.               ║
 * ║                                                                 ║
 * ║  Load this file BEFORE the site-specific file in manifest.json ║
 * ║  content_scripts "js" array (order doesn't strictly matter     ║
 * ║  since functions here are only called after both files have   ║
 * ║  loaded, but keep it first by convention).                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

var dropdownOpen = false;
var currentTl    = 'flex'; // timeline selection in dropdown
var _ddGame = null, _ddMode = null, _ddBuyers = 0, _ddSellers = 0;
var _ddOffers = [], _ddOfferId = null, _ddPickedPrice = 0;
var _breakdownCache = {}; // slug -> {comparison, intel} - avoid refetching per open

function closeDropdown(){
  var d = document.getElementById('cb-dropdown');
  if(d) d.remove();
  dropdownOpen = false;
}

function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildDropdownShell(game, mode){
  return `<div class="dd-head">
    <div class="dd-brand">Cartridge<em>Bond</em></div>
    <button class="dd-close" onclick="cbCloseDropdown()" type="button">✕</button>
  </div>
  <div class="dd-body" id="dd-body">
    <div class="dd-game">${esc(game.title)}</div>
    <div class="dd-meta">Nintendo Switch &nbsp;·&nbsp; A1 condition (like new)</div>
    <div class="dd-bd-loading">Checking who's already bonding on this game&hellip;</div>
  </div>`;
}

function openDropdown(game, mode, anchorEl){
  closeDropdown();
  dropdownOpen = true;
  _ddGame = game; _ddMode = mode; _ddOfferId = null;
  _ddBuyers = _currentBuyers; _ddSellers = _currentSellers;

  var dd = document.createElement('div');
  dd.id = 'cb-dropdown';
  dd.innerHTML = buildDropdownShell(game, mode);
  dd.addEventListener('click', function(e){ e.stopPropagation(); });
  document.body.appendChild(dd);

  // Position below the pill anchor
  var rect = anchorEl.getBoundingClientRect();
  var left = Math.min(rect.left, window.innerWidth - 350);
  left = Math.max(left, 8);
  var top  = rect.bottom + 8;
  if(top + 480 > window.innerHeight) top = Math.max(rect.top - 480, 8);
  dd.style.cssText += `left:${left}px!important;top:${top}px!important;`;

  // Close on outside click
  setTimeout(function(){
    document.addEventListener('click', function outsideClick(e){
      if(!dd.contains(e.target) && e.target.id !== 'cb-pill'){
        closeDropdown();
        document.removeEventListener('click', outsideClick);
      }
    });
  }, 100);

  fetchOffers(game, mode).then(function(offers){
    if(!dropdownOpen || _ddGame !== game) return; // dropdown closed/changed while fetch was in flight
    _ddOffers = offers;
    renderOfferStep();
  });
}

async function fetchOffers(game, mode){
  try{
    var url = `${CB_API}?action=listOffers&game=${encodeURIComponent(game.title)}&role=${mode}`;
    var res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    var data = await res.json();
    if(data.ok) return data.offers || [];
  }catch(_){}
  return [];
}

function timelineLabel(val){
  if(val === 'now') return 'Available now';
  if(val === 'flex') return 'Flexible, within 90d';
  if(val && /^\d+$/.test(val)) return 'Within ' + val + 'd';
  return 'Timing flexible';
}

// ── Step 1: browse real committed offers, or go straight to custom params ───
function renderOfferStep(){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  var offers = _ddOffers || [];
  var counterpart = isSell ? 'buyer' : 'seller';

  var head = `<div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">Nintendo Switch &nbsp;·&nbsp; A1 condition (like new)</div>`;

  if(!offers.length){
    body.innerHTML = head + `
      <div class="dd-empty-notice">
        No ${counterpart}s available yet for this game &mdash; you'd be the first.
        Lock in your parameters below and we'll match you the instant someone joins.
      </div>
      ${renderCustomParamsHTML(blueClass, isSell)}
    `;
    wireCustomParamsEvents();
    return;
  }

  var cards = offers.map(function(o, idx){
    return `<button class="dd-offer-card" onclick="cbPickOffer(${o.offerId},${o.price},'${esc(o.condition)}','${esc(o.timeline)}')" type="button">
      <div class="dd-offer-left">
        <div class="dd-offer-price">$${o.price}</div>
        <div class="dd-offer-meta">${esc(o.condition)} condition &middot; ${esc(timelineLabel(o.timeline))}</div>
      </div>
      <div class="dd-offer-pick">Bond &rarr;</div>
    </button>`;
  }).join('');

  body.innerHTML = head + `
    <div class="dd-offer-label">${offers.length} ${counterpart}${offers.length!==1?'s':''} already committed &mdash; pick one:</div>
    <div class="dd-offer-list">${cards}</div>
    <button class="dd-custom-link" onclick="cbShowCustomParams()" type="button">None of these work? Set your own price &amp; timeline &rarr;</button>
  `;
}

// ── "Set my own parameters" step (the original price/timeline picker) ──────
function renderCustomParamsHTML(blueClass, isSell){
  var game = _ddGame;
  var tlOpts = isSell
    ? [['Now','ASAP','now'],['30d','1 month','30'],['60d','2 months','60'],['90d','3 months','90']]
    : [['Flexible','Within 90d','flex'],['30d','1 month','30'],['Now','ASAP','now']];
  var defaultTl = isSell ? 'now' : 'flex';
  currentTl = defaultTl;
  var priceLabel = isSell ? 'YOU GET (LOCKED)' : 'YOU PAY (LOCKED)';
  var ctaLabel   = isSell ? 'Lock in my sell price' : 'Lock in my buy price';

  var tlHTML = tlOpts.map(([top,bot,val]) =>
    `<button class="dd-tl-btn${val===defaultTl?' sel':''}" onclick="cbSelTl('${val}',this)" type="button">
       <div class="dd-tl-top">${top}</div><div class="dd-tl-bot">${bot}</div>
     </button>`
  ).join('');

  return `
    <div class="dd-price-card${blueClass}">
      <div>
        <div class="dd-price-label">${priceLabel}</div>
        <div class="dd-price-val">$${game.price}</div>
      </div>
      <div class="dd-badge${blueClass}">Price locked before contact</div>
    </div>
    ${isSell ? '' : `
    <div class="dd-value-row">
      <div class="dd-value-chip">A1 condition guaranteed</div>
      <div class="dd-value-chip">Zero fees</div>
    </div>`}
    <button class="dd-breakdown-toggle" onclick="cbToggleBreakdown()" type="button">
      See full price breakdown ${isSell ? '&amp; ownership score' : 'across platforms'}
      <svg id="dd-bd-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div id="dd-breakdown" class="dd-breakdown"></div>
    <div class="dd-tl-label">${isSell ? 'When can you sell?' : 'When do you need it?'}</div>
    <div class="dd-tl-row">${tlHTML}</div>
    <button class="dd-cta${blueClass}" onclick="cbShowConfirm()" type="button">
      ${ctaLabel}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>
    <div class="dd-note">Locks instantly &nbsp;·&nbsp; Free during beta &nbsp;·&nbsp; No payment collected here</div>
  `;
}

function wireCustomParamsEvents(){ /* buttons use inline onclick - nothing to wire */ }

window.cbShowCustomParams = function(){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  _ddOfferId = null;
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  body.innerHTML = `
    <button class="dd-back" onclick="cbBackToOffer()" type="button">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>Back
    </button>
    <div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">Nintendo Switch &nbsp;·&nbsp; A1 condition (like new)</div>
    ${renderCustomParamsHTML(blueClass, isSell)}
  `;
};

window.cbBackToOffer = function(){
  renderOfferStep();
};

// ── Picking a specific real offer ────────────────────────────────────────────
window.cbPickOffer = function(offerId, price, condition, timeline){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  _ddOfferId = offerId;
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  var priceLabel = isSell ? 'YOU GET (LOCKED)' : 'YOU PAY (LOCKED)';

  body.innerHTML = `
    <button class="dd-back" onclick="cbBackToOffer()" type="button">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>Back
    </button>
    <div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">Bonding with a committed ${isSell?'buyer':'seller'}</div>
    <div class="dd-price-card${blueClass}">
      <div>
        <div class="dd-price-label">${priceLabel}</div>
        <div class="dd-price-val">$${price}</div>
      </div>
      <div class="dd-badge${blueClass}">${esc(condition)} &middot; ${esc(timelineLabel(timeline))}</div>
    </div>
    <button class="dd-cta${blueClass}" onclick="cbShowConfirm()" type="button">
      Confirm this bond
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>
    <div class="dd-note">Locks instantly &nbsp;·&nbsp; Free during beta &nbsp;·&nbsp; No payment collected here</div>
  `;
  _ddPickedPrice = price;
  currentTl = timeline || currentTl;
};

// Global handlers
window.cbCloseDropdown = closeDropdown;
window.cbSelTl = function(val, el){
  currentTl = val;
  document.querySelectorAll('#cb-dropdown .dd-tl-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
};

// ── Step 2: inline confirm (email) ───────────────────────────────────────────
window.cbShowConfirm = function(){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  var price = _ddOfferId ? _ddPickedPrice : _ddGame.price;

  body.innerHTML = `
    <button class="dd-back" onclick="${_ddOfferId ? `cbPickOffer(${_ddOfferId},${_ddPickedPrice},'A1','${currentTl}')` : 'cbShowCustomParams()'}" type="button">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      Back
    </button>
    <div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">${isSell ? 'Selling' : 'Buying'} at <strong>$${price}</strong> &middot; ${timelineLabel(currentTl)}</div>
    <div class="dd-confirm-label">Where should we send your match?</div>
    <input class="dd-input" id="dd-email" type="email" placeholder="you@email.com" autocomplete="email">
    <input class="dd-input" id="dd-zip" type="text" placeholder="ZIP code (helps find a nearby match)" maxlength="5" inputmode="numeric">
    <button class="dd-cta${blueClass}" id="dd-submit-btn" onclick="cbSubmitLock()" type="button">
      Confirm &amp; lock my price
    </button>
    <div class="dd-note" id="dd-submit-note">
      Locks instantly &nbsp;·&nbsp; No payment collected here &nbsp;·&nbsp; <a href="${CB_SITE}/faq.html" target="_blank">FAQ</a>
    </div>
  `;
  var emailInput = document.getElementById('dd-email');
  if(emailInput) emailInput.focus();
};

window.cbSubmitLock = function(){
  var emailEl = document.getElementById('dd-email');
  var zipEl   = document.getElementById('dd-zip');
  var btn     = document.getElementById('dd-submit-btn');
  var note    = document.getElementById('dd-submit-note');
  var email   = (emailEl && emailEl.value || '').trim();
  var zip     = (zipEl && zipEl.value || '').trim();

  if(!email || email.indexOf('@') === -1){
    if(emailEl) emailEl.classList.add('dd-input-err');
    if(note) note.textContent = 'Enter a valid email to continue.';
    return;
  }
  if(btn){ btn.disabled = true; btn.textContent = 'Locking your price…'; }

  var price = _ddOfferId ? _ddPickedPrice : _ddGame.price;

  fetch(CB_API, {
    method: 'POST',
    body: JSON.stringify({
      email: email,
      zip: zip,
      role: _ddMode,
      game: _ddGame.title,
      price: price,
      condition: 'A1',
      timeline: currentTl,
      formType: 'extension',
      matchOfferId: _ddOfferId || undefined,
      notes: 'Locked via Chrome extension (' + location.hostname + ')',
    }),
  })
    .then(function(r){ return r.json(); })
    .then(function(res){ cbShowSuccess(!!res.matched); })
    .catch(function(){
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & lock my price'; }
      if(note){ note.textContent = 'Something went wrong — try again, or finish at cartridgebond.com.'; }
    });
};

function cbShowSuccess(matched){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  var isSell = _ddMode === 'sell';
  var waiting = isSell ? _ddBuyers : _ddSellers;
  var price = _ddOfferId ? _ddPickedPrice : _ddGame.price;

  var title = matched ? "You're matched" : "You're locked in";
  var sub = matched
    ? `$${price} on ${esc(_ddGame.title)} is confirmed with your ${isSell?'buyer':'seller'}. Check your email for next steps.`
    : `$${price} on ${esc(_ddGame.title)} is locked${waiting > 0 ? ` &mdash; ${waiting} ${isSell?'buyer':'seller'}${waiting!==1?'s':''} already waiting` : ''}. We'll email you the moment you're matched.`;

  body.innerHTML = `
    <div class="dd-success">
      <div class="dd-success-check">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
      </div>
      <div class="dd-success-title">${title}</div>
      <div class="dd-success-sub">${sub}</div>
      <a class="dd-success-link" href="${CB_SITE}/dashboard.html" target="_blank">View my bonds &rarr;</a>
    </div>
  `;
  setTimeout(closeDropdown, 6000);
}

// ── Full price breakdown — content differs by mode ───────────────────────────
window.cbToggleBreakdown = function(){
  var panel = document.getElementById('dd-breakdown');
  var arrow = document.getElementById('dd-bd-arrow');
  if(!panel || !_ddGame) return;
  var isOpen = panel.classList.contains('open');
  if(isOpen){
    panel.classList.remove('open');
    if(arrow) arrow.style.transform = '';
    return;
  }
  panel.classList.add('open');
  if(arrow) arrow.style.transform = 'rotate(180deg)';
  if(panel.dataset.loaded === '1') return;

  panel.innerHTML = `<div class="dd-bd-loading">Loading full breakdown&hellip;</div>`;
  fetchBreakdown(_ddGame.slug).then(function(data){
    panel.dataset.loaded = '1';
    if(!data){
      panel.innerHTML = `<div class="dd-bd-loading">Couldn't load the breakdown right now.</div>`;
      return;
    }
    panel.innerHTML = renderBreakdown(data, _ddMode);
  });
};

async function fetchBreakdown(slug){
  if(!slug) return null;
  if(_breakdownCache[slug]) return _breakdownCache[slug];
  try{
    var [gamesRes, intelRes] = await Promise.all([
      fetch(`${CB_SITE}/games.json`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null),
      fetch(`${CB_API}?action=productIntelligence&slug=${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null),
    ]);
    var comparison = gamesRes && gamesRes.games ? gamesRes.games.find(g => g.slug === slug) : null;
    var intel = intelRes && intelRes.ok ? intelRes.data : null;
    var result = { comparison: comparison, intel: intel };
    _breakdownCache[slug] = result;
    return result;
  }catch(_){ return null; }
}

function starsHTML(n){
  n = Math.max(0, Math.min(5, n || 0));
  return '&#9733;'.repeat(n) + '<span class="dd-star-off">' + '&#9733;'.repeat(5-n) + '</span>';
}

// Sell mode: Ownership Score + stars (assessing resale value/liquidity).
// Buy mode: A1/zero-fee/availability value props instead - a buyer doesn't
// care what a seller "earns", they care what it costs and how sure the buy is.
function renderBreakdown(data, mode){
  var c = data.comparison, intel = data.intel;
  var isSell = mode === 'sell';
  var rows = '';
  if(c){
    rows = `
      <div class="dd-bd-row"><span>Buy new (retail)</span><span>$${c.retailPrice ?? '—'}</span></div>
      <div class="dd-bd-row hl"><span>CartridgeBond (A1, used)</span><span>$${c.cartridgeBondPrice}</span></div>
      <div class="dd-bd-row"><span>eBay, used</span><span>$${c.ebayNetLow}&ndash;${c.ebayNetHigh}</span></div>
      <div class="dd-bd-row"><span>GameStop, used</span><span>$${c.gameStopTradeIn}</span></div>
    `;
  }

  if(!isSell){
    var valueBlock = `
      <div class="dd-bd-value-grid">
        <div class="dd-bd-value-item">✓ A1 condition guaranteed</div>
        <div class="dd-bd-value-item">✓ Zero fees</div>
        <div class="dd-bd-value-item">✓ Available now, 30d, or flexible 90d</div>
      </div>
    `;
    if(!rows) return valueBlock + `<div class="dd-bd-loading">No platform pricing on file yet for this title.</div>`;
    return valueBlock + rows;
  }

  var scoreBlock = '';
  if(intel){
    var rec = intel.buyWaitRecommendation === 'BUY_NOW';
    scoreBlock = `
      <div class="dd-bd-score-row">
        <div class="dd-bd-score">${intel.ownershipScore}<small>/100</small></div>
        <div class="dd-bd-rec ${rec?'buy':'research'}">${rec?'🟢 BUY NOW':'🔍 RESEARCH FIRST'}</div>
      </div>
      <div class="dd-bd-stars">
        <div>Resale Strength</div><div class="s">${starsHTML(intel.resaleStrength)}</div>
        <div>Liquidity</div><div class="s">${starsHTML(intel.liquidity)}</div>
        <div>Demand</div><div class="s">${starsHTML(intel.demand)}</div>
      </div>
    `;
  }
  if(!rows && !scoreBlock) return `<div class="dd-bd-loading">No breakdown data yet for this title.</div>`;
  return scoreBlock + rows;
}

// ── Build pill HTML ───────────────────────────────────────────────────────────
// ── Build pill HTML ───────────────────────────────────────────────────────────
function buildPill(game, buyers, sellers){
  var hasBuyers  = buyers  > 0;
  var hasSellers = sellers > 0;
  var arrowSVG   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

  var stateClass = hasBuyers ? 'cb-state-buyers' : hasSellers ? 'cb-state-sellers' : 'cb-state-empty';
  var dotColor   = hasSellers && !hasBuyers ? '#3b82f6' : '#22c55e';

  var msg, sub, actionInner;

  if(hasBuyers){
    msg = `<span class="cb-count" id="cb-cnt">${buyers}</span> Future Buyer${buyers!==1?'s':''} Waiting`;
    sub = `Complete the Bond &amp; Sell This Game Later &mdash; Lock <span class="cb-price">$${game.price}</span> Sell Price Now`;
    actionInner = `<button class="cb-action-btn" onclick="cbOpenDropdown(event,'sell')" type="button">
      Sell Used Now ${arrowSVG}
    </button>`;
  } else if(hasSellers){
    msg = `<span class="cb-count" id="cb-cnt">${sellers}</span> Seller${sellers!==1?'s':''} Ready To Sell Used`;
    sub = `Buy Used at <span class="cb-price">$${game.price}</span> &mdash; A1 Condition Guaranteed`;
    actionInner = `<button class="cb-action-btn blue" onclick="cbOpenDropdown(event,'buy')" type="button">
      Buy Used Now ${arrowSVG}
    </button>`;
  } else {
    msg = `Lock in <strong style="color:#15803d!important;font-weight:800!important;">$${game.price}</strong> &nbsp;&middot;&nbsp; A1 condition`;
    sub = `Sell when ready &middot; Buy used &middot; Choose your timing`;
  }

  var actionHTML = hasBuyers || hasSellers
    ? `<div class="cb-action-wrap">${actionInner}</div>`
    : `<div class="cb-dual-wrap">
        <button class="cb-dual-sell" onclick="cbOpenDropdown(event,'sell')" type="button">Sell Used</button>
        <button class="cb-dual-buy" onclick="cbOpenDropdown(event,'buy')" type="button">Buy Used</button>
      </div>`;

  return `<div id="cb-pill" class="${stateClass}">
    <div class="cb-pill-inner">
      <div class="cb-left">
        <div class="cb-dot-wrap">
          <span class="cb-dot" style="background:${dotColor}!important;"></span>
          <span class="cb-dot-ring" style="border-color:${dotColor}!important;"></span>
          <span class="cb-dot-ring-2" style="border-color:${dotColor}!important;"></span>
        </div>
        <div class="cb-text-block">
          <div class="cb-message">${msg}</div>
          <div class="cb-sub">${sub}</div>
          <div class="cb-brand-inline">Cartridge<em>Bond</em></div>
        </div>
      </div>
      ${actionHTML}
    </div>
  </div>`;
}

// Global opener called from pill onclick
var _currentGame = null;
var _currentBuyers = 0, _currentSellers = 0;
window.cbOpenDropdown = function(e, mode){
  e.stopPropagation();
  var anchor = document.getElementById('cb-pill');
  if(_currentGame) openDropdown(_currentGame, mode, anchor);
};

// ── Inject ────────────────────────────────────────────────────────────────────
function injectPill(anchor, game, buyers, sellers){
  if(document.getElementById('cb-pill')) return;
  _currentBuyers = buyers; _currentSellers = sellers;
  if(!anchor) return;
  var wrapper = document.createElement('div');
  wrapper.innerHTML = buildPill(game, buyers, sellers);
  anchor.parentNode.insertBefore(wrapper.firstElementChild, anchor.nextSibling);

  // Animate count
  var cnt = document.getElementById('cb-cnt');
  var target = buyers > 0 ? buyers : sellers;
  if(cnt && target > 1){
    var i = 0; cnt.textContent = '0';
    var t = setInterval(function(){ i++; cnt.textContent = i; if(i>=target) clearInterval(t); }, 110);
  }
}

// ── Fetch & init ──────────────────────────────────────────────────────────────
async function fetchBondData(game){
  try{
    var url = `${CB_API}?action=gameStatus&game=${encodeURIComponent(game.title)}&minBuyerTimeline=30`;
    var res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    var data = await res.json();
    if(data.ok) return { buyers: data.buyers||0, sellers: data.sellers||0 };
  }catch(_){}
  return { buyers:0, sellers:0 };
}


// ── Fetch & mount ─────────────────────────────────────────────────────────────
async function fetchBondData(game){
  try{
    var res = await fetch(`${CB_API}?action=gameStatus&game=${encodeURIComponent(game.title)}`, { signal: AbortSignal.timeout(4000) });
    var data = await res.json();
    if(data.ok) return { buyers: data.buyers||0, sellers: data.sellers||0 };
  }catch(_){}
  return { buyers:0, sellers:0 };
}

// ── Age gate ──────────────────────────────────────────────────────────────────
// The pill shows real prices and captures email/ZIP - that's the actual
// data-collecting surface, so this is where 18+ needs to be enforced, not
// just on the toolbar popup (which is easy to never open).
function isAgeVerified(){
  return new Promise(function(resolve){
    try{
      if(!chrome.storage || !chrome.storage.local) return resolve(false);
      chrome.storage.local.get(['cb_age_verified'], function(res){ resolve(!!(res && res.cb_age_verified)); });
    }catch(_){ resolve(false); }
  });
}

function injectAgeGatePill(anchor){
  if(document.getElementById('cb-pill') || !anchor) return;

  var el = document.createElement('div');
  el.id = 'cb-pill';
  el.innerHTML = `<div class="cb-pill-inner">
    <div class="cb-left">
      <div class="cb-dot-wrap">
        <span class="cb-dot" style="background:#9a9a9a!important;"></span>
      </div>
      <div class="cb-text-block">
        <div class="cb-message">CartridgeBond pricing is 18+</div>
        <div class="cb-sub">One-time check to see locked resale prices</div>
        <div class="cb-brand-inline">Cartridge<em>Bond</em></div>
      </div>
    </div>
    <div class="cb-action-wrap">
      <button class="cb-action-btn" id="cb-gate-btn" type="button">Verify age</button>
    </div>
  </div>`;
  anchor.parentNode.insertBefore(el, anchor.nextSibling);

  var btn = document.getElementById('cb-gate-btn');
  if(btn) btn.addEventListener('click', function(){
    window.open(chrome.runtime.getURL('welcome.html'), '_blank');
  });
}

// If the person verifies in another tab while this gated pill is showing,
// upgrade to the real pill immediately instead of requiring a page refresh.
var _mountAnchor = null, _mountGame = null;
if(chrome.storage && chrome.storage.onChanged){
  chrome.storage.onChanged.addListener(function(changes, area){
    if(area !== 'local' || !changes.cb_age_verified || !changes.cb_age_verified.newValue) return;
    var gated = document.getElementById('cb-pill');
    if(gated && _mountAnchor && _mountGame){ gated.remove(); CBMount(_mountAnchor, _mountGame); }
  });
}

// ── Public entry point every site script calls ──────────────────────────────
// CBMount(anchor, game) - anchor is the DOM node to inject the pill after;
// game is one of that site's GAMES entries ({ title, price, slug }).
// Handles the age gate, skeleton, live buyer/seller fetch, and popup sync -
// every site gets the exact same buy/sell pill and dropdown, just injected
// at whatever anchor point makes sense on that site's DOM.
async function CBMount(anchor, game){
  if(!anchor || !game) return;
  if(document.getElementById('cb-pill')) return;
  _currentGame = game;
  _mountAnchor = anchor;
  _mountGame = game;

  var ageOk = await isAgeVerified();
  if(!ageOk){
    injectAgeGatePill(anchor);
    return;
  }

  var sk = document.createElement('div');
  sk.id = 'cb-pill';
  sk.innerHTML = `<div class="cb-skeleton"><div class="cb-skeleton-inner"><div class="cb-skeleton-dot"></div><div class="cb-skeleton-text"></div></div></div>`;
  anchor.parentNode.insertBefore(sk, anchor.nextSibling);

  var { buyers, sellers } = await fetchBondData(game);
  sk.remove();
  injectPill(anchor, game, buyers, sellers);
  chrome.storage.local.set({ cb_detected: { game:game.title, price:game.price, buyers, sellers, url:location.href } });
}
