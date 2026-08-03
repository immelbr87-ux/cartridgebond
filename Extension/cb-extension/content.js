function buildPill(game, buyers, sellers, bestBuyerTimeline, bestBuyerDays) {
  const isSell  = buyers > 0;
  const isBuy   = sellers > 0 && !isSell;
  const isEmpty = !buyers && !sellers;
  const CB_SITE_LOCAL = 'https://www.cartridgebond.com';
  const sellUrl = `${CB_SITE_LOCAL}/index.html?game=${encodeURIComponent(game.title)}&mode=sell#widget`;
  const buyUrl  = `${CB_SITE_LOCAL}/index.html?game=${encodeURIComponent(game.title)}&mode=buy#widget`;

  let pillClass, dotColor, ringColor, message, subtext, actionHTML;

  if (isSell) {
    pillClass = 'cb-state-buyers';
    dotColor  = '#22c55e'; ringColor = '#22c55e';
    message   = `<span class="cb-count" data-target="${buyers}" style="color:#16a34a;">${buyers}</span> future buyer${buyers !== 1 ? 's' : ''} want this game`;
    subtext   = `Sell it used when you're done &nbsp;·&nbsp; Lock <span class="cb-price" style="color:#16a34a;font-weight:700;">$${game.price}</span> now`;
    actionHTML = `
      <div class="cb-action-wrap">
        <button class="cb-action-btn" data-cb-action="sell" data-cb-url="${sellUrl}" data-cb-buyer-timeline="${bestBuyerTimeline || 'Flexible'}" data-cb-buyer-days="${bestBuyerDays || 90}">
          Sell later
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div class="cb-wordmark-sub">Cartridge<em>Bond</em></div>
      </div>`;
  } else if (isBuy) {
    pillClass = 'cb-state-sellers';
    dotColor  = '#3b82f6'; ringColor = '#3b82f6';
    message   = `<span class="cb-count" data-target="${sellers}" style="color:#1d4ed8;">${sellers}</span> seller${sellers !== 1 ? 's' : ''} ready to trade`;
    subtext   = `Buy used A1 condition &nbsp;·&nbsp; <span class="cb-price" style="color:#1d4ed8;font-weight:700;">$${game.price} locked</span>`;
    actionHTML = `
      <div class="cb-action-wrap">
        <button class="cb-action-btn blue" data-cb-action="buy" data-cb-url="${buyUrl}">
          Buy now
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div class="cb-wordmark-sub">Cartridge<em>Bond</em></div>
      </div>`;
  } else {
    pillClass = 'cb-state-empty';
    dotColor  = '#22c55e'; ringColor = '#22c55e';
    message   = `Lock in <strong style="color:#16a34a;font-weight:800;">$${game.price}</strong> &nbsp;&middot;&nbsp; A1 condition`;
    subtext   = `Sell when ready &nbsp;&middot;&nbsp; Buy used &nbsp;&middot;&nbsp; Choose timing`;
    actionHTML = `
      <div class="cb-dual-wrap">
        <button class="cb-dual-sell" data-cb-action="sell" data-cb-url="${sellUrl}" data-cb-buyer-timeline="${bestBuyerTimeline || 'Flexible'}" data-cb-buyer-days="${bestBuyerDays || 90}">Sell</button>
        <button class="cb-dual-buy" data-cb-action="buy" data-cb-url="${buyUrl}">Buy</button>
      </div>`;
  }

  return `
    <div class="cb-pill ${pillClass}" id="cb-pill">
      <div class="cb-pill-inner">
        <div class="cb-left">
          <div class="cb-dot-wrap">
            <span class="cb-dot" style="background:${dotColor};"></span>
            <span class="cb-dot-ring" style="border-color:${ringColor};"></span>
            <span class="cb-dot-ring-2" style="border-color:${ringColor};"></span>
          </div>
          <div class="cb-text-block">
            <div class="cb-message">${message}</div>
            <div class="cb-sub">${subtext}</div>
            <div class="cb-brand-inline">Cartridge<em>Bond</em></div>
          </div>
        </div>
        ${actionHTML}
      </div>
    </div>`;
}

