// CartridgeBond Extension — Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.clear(() => {
      // Open welcome + age verification page on first install
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    });
  }
});

// Block extension popup if age not verified
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get(['cb_age_verified'], (res) => {
    if (!res.cb_age_verified) {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
  });
});

// Clean up detected game cache when navigating away from a product page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.includes('amazon.com/dp/')) {
    chrome.storage.local.remove('cb_detected');
  }
});
