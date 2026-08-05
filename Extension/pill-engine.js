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
var _ddReferenceCondition = 'A1', _ddSort = 'soonest';
var _ddStep = 'offers'; // tracks which dropdown step is showing, so a slow
                         // async response (e.g. the offer-list fetch) can't
                         // clobber a step the user has already moved past
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
  var isSell = mode === 'sell';
  return `<div class="dd-head">
    <div class="dd-head-left">
      <div class="dd-brand">Cartridge<em>Bond</em></div>
      <div class="dd-mode-badge">${isSell ? 'Sell PreOwned' : 'Buy PreOwned'}</div>
    </div>
    <button class="dd-close" data-cb-action="close" type="button">✕</button>
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
  _ddGame = game; _ddMode = mode; _ddOfferId = null; _ddStep = 'offers';
  _ddBuyers = _currentBuyers; _ddSellers = _currentSellers;

  var dd = document.createElement('div');
  dd.id = 'cb-dropdown';
  dd.innerHTML = buildDropdownShell(game, mode);
  // NOTE: no stopPropagation here on purpose - the outside-click listener
  // below already correctly distinguishes inside/outside via dd.contains(),
  // and the single delegated data-cb-action listener (bottom of this file)
  // is attached to document, so clicks inside dd must be allowed to bubble
  // all the way up or none of the dropdown's buttons would work at all.
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
      // Use composedPath() (captured at dispatch time), not e.target -
      // an earlier bubble-phase handler (e.g. cbShowConfirm) may have
      // already replaced dd-body's innerHTML and detached e.target from
      // the DOM by the time this listener runs, which would make
      // dd.contains(e.target) wrongly read as "outside" and close the
      // dropdown on every single click inside it.
      var path = e.composedPath();
      if(!path.includes(dd) && e.target.id !== 'cb-pill'){
        closeDropdown();
        document.removeEventListener('click', outsideClick);
      }
    });
  }, 100);

  fetchOffers(game, mode).then(function(result){
    if(!dropdownOpen || _ddGame !== game || _ddStep !== 'offers') return; // dropdown closed, game changed, or user already moved past this step
    _ddOffers = result.offers;
    _ddReferenceCondition = result.condition || 'A1';
    _ddSort = 'soonest';
    renderOfferStep();
  });
}

async function fetchOffers(game, mode){
  try{
    var url = `${CB_API}?action=listOffers&game=${encodeURIComponent(game.title)}&role=${mode}`;
    var res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    var data = await res.json();
    if(data.ok) return { offers: data.offers || [], condition: data.condition };
  }catch(_){}
  return { offers: [], condition: null };
}

function timelineLabel(val){
  if(val === 'now') return 'Available now';
  if(val === 'flex') return 'Flexible, within 90d';
  if(val && /^\d+$/.test(val)) return 'Within ' + val + 'd';
  return 'Timing flexible';
}

function timelineSortRank(val){
  if(val === 'now') return 0;
  if(val && /^\d+$/.test(val)) return parseInt(val, 10);
  return 999; // flex / unknown - last
}

function sortOffers(offers, sort){
  var copy = offers.slice();
  if(sort === 'rating'){
    copy.sort(function(a, b){
      if(b.rating !== a.rating) return b.rating - a.rating;
      return b.reviewCount - a.reviewCount;
    });
  } else {
    copy.sort(function(a, b){ return timelineSortRank(a.timeline) - timelineSortRank(b.timeline); });
  }
  return copy;
}

function ratingLabel(o){
  if(!o.reviewCount) return '<span class="dd-offer-new">New member</span>';
  return `<span class="dd-offer-stars">${starsHTML(Math.round(o.rating))}</span> ${o.rating.toFixed(1)} <span class="dd-offer-count">(${o.reviewCount})</span>`;
}

// ── Step 1: browse real committed offers, or go straight to custom params ───
function renderOfferStep(){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  _ddStep = 'offers';
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  var offers = sortOffers(_ddOffers || [], _ddSort);
  var counterpart = isSell ? 'buyer' : 'seller';

  var head = `<div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">Nintendo Switch &nbsp;·&nbsp; A1 condition (like new)</div>`;

  if(!offers.length){
    body.innerHTML = head + `
      <div class="dd-empty-notice">
        No ${counterpart}s available yet for this game - you'd be the first.
        Lock in your parameters below and we'll match you the instant someone joins.
      </div>
      ${renderCustomParamsHTML(blueClass, isSell)}
    `;
    wireCustomParamsEvents();
    return;
  }

  var cards = offers.map(function(o){
    return `<button class="dd-offer-card${blueClass}" data-cb-action="pick-offer" data-offer-id="${o.offerId}" data-price="${o.price}" data-timeline="${esc(o.timeline)}" type="button">
      <div class="dd-offer-left">
        <div class="dd-offer-price">$${o.price}</div>
        <div class="dd-offer-rating">${ratingLabel(o)}</div>
        <div class="dd-offer-meta">${esc(timelineLabel(o.timeline))}</div>
      </div>
      <div class="dd-offer-pick">Bond &rarr;</div>
    </button>`;
  }).join('');

  body.innerHTML = head + `
    <div class="dd-offer-terms${blueClass}"><strong>${esc(_ddReferenceCondition)} condition guaranteed</strong> on every offer - price reflects when each person locked in, timing and rating are theirs</div>
    <div class="dd-offer-toprow">
      <div class="dd-offer-label">${offers.length} ${counterpart}${offers.length!==1?'s':''} committed</div>
      <div class="dd-sort-toggle">
        <button class="dd-sort-btn${_ddSort==='soonest'?' sel':''}" data-cb-action="set-sort" data-sort="soonest" type="button">Soonest</button>
        <button class="dd-sort-btn${_ddSort==='rating'?' sel':''}" data-cb-action="set-sort" data-sort="rating" type="button">Top rated</button>
      </div>
    </div>
    <div class="dd-offer-list">${cards}</div>
    <button class="dd-custom-link" data-cb-action="show-custom" type="button">None of these work? Set your own timeline &rarr;</button>
    <div class="dd-sort-note">Price &amp; distance sorting arrive with national shipping - every trade is local and this price today.</div>
  `;
}

