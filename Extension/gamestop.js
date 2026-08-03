// ─────────────────────────────────────────────────────────────────────────────
//  CartridgeBond — GameStop Content Script
//  Injects a comparison card on GameStop trade-in value pages.
// ─────────────────────────────────────────────────────────────────────────────

const CB_API_GS  = 'https://script.google.com/macros/s/AKfycbybpmlpe6PtFsotY0iQ9CCCiYgsqJ8tyyLFib0pkqd8uyVKazgoyLiybfQZYmvC-xMd/exec';
const CB_SITE_GS = 'https://www.cartridgebond.com';

const GS_GAMES = [
  { keys: ['tears of the kingdom', 'zelda totk'],  title: 'Zelda: TOTK',             price: 43, gsPrice: 24 },
  { keys: ['breath of the wild', 'zelda botw'],    title: 'Zelda: BOTW',             price: 35, gsPrice: 15 },
  { keys: ['mario kart 8'],                        title: 'Mario Kart 8 Deluxe',     price: 38, gsPrice: 18 },
  { keys: ['smash bros ultimate', 'super smash'],  title: 'Smash Bros Ultimate',     price: 38, gsPrice: 14 },
  { keys: ['mario odyssey', 'super mario odyssey'],title: 'Mario Odyssey',           price: 34, gsPrice: 16 },
  { keys: ['mario bros wonder', 'mario wonder'],   title: 'Mario Wonder',            price: 37, gsPrice: 20 },
  { keys: ['animal crossing new horizons'],        title: 'Animal Crossing NH',      price: 38, gsPrice: 14 },
  { keys: ['pokemon scarlet'],                     title: 'Pokemon Scarlet',         price: 36, gsPrice: 16 },
  { keys: ['pokemon violet'],                      title: 'Pokemon Violet',          price: 37, gsPrice: 16 },
  { keys: ['pokemon legends z-a', 'legends z-a'],  title: 'Pokemon Legends: Z-A',    price: 50, gsPrice: 22 },
  { keys: ['splatoon 3'],                          title: 'Splatoon 3',              price: 36, gsPrice: 12 },
  { keys: ["luigi's mansion 3", 'luigis mansion'], title: "Luigi's Mansion 3",       price: 34, gsPrice: 12 },
  { keys: ['kirby forgotten land'],                title: 'Kirby Forgotten Land',    price: 35, gsPrice: 12 },
  { keys: ['metroid dread'],                       title: 'Metroid Dread',           price: 34, gsPrice: 10 },
  { keys: ['metroid prime 4', 'metroid prime beyond'], title: 'Metroid Prime 4: Beyond', price: 48, gsPrice: 20 },
];

function matchGsGame(text) {
  const t = text.toLowerCase();
  for (const g of GS_GAMES) {
    if (g.keys.some(k => t.includes(k))) return g;
  }
  return null;
}

function buildGsCard(game, gsOfferValue) {
  const gsVal = gsOfferValue || game.gsPrice;
  const diff  = game.price - gsVal;
  const pct   = Math.round((diff / gsVal) * 100);
  const sellUrl = `${CB_SITE_GS}/index.html?game=${encodeURIComponent(game.title)}&mode=sell#widget`;

  return `
    <div class="cb-gs-wrap" id="cb-gs-card">
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
            <div style="background:#fff1f2;border-radius:10px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:600;color:#9a9a9a;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">GameStop offers</div>
              <div style="font-size:22px;font-weight:800;color:#6b6b6b;letter-spacing:-.04em;">$${gsVal}</div>
              <div style="font-size:10px;color:#9a9a9a;margin-top:2px;">store credit</div>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:600;color:#16a34a;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">CartridgeBond</div>
              <div style="font-size:22px;font-weight:800;color:#16a34a;letter-spacing:-.04em;">$${game.price}</div>
              <div style="font-size:10px;color:#16a34a;margin-top:2px;">+$${diff} more (+${pct}%)</div>
            </div>
          </div>
        </div>
        <a href="${sellUrl}" target="_blank" rel="noopener" class="cb-cta" style="border-radius:12px;padding:12px 14px;flex-direction:column;gap:2px;align-items:center;min-width:80px;">
          <span class="cb-cta-label" style="font-size:13px;">Sell for $${game.price}</span>
          <span style="font-size:9px;font-weight:600;letter-spacing:.06em;opacity:.8;text-transform:uppercase;">CartridgeBond</span>
        </a>
      </div>
    </div>`;
}

function injectGsCard(game, gsOfferValue) {
  if (document.getElementById('cb-gs-card')) return;

  // Target: trade-in value display area
  const anchor = document.querySelector('.trade-in-value, .tradeInValue, [class*="trade-in-value"], [class*="tradeIn"]') ||
                 document.querySelector('.search-results, .trade-in-container') ||
                 document.querySelector('h1, h2')?.closest('section');

  if (!anchor) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildGsCard(game, gsOfferValue);
  anchor.parentNode.insertBefore(wrapper.firstElementChild, anchor.nextSibling);
}

function parseGsTradeValue() {
  // Try to read what GameStop is offering
  const el = document.querySelector('.trade-value, .trade-in-value, [class*="tradeValue"]');
  if (!el) return null;
  const val = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
  return isNaN(val) ? null : val;
}

function initGs() {
  const text = document.body.textContent;

  // Only run on pages with trade-in context
  const isTradeIn = /trade.in|trade in/i.test(location.href + document.title);
  if (!isTradeIn) return;

  const game = matchGsGame(document.title + ' ' + text.substring(0, 2000));
  if (!game) return;

  const gsVal = parseGsTradeValue();
  injectGsCard(game, gsVal);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGs);
} else {
  initGs();
}

// Watch for dynamic content (GameStop uses React)
const gsObserver = new MutationObserver(() => {
  if (!document.getElementById('cb-gs-card')) initGs();
});
gsObserver.observe(document.body, { childList: true, subtree: true });