// ── Build expanded card (shown when pill is clicked) ──────────────────────────
function buildExpandCard(game, mode, buyerTimeline, buyerDays) {
  const isBuy       = mode === 'buy';
  const hasMatch    = !!buyerTimeline; // true when real buyers are waiting
  const sellUrl     = `https://www.cartridgebond.com/index.html?game=${encodeURIComponent(game.title)}&mode=sell#widget`;
  const buyUrl      = `https://www.cartridgebond.com/index.html?game=${encodeURIComponent(game.title)}&mode=buy#widget`;
  const cardCls     = isBuy ? 'cb-expand-card blue' : 'cb-expand-card';
  const lockCls     = isBuy ? 'cbx-lock-btn blue'   : 'cbx-lock-btn';
  const ctaUrl      = isBuy ? buyUrl : sellUrl;

  // ── Match found: show buyer/seller details, no timing picker ──────────────
  if (hasMatch && !isBuy) {
    const tlLabel  = buyerDays === 0   ? 'Ready now'
                   : buyerDays <= 30   ? 'Within 30 days'
                   : buyerDays <= 60   ? 'Within 60 days'
                   : 'Flexible — within 90 days';
    const tlBadge = `<div class="cbx-match-badge">${tlLabel}</div>`;

    return `
      <div class="cb-expand-card" id="cb-expand">
        <div class="cbx-head">
          <div class="cbx-brand-row">
            <div class="cbx-live-dot"></div>
            <div class="cbx-brand-text">Cartridge<em>Bond</em></div>
          </div>
          <button class="cbx-close" onclick="cbCollapseCard()">&#x2715;</button>
        </div>
        <div class="cbx-divider"></div>
        <div class="cbx-body">
          <div class="cbx-match-eyebrow">You have a buyer.</div>
          <div class="cbx-game-name">${game.title}</div>
          <div class="cbx-condition">Nintendo Switch &nbsp;·&nbsp; <strong>A1 guaranteed</strong></div>
          <div class="cbx-match-info">
            <div class="cbx-match-row">
              <span class="cbx-match-label">Buyer's timeline</span>
              ${tlBadge}
            </div>
            <div class="cbx-match-row">
              <span class="cbx-match-label">Condition required</span>
              <div class="cbx-match-badge">A1 — Like new</div>
            </div>
          </div>
          <div class="cbx-price-row">
            <div>
              <div class="cbx-price-lbl">You receive</div>
              <div class="cbx-price-amount">$${game.price}</div>
            </div>
            <div class="cbx-price-notes">Locked now<br>Zero fees during beta</div>
          </div>
          <button class="cbx-lock-btn" onclick="window.open('${ctaUrl}','_blank')">
            Lock in · Sell for $${game.price}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="cbx-footer">
          <a href="https://www.cartridgebond.com" target="_blank">cartridgebond.com &nbsp;·&nbsp; Cartridge<em>Bond</em></a>
        </div>
      </div>`;
  }

  // ── No match / Buy mode: show timing picker ───────────────────────────────
  const chipCls = isBuy ? 'selected-blue' : 'selected';
  const tLabel  = isBuy ? 'When do you need it?' : 'When can you sell it?';
  const lockLbl = isBuy ? 'Buy this game on CartridgeBond' : 'Lock my sell price';
  const chips   = isBuy
    ? ['Flexible','In 60 days','In 30 days','Now']
    : ['Flexible','In 60 days','In 30 days'];
  const chipsHtml = chips.map((c, i) =>
    `<button class="cbx-chip ${i === 0 ? chipCls : ''}" onclick="cbSelectChip(this,'${chipCls}')">${c}</button>`
  ).join('');

  return `
    <div class="${cardCls}" id="cb-expand">
      <div class="cbx-head">
        <div class="cbx-brand-row">
          <div class="cbx-live-dot"></div>
          <div class="cbx-brand-text">Cartridge<em>Bond</em></div>
        </div>
        <button class="cbx-close" onclick="cbCollapseCard()">&#x2715;</button>
      </div>
      <div class="cbx-divider"></div>
      <div class="cbx-body">
        <div class="cbx-game-name">${game.title}</div>
        <div class="cbx-condition">Nintendo Switch &nbsp;·&nbsp; <strong>A1 guaranteed</strong></div>
        <div class="cbx-timing-label">${tLabel}</div>
        <div class="cbx-chips">${chipsHtml}</div>
        <div class="cbx-price-row">
          <div>
            <div class="cbx-price-lbl">Locked price</div>
            <div class="cbx-price-amount">$${game.price}</div>
          </div>
          <div class="cbx-price-notes">A1 condition only<br>Zero fees during beta</div>
        </div>
        <button class="${lockCls}" onclick="window.open('${ctaUrl}','_blank')">
          ${lockLbl}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
      <div class="cbx-footer">
        <a href="https://www.cartridgebond.com" target="_blank">cartridgebond.com &nbsp;·&nbsp; Cartridge<em>Bond</em></a>
      </div>
    </div>`;
}

