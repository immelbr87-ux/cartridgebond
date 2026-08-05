// CartridgeBond — welcome/age-gate page logic
// Extracted from an inline <script> block in welcome.html. Manifest V3
// extension pages can never use 'unsafe-inline' (Chrome Web Store forbids
// it outright, not just a default setting) - so an inline script, and any
// inline onclick=/onchange= attributes, silently never execute at all once
// this is loaded as a real packaged/unpacked extension. Everything has to
// live in an external file and be wired with addEventListener instead.

function toggleAge(cb) {
  var label = document.getElementById('age-label');
  var btn   = document.getElementById('cta-btn');
  if (cb.checked) {
    label.classList.add('checked');
    btn.disabled = false;
    btn.classList.add('ready');
  } else {
    label.classList.remove('checked');
    btn.disabled = true;
    btn.classList.remove('ready');
  }
}

function activate() {
  // Store age verification so we never show this again
  chrome.storage.local.set({
    cb_age_verified: true,
    cb_tos_accepted: true,
    cb_install_date: new Date().toISOString()
  }, function() {
    // Navigate to Amazon to try it out
    window.location.href = 'https://www.amazon.com/s?k=nintendo+switch+games';
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var checkbox = document.getElementById('age-cb');
  var ctaBtn = document.getElementById('cta-btn');
  if (checkbox) checkbox.addEventListener('change', function() { toggleAge(this); });
  if (ctaBtn) ctaBtn.addEventListener('click', activate);

  // If already verified, skip straight to Amazon
  chrome.storage.local.get(['cb_age_verified'], function(res) {
    if (res.cb_age_verified) {
      window.location.href = 'https://www.amazon.com/s?k=nintendo+switch+games';
    }
  });
});
