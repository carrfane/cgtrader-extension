// content.js - runs on TurboSquid product pages.
// Injects a "Search on CGTrader" button and delegates the search to the background worker.

(() => {
  const LOG_PREFIX = '[cgtrader-ext]';
  const BUTTON_ID = 'cgt-ext-search-button';
  const FALLBACK_TIMEOUT_MS = 10000;

  // Product pages live at /3d-models/<slug> or /<locale>/3d-models/<slug>
  // (e.g. /es/3d-models/..., /zh-cn/3d-models/...). The manifest match
  // pattern is broader than this, so guard here.
  const PRODUCT_PATH_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?3d-models\/.+/i;
  if (!PRODUCT_PATH_RE.test(window.location.pathname)) return;

  function findAddToCartButton() {
    // Locale-independent: the buy-box button carries a stable test id
    // regardless of UI language (e.g. "Añadir a la Cesta" on /es/ pages).
    const byTestId = document.querySelector('button[data-testid="add-cart-button"]');
    if (byTestId) return byTestId;

    // Fallback: English text match.
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      if (/add to cart/i.test(button.textContent || '')) return button;
    }
    return null;
  }

  function findProductImageUrl() {
    // Prefer the currently displayed carousel image: largest visible <img>
    // hosted on p.turbosquid.com.
    let best = null;
    let bestArea = 0;
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!src.startsWith('https://p.turbosquid.com/')) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // not visible
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = src;
      }
    }
    if (best) return best;

    const og = document.querySelector('meta[property="og:image"]');
    return og && og.content ? og.content : null;
  }

  function setLoading(button, isLoading) {
    button.disabled = isLoading;
    button.innerHTML = '';
    if (isLoading) {
      const spinner = document.createElement('span');
      spinner.className = 'cgt-ext-spinner';
      button.appendChild(spinner);
      button.appendChild(document.createTextNode('Searching\u2026'));
    } else {
      button.appendChild(document.createTextNode('Search on CGTrader'));
    }
  }

  function showError(button, text) {
    const existing = button.parentElement.querySelector('.cgt-ext-error');
    if (existing) existing.remove();
    const error = document.createElement('div');
    error.className = 'cgt-ext-error';
    error.textContent = text;
    button.insertAdjacentElement('afterend', error);
    setTimeout(() => error.remove(), 5000);
  }

  async function handleClick(event) {
    const button = event.currentTarget;
    const imageUrl = findProductImageUrl();
    if (!imageUrl) {
      showError(button, 'No product image found on this page.');
      return;
    }

    setLoading(button, true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'cgtrader-search',
        imageUrl,
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : 'No response');
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} search failed:`, error);
      showError(button, 'Something went wrong \u2014 try again.');
    } finally {
      setLoading(button, false);
    }
  }

  function createButton(floating) {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'cgt-ext-button' + (floating ? ' cgt-ext-button--floating' : '');
    button.textContent = 'Search on CGTrader';
    button.addEventListener('click', handleClick);
    return button;
  }

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return true;
    const anchor = findAddToCartButton();
    if (!anchor) return false;
    anchor.insertAdjacentElement('afterend', createButton(false));
    return true;
  }

  function injectFloatingFallback() {
    if (document.getElementById(BUTTON_ID)) return;
    document.body.appendChild(createButton(true));
    console.warn(`${LOG_PREFIX} buy box not found, using floating button`);
  }

  function start() {
    if (injectButton()) return;

    const observer = new MutationObserver(() => {
      if (injectButton()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      injectFloatingFallback();
    }, FALLBACK_TIMEOUT_MS);
  }

  start();
})();