// Chip selection helper (called from expanded card)
function cbSelectChip(el, selClass) {
  el.closest('.cbx-chips').querySelectorAll('.cbx-chip').forEach(b => {
    b.classList.remove('selected', 'selected-blue');
  });
  el.classList.add(selClass);
}

// Collapse expanded card back to pill
function cbCollapseCard() {
  const expand = document.getElementById('cb-expand');
  const pill   = document.getElementById('cb-pill');
  if (expand) expand.remove();
  if (pill) pill.style.display = '';
}


// CartridgeBond — Amazon content script

const CB_API  = 'https://script.google.com/macros/s/AKfycbybpmlpe6PtFsotY0iQ9CCCiYgsqJ8tyyLFib0pkqd8uyVKazgoyLiybfQZYmvC-xMd/exec';
const CB_SITE = 'https://www.cartridgebond.com';

const CB_GAMES = [
  { keys:['mario kart 8'],                         title:'Mario Kart 8 Deluxe',     price:43 },
  { keys:['tears of the kingdom','zelda totk'],     title:'Zelda: TOTK',             price:50 },
  { keys:['breath of the wild','zelda botw'],       title:'Zelda: BOTW',             price:35 },
  { keys:['smash bros ultimate','super smash'],     title:'Smash Bros Ultimate',     price:31 },
  { keys:['mario odyssey','super mario odyssey'],   title:'Mario Odyssey',           price:38 },
  { keys:['mario bros wonder','mario wonder'],      title:'Mario Wonder',            price:45 },
  { keys:['mario 3d world','bowser'],               title:'Mario 3D World',          price:36 },
  { keys:['mario party superstars'],                title:'Mario Party Superstars',  price:38 },
  { keys:['mario party jamboree'],                  title:'Mario Party Jamboree',    price:44 },
  { keys:['animal crossing'],                       title:'Animal Crossing NH',      price:36 },
  { keys:['pokemon scarlet'],                       title:'Pokemon Scarlet',         price:39 },
  { keys:['pokemon violet'],                        title:'Pokemon Violet',          price:38 },
  { keys:['pokemon sword'],                         title:'Pokemon Sword',           price:32 },
  { keys:['pokemon shield'],                        title:'Pokemon Shield',          price:32 },
  { keys:['pokemon legends arceus'],                title:'Pokemon Legends Arceus',  price:35 },
  { keys:['brilliant diamond'],                     title:'Pokemon BD',              price:30 },
  { keys:['shining pearl'],                         title:'Pokemon SP',              price:30 },
  { keys:['splatoon 3'],                            title:'Splatoon 3',              price:34 },
  { keys:['splatoon 2'],                            title:'Splatoon 2',              price:28 },
  { keys:["luigi's mansion 3",'luigis mansion'],    title:"Luigi's Mansion 3",       price:32 },
  { keys:['kirby forgotten land'],                  title:'Kirby Forgotten Land',    price:32 },
  { keys:['metroid dread'],                         title:'Metroid Dread',           price:30 },
  { keys:['tropical freeze'],                       title:'DKC Tropical Freeze',     price:30 },
  { keys:['rabbids sparks'],                        title:'Mario + Rabbids Sparks',  price:28 },
  { keys:['fire emblem engage'],                    title:'Fire Emblem Engage',      price:30 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isProductPage(){ return /\/dp\/[A-Z0-9]{10}/i.test(location.pathname); }

function isSwitchGame(){
  const page = (document.body && document.body.innerText || '').substring(0,3000).toLowerCase();
  const title = (document.querySelector('#productTitle') || {}).textContent || '';
  return [page, title.toLowerCase()].join(' ').includes('nintendo switch');
}

function matchGame(text){
  const t = text.toLowerCase();
  for(const g of CB_GAMES){ if(g.keys.some(k => t.includes(k))) return g; }
  return null;
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
var dropdownOpen = false;
var currentTl    = 'flex'; // timeline selection in dropdown

function closeDropdown(){
  var d = document.getElementById('cb-dropdown');
  if(d) d.remove();
  dropdownOpen = false;
}

function buildDropdownHTML(game, mode){
  var isSell = mode === 'sell';
  var tlOpts = isSell
    ? [['Now','ASAP','now'],['30d','1 month','30'],['60d','2 months','60'],['90d','3 months','90']]
    : [['Flexible','Within 90d','flex'],['30d','1 month','30'],['Now','ASAP','now']];
  var defaultTl = isSell ? 'now' : 'flex';
  currentTl = defaultTl;
  var priceLabel = isSell ? 'YOU GET (LOCKED)' : 'YOU PAY (LOCKED)';
  var blueClass  = isSell ? '' : ' blue';
  var ctaLabel   = isSell ? 'Lock in my sell price' : 'Lock in my buy price';

  var tlHTML = tlOpts.map(([top,bot,val]) =>
    `<button class="dd-tl-btn${val===defaultTl?' sel':''}"
       onclick="cbSelTl('${val}',this)"
       type="button">
       <div class="dd-tl-top">${top}</div>
       <div class="dd-tl-bot">${bot}</div>
     </button>`
  ).join('');

  return `<div class="dd-head">
    <div class="dd-brand">Cartridge<em>Bond</em></div>
    <button class="dd-close" onclick="cbCloseDropdown()" type="button">✕</button>
  </div>
  <div class="dd-body">
    <div class="dd-game">${game.title}</div>
    <div class="dd-meta">Nintendo Switch &nbsp;·&nbsp; A1 condition (like new)</div>
    <div class="dd-price-card${blueClass}">
      <div>
        <div class="dd-price-label">${priceLabel}</div>
        <div class="dd-price-val">$${game.price}</div>
      </div>
      <div class="dd-badge${blueClass}">Price locked before contact</div>
    </div>
    <div class="dd-tl-label">${isSell ? 'When can you sell?' : 'When do you need it?'}</div>
    <div class="dd-tl-row">${tlHTML}</div>
    <button class="dd-cta${blueClass}" onclick="cbCTAClick('${game.title}','${mode}')" type="button">
      ${ctaLabel}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
    <div class="dd-note">
      Opens <a href="${CB_SITE}" target="_blank">CartridgeBond</a>
      &nbsp;·&nbsp; Free during beta &nbsp;·&nbsp; No payment collected here
    </div>
  </div>`;
}

function openDropdown(game, mode, anchorEl){
  closeDropdown();
  dropdownOpen = true;

  var dd = document.createElement('div');
  dd.id = 'cb-dropdown';
  dd.innerHTML = buildDropdownHTML(game, mode);
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
      if(!dd.contains(e.target) && e.target.id !== 'cb-pill-root'){
        closeDropdown();
        document.removeEventListener('click', outsideClick);
      }
    });
  }, 100);
}

