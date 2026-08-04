// CartridgeBond — Amazon content script
// Site-specific only: constants, games list, anchor detection, game matching.
// The pill/dropdown/offer-list/age-gate itself lives in pill-engine.js.

const CB_API  = 'https://script.google.com/macros/s/AKfycbybpmlpe6PtFsotY0iQ9CCCiYgsqJ8tyyLFib0pkqd8uyVKazgoyLiybfQZYmvC-xMd/exec';
const CB_SITE = 'https://www.cartridgebond.com';

const CB_GAMES = [
  { keys:['tears of the kingdom','zelda totk'],     title:'Zelda: TOTK',             price:43 , slug:'zelda-tears-of-the-kingdom' },
  { keys:['breath of the wild','zelda botw'],       title:'Zelda: BOTW',             price:35 , slug:'zelda-breath-of-the-wild' },
  { keys:['mario kart 8'],                         title:'Mario Kart 8 Deluxe',     price:38 , slug:'mario-kart-8-deluxe' },
  { keys:['smash bros ultimate','super smash'],     title:'Smash Bros Ultimate',     price:38 , slug:'super-smash-bros-ultimate' },
  { keys:['mario odyssey','super mario odyssey'],   title:'Mario Odyssey',           price:34 , slug:'super-mario-odyssey' },
  { keys:['mario bros wonder','mario wonder'],      title:'Mario Wonder',            price:37 , slug:'super-mario-bros-wonder' },
  { keys:['mario 3d world','bowser'],               title:'Mario 3D World',          price:35 , slug:'super-mario-3d-world-bowsers-fury' },
  { keys:['mario party superstars'],                title:'Mario Party Superstars',  price:33 , slug:'mario-party-superstars' },
  { keys:['mario party jamboree'],                  title:'Mario Party Jamboree',    price:42 , slug:'super-mario-party-jamboree' },
  { keys:['animal crossing'],                       title:'Animal Crossing NH',      price:38 , slug:'animal-crossing-new-horizons' },
  { keys:['pokemon scarlet'],                       title:'Pokemon Scarlet',         price:36 , slug:'pokemon-scarlet' },
  { keys:['pokemon violet'],                        title:'Pokemon Violet',          price:37 , slug:'pokemon-violet' },
  { keys:['pokemon sword'],                         title:'Pokemon Sword',           price:36 , slug:'pokemon-sword' },
  { keys:['pokemon shield'],                        title:'Pokemon Shield',          price:36 , slug:'pokemon-shield' },
  { keys:['pokemon legends arceus'],                title:'Pokemon Legends Arceus',  price:40 , slug:'pokemon-legends-arceus' },
  { keys:['brilliant diamond'],                     title:'Pokemon BD',              price:32 , slug:'pokemon-brilliant-diamond' },
  { keys:['shining pearl'],                         title:'Pokemon SP',              price:32 , slug:'pokemon-shining-pearl' },
  { keys:['pokemon legends z-a', 'legends z-a'],    title:'Pokemon Legends: Z-A',    price:50 , slug:'pokemon-legends-z-a' },
  { keys:['splatoon 3'],                            title:'Splatoon 3',              price:36 , slug:'splatoon-3' },
  { keys:['splatoon 2'],                            title:'Splatoon 2',              price:22 , slug:'splatoon-2' },
  { keys:["luigi's mansion 3",'luigis mansion'],    title:"Luigi's Mansion 3",       price:34, slug:'luigis-mansion-3' },
  { keys:['kirby forgotten land'],                  title:'Kirby Forgotten Land',    price:35 , slug:'kirby-and-the-forgotten-land' },
  { keys:['metroid dread'],                         title:'Metroid Dread',           price:34 , slug:'metroid-dread' },
  { keys:['metroid prime 4', 'metroid prime beyond'], title:'Metroid Prime 4: Beyond', price:48 , slug:'metroid-prime-4-beyond' },
  { keys:['tropical freeze'],                       title:'DKC Tropical Freeze',     price:38 , slug:'donkey-kong-country-tropical-freeze' },
  { keys:['rabbids sparks'],                        title:'Mario + Rabbids Sparks',  price:24 , slug:'mario-rabbids-sparks-of-hope' },
  { keys:['fire emblem engage'],                    title:'Fire Emblem Engage',      price:32 , slug:'fire-emblem-engage' },
  { keys:['minecraft'],                             title:'Minecraft (Switch)',      price:24 , slug:'minecraft-switch' },
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


// ── Init + SPA nav watcher ───────────────────────────────────────────────────
function findAnchor(){
  return document.querySelector('#averageCustomerReviews') ||
         document.querySelector('[data-hook="rating-out-of-text"]')?.closest('.a-section');
}

function init(){
  if(!isProductPage()) return;
  if(!isSwitchGame()) return;
  var title = (document.querySelector('#productTitle')||{}).textContent||'';
  var game  = matchGame(title);
  if(!game) return;
  var anchor = findAnchor();
  if(!anchor) return;
  CBMount(anchor, game);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }

var lastPath = location.pathname;
new MutationObserver(function(){
  if(location.pathname !== lastPath){ lastPath = location.pathname; setTimeout(init, 1000); }
}).observe(document.body, { childList:true, subtree:true });
