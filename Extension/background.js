// CartridgeBond Extension - Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.clear(() => {
      // Open welcome + age verification page on first install
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    });
  }
});

// NOTE: age verification is enforced in content.js (injectAgeGatePill), not
// here. A previous version tried to gate the toolbar popup via
// chrome.action.onClicked, but that listener never fires when the manifest
// sets "action.default_popup" (Chrome routes straight to the popup instead) -
// so it was silent dead code. The popup itself only ever displays data from
// chrome.storage.local's cb_detected key, which content.js only writes after
// age is verified, so the popup is protected indirectly through that.

// Clean up detected game cache when navigating away from a product page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !isSupportedProductUrl(changeInfo.url)) {
    chrome.storage.local.remove('cb_detected');
  }
});

function isSupportedProductUrl(url) {
  return url.includes('amazon.com/dp/') ||
         url.includes('bestbuy.com/site/') ||
         url.includes('target.com/p/') ||
         url.includes('walmart.com/ip/') ||
         url.includes('gamestop.com/');
}