// Global handlers (accessible from inline onclick)
window.cbCloseDropdown = closeDropdown;
window.cbSelTl = function(val, el){
  currentTl = val;
  document.querySelectorAll('#cb-dropdown .dd-tl-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
};
window.cbCTAClick = function(gameTitle, mode){
  var url = `${CB_SITE}/index.html?game=${encodeURIComponent(gameTitle)}&mode=${mode}&timeline=${encodeURIComponent(currentTl)}#widget`;
  window.open(url, '_blank', 'noopener');
  closeDropdown();
};

// ── Build pill HTML ───────────────────────────────────────────────────────────
function buildPill(game, buyers, sellers, bestBuyerTimeline, bestBuyerDays){
  var hasBuyers  = buyers  > 0;
  var hasSellers = sellers > 0;
  var arrowSVG   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

  var labelDotColor = hasBuyers ? '#22c55e' : hasSellers ? '#3b82f6' : '#22c55e';
  var label = `<div class="cb-label-row">
    <div class="cb-live-dot" style="background:${labelDotColor}!important;"></div>
    <span class="cb-live-label">CartridgeBond &mdash; Live resale</span>
  </div>`;

  var pillClass = hasBuyers ? 'cb-buyers' : hasSellers ? 'cb-sellers' : 'cb-empty';
  var dotColor  = hasSellers && !hasBuyers ? '#3b82f6' : '#22c55e';

  var msg, sub, action;

  if(hasBuyers){
    msg    = `<span class="cb-cnt green" id="cb-cnt">${buyers}</span> future buyer${buyers!==1?'s':''} want this game`;
    sub    = `Sell it used when you&rsquo;re done &middot; Lock <span class="p green">$${game.price}</span> now`;
    action = `<button class="cb-cta" onclick="cbOpenDropdown(event,'sell')" type="button">
      <span class="cb-cta-brand">Cartridge<em>Bond</em></span>
      <span class="cb-cta-label">Sell later ${arrowSVG}</span>
    </button>`;
  } else if(hasSellers){
    msg    = `<span class="cb-cnt blue" id="cb-cnt">${sellers}</span> seller${sellers!==1?'s':''} ready to trade`;
    sub    = `Buy used at <span class="p blue">$${game.price}</span> &middot; A1 condition guaranteed`;
    action = `<button class="cb-cta blue" onclick="cbOpenDropdown(event,'buy')" type="button">
      <span class="cb-cta-brand">Cartridge<em>Bond</em></span>
      <span class="cb-cta-label">Buy now ${arrowSVG}</span>
    </button>`;
  } else {
    msg    = `Lock in <strong style="color:#15803d!important;font-weight:800!important;">$${game.price}</strong> &nbsp;&middot;&nbsp; A1 condition`;
    sub    = `Sell when ready &middot; Buy used &middot; Choose your timing`;
    action = `<div class="cb-dual">
      <button class="cb-sell-btn" onclick="cbOpenDropdown(event,'sell')" type="button">
        <span class="cb-btn-brand">Cartridge<em style="font-style:normal!important;color:rgba(255,255,255,.95)!important;">Bond</em></span>
        <span class="cb-btn-label">Sell</span>
      </button>
      <button class="cb-buy-btn" onclick="cbOpenDropdown(event,'buy')" type="button">
        <span class="cb-btn-brand">Cartridge<em style="font-style:normal!important;color:#15803d!important;">Bond</em></span>
        <span class="cb-btn-label">Buy</span>
      </button>
    </div>`;
  }

  return `<div id="cb-pill-root">
    ${label}
    <div class="cb-pill ${pillClass}">
      <div class="cb-body">
        <div class="cb-dot-wrap">
          <span class="cb-dot" style="background:${dotColor}!important;"></span>
          <span class="cb-ring" style="border-color:${dotColor}!important;"></span>
          <span class="cb-ring2" style="border-color:${dotColor}!important;"></span>
        </div>
        <div class="cb-text">
          <div class="cb-msg">${msg}</div>
          <div class="cb-sub">${sub}</div>
        </div>
      </div>
      <div class="cb-div${hasSellers&&!hasBuyers?' blue':''}"></div>
      ${action}
    </div>
  </div>`;
}

// Global opener called from pill onclick
var _currentGame = null;
window.cbOpenDropdown = function(e, mode){
  e.stopPropagation();
  var anchor = document.getElementById('cb-pill-root');
  if(_currentGame) openDropdown(_currentGame, mode, anchor);
};

// ── Inject ────────────────────────────────────────────────────────────────────
function injectPill(game, buyers, sellers){
  if(document.getElementById('cb-pill-root')) return;
  var anchor = document.querySelector('#averageCustomerReviews') ||
               document.querySelector('[data-hook="rating-out-of-text"]')?.closest('.a-section');
  if(!anchor) return;
  var wrapper = document.createElement('div');
  wrapper.innerHTML = buildPill(game, buyers, sellers, bestBuyerTimeline, bestBuyerDays);
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

async function init(){
  if(!isProductPage()) return;
  if(!isSwitchGame()) return;
  var title = (document.querySelector('#productTitle')||{}).textContent||'';
  var game  = matchGame(title);
  if(!game) return;
  _currentGame = game;

  // Skeleton
  var anchor = document.querySelector('#averageCustomerReviews');
  if(!anchor) return;
  var sk = document.createElement('div');
  sk.id = 'cb-pill-root';
  sk.innerHTML = `<div class="cb-skeleton"><div class="cb-sk-dot"></div><div class="cb-sk-line"></div></div>`;
  anchor.parentNode.insertBefore(sk, anchor.nextSibling);

  var { buyers, sellers } = await fetchBondData(game);
  sk.remove();
  injectPill(game, buyers, sellers, bestBuyerTimeline, bestBuyerDays);
  chrome.storage.local.set({ cb_detected: { game:game.title, price:game.price, buyers, sellers, url:location.href }});
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }

var lastPath = location.pathname;
new MutationObserver(function(){
  if(location.pathname !== lastPath){ lastPath = location.pathname; setTimeout(init, 1000); }
}).observe(document.body, { childList:true, subtree:true });