window.cbSetSort = function(sort){
  _ddSort = sort;
  renderOfferStep();
};

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
    `<button class="dd-tl-btn${val===defaultTl?' sel':''}" data-cb-action="sel-tl" data-tl="${val}" type="button">
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
    <button class="dd-breakdown-toggle" data-cb-action="toggle-breakdown" type="button">
      See full price breakdown ${isSell ? '&amp; ownership score' : '&amp; timing options'}
      <svg id="dd-bd-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div id="dd-breakdown" class="dd-breakdown"></div>
    <div class="dd-tl-label">${isSell ? 'When can you sell?' : 'When do you need it?'}</div>
    <div class="dd-tl-row">${tlHTML}</div>
    <button class="dd-cta${blueClass}" data-cb-action="show-confirm" type="button">
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
  _ddStep = 'custom';
  _ddOfferId = null;
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  body.innerHTML = `
    <button class="dd-back" data-cb-action="back-to-offer" type="button">
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
window.cbPickOffer = function(offerId, price, timeline){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  _ddStep = 'picked';
  _ddOfferId = offerId;
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  var priceLabel = isSell ? 'YOU GET (LOCKED)' : 'YOU PAY (LOCKED)';

  body.innerHTML = `
    <button class="dd-back" data-cb-action="back-to-offer" type="button">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>Back
    </button>
    <div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">Bonding with a committed ${isSell?'buyer':'seller'}</div>
    <div class="dd-price-card${blueClass}">
      <div>
        <div class="dd-price-label">${priceLabel}</div>
        <div class="dd-price-val">$${price}</div>
      </div>
      <div class="dd-badge${blueClass}">${esc(_ddReferenceCondition)} &middot; ${esc(timelineLabel(timeline))}</div>
    </div>
    <button class="dd-cta${blueClass}" data-cb-action="show-confirm" type="button">
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
  _ddStep = 'confirm';
  var isSell = _ddMode === 'sell';
  var blueClass = isSell ? '' : ' blue';
  var price = _ddOfferId ? _ddPickedPrice : _ddGame.price;

  body.innerHTML = `
    <button class="dd-back" data-cb-action="back-from-confirm" type="button">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      Back
    </button>
    <div class="dd-game">${esc(_ddGame.title)}</div>
    <div class="dd-meta">${isSell ? 'Selling' : 'Buying'} at <strong>$${price}</strong> &middot; ${timelineLabel(currentTl)}</div>
    <div class="dd-confirm-label">Where should we send your match?</div>
    <input class="dd-input" id="dd-email" type="email" placeholder="you@email.com" autocomplete="email">
    <input class="dd-input" id="dd-zip" type="text" placeholder="ZIP code (helps find a nearby match)" maxlength="5" inputmode="numeric">
    <button class="dd-cta${blueClass}" id="dd-submit-btn" data-cb-action="submit-lock" type="button">
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
      if(note){ note.textContent = 'Something went wrong - try again, or finish at cartridgebond.com.'; }
    });
};

