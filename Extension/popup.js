// CartridgeBond Extension Popup
const CB_SITE = 'https://www.cartridgebond.com';

chrome.storage.local.get(['cb_detected'], ({ cb_detected }) => {
  const detected = document.getElementById('detected-game');
  const noGame   = document.getElementById('no-game');

  if (cb_detected && cb_detected.game) {
    noGame.style.display   = 'none';
    detected.style.display = 'block';

    const { game, price, buyers, sellers } = cb_detected;
    const encodedGame = encodeURIComponent(game);

    document.getElementById('popup-game-name').textContent = game;
    document.getElementById('popup-price').textContent     = `$${price}`;
    document.getElementById('popup-buyers').textContent    = buyers  || '0';
    document.getElementById('popup-sellers').textContent   = sellers || '0';

    document.getElementById('popup-sell-btn').href =
      `${CB_SITE}/index.html?game=${encodedGame}&mode=sell#widget`;
    document.getElementById('popup-buy-btn').href =
      `${CB_SITE}/index.html?game=${encodedGame}&mode=buy#widget`;

    // Color zero states
    if (!buyers)  document.getElementById('popup-buyers').style.color  = '#9a9a9a';
    if (!sellers) document.getElementById('popup-sellers').style.color = '#9a9a9a';
  } else {
    noGame.style.display   = 'block';
    detected.style.display = 'none';
  }
});
