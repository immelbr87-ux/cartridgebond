// ─────────────────────────────────────────────────────────────────────────────
//  CartridgeBond — Walmart Content Script
//  Injects a "buy used for less" comparison card on Walmart product pages.
// ─────────────────────────────────────────────────────────────────────────────

const CB_API_WMT  = 'https://script.google.com/macros/s/AKfycbybpmlpe6PtFsotY0iQ9CCCiYgsqJ8tyyLFib0pkqd8uyVKazgoyLiybfQZYmvC-xMd/exec';
const CB_SITE_WMT = 'https://www.cartridgebond.com';

const WMT_GAMES = [
  { keys:['tears of the kingdom','zelda totk'],       title:'Zelda: TOTK',             price:43, retail:69.99 },
  { keys:['breath of the wild','zelda botw'],         title:'Zelda: BOTW',             price:35, retail:59.99 },
  { keys:['mario kart 8'],                            title:'Mario Kart 8 Deluxe',     price:38, retail:59.99 },
  { keys:['smash bros ultimate','super smash'],       title:'Smash Bros Ultimate',     price:38, retail:59.99 },
  { keys:['mario odyssey','super mario odyssey'],     title:'Mario Odyssey',           price:34, retail:59.99 },
  { keys:['mario bros wonder','mario wonder'],        title:'Mario Wonder',            price:37, retail:59.99 },
  { keys:['mario 3d world','bowser'],                 title:'Mario 3D World',          price:35, retail:59.99 },
  { keys:['mario party superstars'],                  title:'Mario Party Superstars',  price:33, retail:59.99 },
  { keys:['mario party jamboree'],                    title:'Mario Party Jamboree',    price:42, retail:59.99 },
  { keys:['animal crossing'],                         title:'Animal Crossing NH',      price:38, retail:59.99 },
  { keys:['pokemon scarlet'],                         title:'Pokemon Scarlet',         price:36, retail:59.99 },
  { keys:['pokemon violet'],                          title:'Pokemon Violet',          price:37, retail:59.99 },
  { keys:['pokemon sword'],                           title:'Pokemon Sword',           price:36, retail:59.99 },
  { keys:['pokemon shield'],                          title:'Pokemon Shield',          price:36, retail:59.99 },
  { keys:['pokemon legends arceus'],                  title:'Pokemon Legends Arceus',  price:40, retail:59.99 },
  { keys:['brilliant diamond'],                       title:'Pokemon BD',              price:32, retail:59.99 },
  { keys:['shining pearl'],                           title:'Pokemon SP',              price:32, retail:59.99 },
  { keys:['pokemon legends z-a','legends z-a'],       title:'Pokemon Legends: Z-A',    price:50, retail:59.99 },
  { keys:['splatoon 3'],                              title:'Splatoon 3',              price:36, retail:59.99 },
  { keys:['splatoon 2'],                              title:'Splatoon 2',              price:22, retail:59.99 },
  { keys:["luigi's mansion 3",'luigis mansion'],      title:"Luigi's Mansion 3",       price:34, retail:59.99 },
  { keys:['kirby forgotten land'],                    title:'Kirby Forgotten Land',    price:35, retail:59.99 },
  { keys:['metroid dread'],                           title:'Metroid Dread',           price:34, retail:59.99 },
  { keys:['metroid prime 4','metroid prime beyond'],  title:'Metroid Prime 4: Beyond', price:48, retail:59.99 },
  { keys:['tropical freeze'],                         title:'DKC Tropical Freeze',     price:38, retail:59.99 },
  { keys:['rabbids sparks'],                          title:'Mario + Rabbids Sparks',  price:24, retail:59.99 },
  { keys:['fire emblem engage'],                      title:'Fire Emblem Engage',      price:32, retail:59.99 },
  { keys:['minecraft'],                               title:'Minecraft (Switch)',      price:24, retail:29.99 },
];

function matchWmtGame(text) {
  const t = text.toLowerCase();
  for (const g of WMT_GAMES) {
    if (g.keys.some(k => t.includes(k))) return g;
  }
  return null;
}

function buildWmtCard(game) {
  const diff = (game.retail - game.price).toFixed(2).replace(/\.00$/, '');
  const pct  = Math.round(((game.retail - game.price) / game.retail) * 100);
  const buyUrl = `${CB_SITE_WMT}/index.html?game=${encodeURIComponent(game.title)}&mode=buy#widget`;

  return `
    <div class="cb-gs-wrap" id="cb-wmt-card">
      <div class="cb-pill-inner" style="border-radius:16px;padding:14px 12px 14px 16px;max-width:100%;gap:16px;">
        <div class="cb-left" style="flex-direction:column;align-items:flex-start;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="cb-dot-wrap">
              <span class="cb-dot" style="background:#22c55e;"></span>
              <span class="cb-dot-ring" style="border-color:#22c55e;"></span>
            </div>
            <span style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#16a34a;">CartridgeBond alternative</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;">
            <div style="background:#f5f5f5;border-radius:10px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:600;color:#9a9a9a;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">Buy new here</div>
              <div style="font-size:22px;font-weight:800;color:#6b6b6b;letter-spacing:-.04em;">$${game.retail}</div>
              <div style="font-size:10px;color:#9a9a9a;margin-top:2px;">retail price</div>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:600;color:#16a34a;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">CartridgeBond, used</div>
              <div style="font-size:22px;font-weight:800;color:#16a34a;letter-spacing:-.04em;">$${game.price}</div>
              <div style="font-size:10px;color:#16a34a;margin-top:2px;">save $${diff} (${pct}%)</div>
            </div>
          </div>
        </div>
        <a href="${buyUrl}" target="_blank" rel="noopener" class="cb-cta" style="border-radius:12px;padding:12px 14px;flex-direction:column;gap:2px;align-items:center;min-width:80px;">
          <span class="cb-cta-label" style="font-size:13px;">Buy for $${game.price}</span>
          <span style="font-size:9px;font-weight:600;letter-spacing:.06em;opacity:.8;text-transform:uppercase;">CartridgeBond</span>
        </a>
      </div>
    </div>`;
}

function injectWmtCard(game) {
  if (document.getElementById('cb-wmt-card')) return;
  const anchor = document.querySelector('.prod-product-cta-area, .prod-content-section-main');
  if (!anchor) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildWmtCard(game);
  anchor.parentNode.insertBefore(wrapper.firstElementChild, anchor.firstChild);
}

function initWmt() {
  const titleEl = document.querySelector('h1.prod-ProductTitle, h1[itemprop="name"]');
  if (!titleEl) return;
  const text = (titleEl.textContent || '') + ' ' + document.title;
  if (!text.toLowerCase().includes('nintendo switch')) return;

  const game = matchWmtGame(text);
  if (!game) return;

  injectWmtCard(game);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWmt);
} else {
  initWmt();
}

// Walmart is a single-page app for navigation between related products
const wmtObserver = new MutationObserver(() => {
  if (!document.getElementById('cb-wmt-card')) initWmt();
});
wmtObserver.observe(document.body, { childList: true, subtree: true });
