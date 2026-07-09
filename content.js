// content.js - runs on all pages.
// Shows a "Search on CGTrader" overlay button when hovering large images.

(() => {
  const LOG_PREFIX = '[cgtrader-ext]';
  const MIN_IMAGE_SIZE = 120; // px, rendered shorter side
  const HOVER_DELAY_MS = 150;
  const ERROR_REVERT_MS = 3000;

  const STATE = {
    currentImg: null,
    hoverTimer: null,
    searching: false,
  };

  // --- Overlay (single reusable button in a closed shadow root) ---

  const host = document.createElement('div');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; display: none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      button {
        all: initial;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 6px;
        background-color: #24b284;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        white-space: nowrap;
      }
      button:hover { background-color: #1e9770; }
      button.error { background-color: #d93025; cursor: default; }
      .spinner {
        width: 11px;
        height: 11px;
        border: 2px solid rgba(255, 255, 255, 0.4);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <button type="button">Search on CGTrader</button>
  `;
  const button = shadow.querySelector('button');

  function setButtonLabel(html) {
    button.innerHTML = html;
  }

  function showOverlayFor(img) {
    const rect = img.getBoundingClientRect();
    host.style.display = 'block';
    // Measure after display so offsetWidth is real.
    const top = Math.max(rect.top + 8, 8);
    const right = Math.min(rect.right - 8, window.innerWidth - 8);
    host.style.top = `${top}px`;
    host.style.left = `${Math.max(right - host.offsetWidth, 8)}px`;
  }

  function hideOverlay() {
    if (STATE.searching) return; // keep visible while a search runs
    host.style.display = 'none';
    STATE.currentImg = null;
  }

  // --- Image eligibility ---

  function imageUrlOf(img) {
    return img.currentSrc || img.src || '';
  }

  function isEligible(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    const url = imageUrlOf(img);
    if (!/^(https?:|data:)/i.test(url)) return false;
    const rect = img.getBoundingClientRect();
    if (Math.min(rect.width, rect.height) < MIN_IMAGE_SIZE) return false;
    const style = window.getComputedStyle(img);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
  }

  // --- Hover wiring (delegated) ---

  document.addEventListener('mouseover', (event) => {
    const target = event.target;

    // Moving onto the overlay itself: keep it visible.
    if (target === host) return;

    clearTimeout(STATE.hoverTimer);

    if (target instanceof HTMLImageElement && isEligible(target)) {
      STATE.hoverTimer = setTimeout(() => {
        if (STATE.searching) return;
        STATE.currentImg = target;
        setButtonLabel('Search on CGTrader');
        button.classList.remove('error');
        showOverlayFor(target);
      }, HOVER_DELAY_MS);
    } else if (!STATE.searching) {
      hideOverlay();
    }
  }, true);

  window.addEventListener('scroll', hideOverlay, true);
  window.addEventListener('resize', hideOverlay);

  // --- Search ---

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (STATE.searching || !STATE.currentImg) return;

    const imageUrl = imageUrlOf(STATE.currentImg);
    STATE.searching = true;
    setButtonLabel('<span class="spinner"></span>Searching\u2026');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'cgtrader-search',
        imageUrl,
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : 'No response');
      }
      STATE.searching = false;
      hideOverlay();
    } catch (error) {
      console.error(`${LOG_PREFIX} search failed:`, error);
      STATE.searching = false;
      button.classList.add('error');
      setButtonLabel('Something went wrong');
      setTimeout(() => {
        button.classList.remove('error');
        setButtonLabel('Search on CGTrader');
        hideOverlay();
      }, ERROR_REVERT_MS);
    }
  });

  function attach() {
    (document.body || document.documentElement).appendChild(host);
  }

  if (document.body) {
    attach();
  } else {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  }
})();
