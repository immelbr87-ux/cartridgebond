// CartridgeBond — Amazon content script

const CB_API  = 'https://script.google.com/macros/s/AKfycbybpmlpe6PtFsotY0iQ9CCCiYgsqJ8tyyLFib0pkqd8uyVKazgoyLiybfQZYmvC-xMd/exec';
const CB_SITE = 'https://www.cartridgebond.com';

const CB_GAMES = [
  { keys:['tears of the kingdom','zelda totk'],     title:'Zelda: TOTK',             price:43 },
  { keys:['breath of the wild','zelda botw'],       title:'Zelda: BOTW',             price:35 },
  { keys:['mario kart 8'],                         title:'Mario Kart 8 Deluxe',     price:38 },
  { keys:['smash bros ultimate','super smash'],     title:'Smash Bros Ultimate',     price:38 },
  { keys:['mario odyssey','super mario odyssey'],   title:'Mario Odyssey',           price:34 },
  { keys:['mario bros wonder','mario wonder'],      title:'Mario Wonder',            price:37 },
  { keys:['mario 3d world','bowser'],               title:'Mario 3D World',          price:35 },
  { keys:['mario party superstars'],                title:'Mario Party Superstars',  price:33 },
  { keys:['mario party jamboree'],                  title:'Mario Party Jamboree',    price:42 },
  { keys:['animal crossing'],                       title:'Animal Crossing NH',      price:38 },
  { keys:['pokemon scarlet'],                       title:'Pokemon Scarlet',         price:36 },
  { keys:['pokemon violet'],                        title:'Pokemon Violet',          price:37 },
  { keys:['pokemon sword'],                         title:'Pokemon Sword',           price:36 },
  { keys:['pokemon shield'],                        title:'Pokemon Shield',          price:36 },
  { keys:['pokemon legends arceus'],                title:'Pokemon Legends Arceus',  price:40 },
  { keys:['brilliant diamond'],                     title:'Pokemon BD',              price:32 },
  { keys:['shining pearl'],                         title:'Pokemon SP',              price:32 },
  { keys:['pokemon legends z-a', 'legends z-a'],    title:'Pokemon Legends: Z-A',    price:50 },
  { keys:['splatoon 3'],                            title:'Splatoon 3',              price:36 },
  { keys:['splatoon 2'],                            title:'Splatoon 2',              price:22 },
  { keys:["luigi's mansion 3",'luigis mansion'],    title:"Luigi's Mansion 3",       price:34 },
  { keys:['kirby forgotten land'],                  title:'Kirby Forgotten Land',    price:35 },
  { keys:['metroid dread'],                         title:'Metroid Dread',           price:34 },
  { keys:['metroid prime 4', 'metroid prime beyond'], title:'Metroid Prime 4: Beyond', price:48 },
  { keys:['tropical freeze'],                       title:'DKC Tropical Freeze',     price:38 },
  { keys:['rabbids sparks'],                        title:'Mario + Rabbids Sparks',  price:24 },
  { keys:['fire emblem engage'],                    title:'Fire Emblem Engage',      price:32 },
  { keys:['minecraft'],                             title:'Minecraft (Switch)',      price:24 },
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
function buildPill(game, buyers, sellers){
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
  injectPill(game, buyers, sellers);
  chrome.storage.local.set({ cb_detected: { game:game.title, price:game.price, buyers, sellers, url:location.href }});
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }

var lastPath = location.pathname;
new MutationObserver(function(){
  if(location.pathname !== lastPath){ lastPath = location.pathname; setTimeout(init, 1000); }
}).observe(document.body, { childList:true, subtree:true });