function cbShowSuccess(matched){
  var body = document.getElementById('dd-body');
  if(!body || !_ddGame) return;
  _ddStep = 'success';
  var isSell = _ddMode === 'sell';
  var waiting = isSell ? _ddBuyers : _ddSellers;
  var price = _ddOfferId ? _ddPickedPrice : _ddGame.price;

  var title = matched ? "You're matched" : "You're locked in";
  var sub = matched
    ? `$${price} on ${esc(_ddGame.title)} is confirmed with your ${isSell?'buyer':'seller'}. Check your email for next steps.`
    : `$${price} on ${esc(_ddGame.title)} is locked${waiting > 0 ? ` - ${waiting} ${isSell?'buyer':'seller'}${waiting!==1?'s':''} already waiting` : ''}. We'll email you the moment you're matched.`;

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

// ── Full price breakdown - content differs by mode ───────────────────────────
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

// Sell mode: Ownership Score + stars, plus the full comparison table -
// eBay net-to-seller and GameStop trade-in are legitimate sell-side
// reference points here ("you'd net less elsewhere").
// Buy mode: A1/zero-fee/availability value props, plus ONLY retail vs
// CartridgeBond - eBay's net-to-seller figure and GameStop's trade-in
// payout are NOT what a buyer would pay at either place, so showing them
// as "eBay, used" / "GameStop, used" in a buy-mode context is misleading,
// not just unhelpful. Omitted here until real buyer-facing prices exist.
function renderBreakdown(data, mode){
  var c = data.comparison, intel = data.intel;
  var isSell = mode === 'sell';

  if(!isSell){
    // "A1 condition guaranteed" and "Zero fees" are already shown as chips
    // right above this toggle (always visible, not hidden behind the
    // expand) - repeating them again here would just be saying the same
    // thing twice in the same breath, so only the genuinely new fact
    // (timing flexibility) goes in the expanded panel.
    var valueBlock = `
      <div class="dd-bd-value-grid">
        <div class="dd-bd-value-item">✓ Available now, 30d, or flexible 90d</div>
      </div>
    `;
    if(!c) return valueBlock + `<div class="dd-bd-loading">No platform pricing on file yet for this title.</div>`;
    var buyRows = `
      <div class="dd-bd-row"><span>Buy new (retail)</span><span>$${c.retailPrice ?? ' - '}</span></div>
      <div class="dd-bd-row hl"><span>CartridgeBond (A1, used)</span><span>$${c.cartridgeBondPrice}</span></div>
    `;
    return valueBlock + buyRows;
  }

  var sellRows = '';
  if(c){
    sellRows = `
      <div class="dd-bd-row"><span>Buy new (retail)</span><span>$${c.retailPrice ?? ' - '}</span></div>
      <div class="dd-bd-row hl"><span>CartridgeBond (A1, used)</span><span>$${c.cartridgeBondPrice}</span></div>
      <div class="dd-bd-row"><span>eBay, net to seller</span><span>$${c.ebayNetLow}&ndash;${c.ebayNetHigh}</span></div>
      <div class="dd-bd-row"><span>GameStop, trade-in</span><span>$${c.gameStopTradeIn}</span></div>
    `;
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
  if(!sellRows && !scoreBlock) return `<div class="dd-bd-loading">No breakdown data yet for this title.</div>`;
  return scoreBlock + sellRows;
}

// ── Build pill HTML ───────────────────────────────────────────────────────────
// ── Build pill HTML ───────────────────────────────────────────────────────────
function buildPill(game, buyers, sellers){
  var hasBuyers  = buyers  > 0;
  var hasSellers = sellers > 0;
  var arrowSVG   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

  var stateClass = hasBuyers ? 'cb-state-buyers' : hasSellers ? 'cb-state-sellers' : 'cb-state-empty';
  var dotColor   = '#22c55e'; // green always - no more buy/sell color split

  var msg, sub, actionInner;

  if(hasBuyers){
    msg = `Sell PreOwned for <strong style="color:#15803d!important;font-weight:800!important;">$${game.price}</strong> - A1 Condition`;
    sub = `<span class="cb-count" id="cb-cnt">${buyers}</span> Future Buyer${buyers!==1?'s':''} Committed - $0 Fees in Beta`;
    actionInner = `<button class="cb-action-btn" data-cb-action="open-dropdown" data-mode="sell" type="button">
      Sell PreOwned ${arrowSVG}
    </button>
    <button class="cb-action-secondary" data-cb-action="open-dropdown" data-mode="buy" type="button">Buy PreOwned</button>`;
  } else if(hasSellers){
    msg = `Buy PreOwned for <strong style="color:#15803d!important;font-weight:800!important;">$${game.price}</strong> - A1 Condition`;
    sub = `<span class="cb-count" id="cb-cnt">${sellers}</span> Future Seller${sellers!==1?'s':''} Committed - $0 Fees in Beta`;
    actionInner = `<button class="cb-action-btn" data-cb-action="open-dropdown" data-mode="buy" type="button">
      Buy PreOwned ${arrowSVG}
    </button>
    <button class="cb-action-secondary" data-cb-action="open-dropdown" data-mode="sell" type="button">Sell PreOwned</button>`;
  } else {
    msg = `<strong style="color:#15803d!important;font-weight:800!important;">$${game.price}</strong> PreOwned Buy/Sell Price`;
    sub = `A1 Condition Only - Choose Your Timing`;
  }

  var actionHTML = hasBuyers || hasSellers
    ? `<div class="cb-action-wrap">${actionInner}</div>`
    : `<div class="cb-dual-wrap">
        <button class="cb-dual-sell cb-dual-active" data-cb-action="open-dropdown" data-mode="sell" type="button">Sell PreOwned</button>
        <button class="cb-dual-buy" data-cb-action="open-dropdown" data-mode="buy" type="button">Buy PreOwned</button>
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

// Opens the dropdown for a given mode - called via delegated click handler
// at the bottom of this file, not inline onclick (content scripts run in an
// isolated JS world; inline onclick="" attributes always execute in the
// page's own main world and can never reach an isolated-world function, so
// every interactive element in this file is wired through one delegated
// listener using data-cb-action attributes instead).
var _currentGame = null;
var _currentBuyers = 0, _currentSellers = 0;
function cbOpenDropdown(mode){
  var anchor = document.getElementById('cb-pill');
  // Reflect whichever action was actually clicked - the dual-state pill
  // (shown before any buyers/sellers exist) shouldn't keep showing "Sell"
  // as the highlighted action if the person just clicked "Buy".
  var sellBtn = document.querySelector('.cb-dual-sell');
  var buyBtn  = document.querySelector('.cb-dual-buy');
  if(sellBtn && buyBtn){
    sellBtn.classList.toggle('cb-dual-active', mode === 'sell');
    buyBtn.classList.toggle('cb-dual-active', mode === 'buy');
  }
  if(_currentGame) openDropdown(_currentGame, mode, anchor);
}

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
var _mounting = false;
async function CBMount(anchor, game){
  if(!anchor || !game) return;
  if(_mounting || document.getElementById('cb-pill')) return;
  _mounting = true; // set synchronously, before any await, so concurrent
                     // MutationObserver-triggered calls on SPA pages (Target,
                     // Best Buy, etc.) can't all slip past the guard above
                     // during the gap before the first await resolves
  try {
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
  } finally {
    _mounting = false;
  }
}

// ── Single delegated click handler for the whole pill + dropdown UI ─────────
// Every interactive element above is wired via data-cb-action (+ data-*
// params) instead of inline onclick="" - see the note above cbOpenDropdown
// for why. One listener, attached once, handles all of it by inspecting
// which data-cb-action fired.
document.addEventListener('click', function(e){
  var el = e.target.closest('[data-cb-action]');
  if(!el) return;
  var action = el.dataset.cbAction;

  if(action === 'open-dropdown'){
    e.stopPropagation();
    cbOpenDropdown(el.dataset.mode);
    return;
  }

  // Everything else below only makes sense once the dropdown exists
  switch(action){
    case 'close':
      closeDropdown();
      break;
    case 'pick-offer':
      cbPickOffer(parseInt(el.dataset.offerId, 10), parseFloat(el.dataset.price), el.dataset.timeline);
      break;
    case 'set-sort':
      cbSetSort(el.dataset.sort);
      break;
    case 'show-custom':
      cbShowCustomParams();
      break;
    case 'sel-tl':
      cbSelTl(el.dataset.tl, el);
      break;
    case 'toggle-breakdown':
      cbToggleBreakdown();
      break;
    case 'show-confirm':
      cbShowConfirm();
      break;
    case 'back-to-offer':
      cbBackToOffer();
      break;
    case 'back-from-confirm':
      if(_ddOfferId){ cbPickOffer(_ddOfferId, _ddPickedPrice, currentTl); }
      else { cbShowCustomParams(); }
      break;
    case 'submit-lock':
      cbSubmitLock();
      break;
  }
});
