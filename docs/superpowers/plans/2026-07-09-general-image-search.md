# General Image Search Implementation Plan (v0.2.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the extension to a general image search: hover any large `<img>` on any site → "Search on CGTrader" button; plus a right-click context menu on images.

**Architecture:** Content script on `<all_urls>` with a delegated hover listener and a Shadow-DOM overlay button; background worker unchanged upload flow plus a `contextMenus` handler. TurboSquid-specific code removed.

**Tech Stack:** Plain JavaScript, Manifest V3, no build step. Spec: `docs/superpowers/specs/2026-07-09-general-image-search-design.md`

**Verification model:** `node --check` + manifest JSON parse per task; Playwright live-page checks for the overlay logic; one live e2e upload with a non-TurboSquid image; manual `TESTING.md` for extension-context behavior (context menu, real clicks).

---

### Task 1: Manifest v0.2.0

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Replace manifest contents**

```json
{
  "manifest_version": 3,
  "name": "CGTrader Visual Search",
  "version": "0.2.0",
  "description": "Hover any image on the web and search for visually similar 3D models on CGTrader.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": ["tabs", "contextMenus"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `python3 -c "import json; json.load(open('manifest.json')); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: broaden manifest to all sites with context menu permission"
```

---

### Task 2: Rewrite content.js, delete content.css

**Files:**
- Modify: `content.js` (full rewrite)
- Delete: `content.css`

- [ ] **Step 1: Write content.js**

```javascript
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
```

- [ ] **Step 2: Delete content.css**

Run: `git rm content.css`

- [ ] **Step 3: Syntax check**

Run: `node --check content.js`
Expected: exit 0.

- [ ] **Step 4: Verify overlay logic on live pages via Playwright**

Navigate to a Wikipedia article with a large lead image and to
`https://www.turbosquid.com/3d-models/2023-porsche-911-gt3-rs-yellow-2087437`.
On each, evaluate the eligibility + positioning logic against the largest
image and confirm:
- lead/product image is eligible; a 16px icon is not
- computed overlay position sits inside the image's top-right corner

- [ ] **Step 5: Commit**

```bash
git add content.js
git commit -m "feat: replace site-specific button with generic hover overlay"
```

---

### Task 3: Background worker — context menu + data: URLs

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add context menu registration and handler**

Append after the existing `chrome.runtime.onMessage` listener:

```javascript
const MENU_ID = 'cgtrader-image-search';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Search image on CGTrader',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.srcUrl) {
    searchOnCgtrader(info.srcUrl).catch((error) => {
      console.error(`${LOG_PREFIX} context menu search failed:`, error);
    });
  }
});
```

No change needed in `fetchImageBlob` for `data:` URLs — service-worker
`fetch` handles them natively and the `image/*` blob-type check still
applies. Confirm `filenameFromUrl` doesn't throw on `data:` URLs (the
`try/catch` + fallback already covers it).

- [ ] **Step 2: Syntax check**

Run: `node --check background.js`
Expected: exit 0.

- [ ] **Step 3: Live e2e re-validation with a non-TurboSquid image**

Re-run the curl simulation (token → download a Wikipedia/Wikimedia image →
upload) and expect `{"imageId":<n>}` HTTP 200.

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "feat: add image context menu search"
```

---

### Task 4: Docs and packaging

**Files:**
- Modify: `README.md`, `TESTING.md`
- Regenerate: `cgtrader-extension.zip` (untracked)

- [ ] **Step 1: Rewrite TESTING.md** (general checklist: hover on varied
  sites incl. TurboSquid root + localized URLs, tiny-image exclusion,
  link-wrapped image doesn't navigate, context menu incl. iframe, error
  path, logged-in session reuse)

- [ ] **Step 2: Rewrite README.md** (general pitch, hover + context menu
  usage, load-unpacked instructions, architecture table, permissions note)

- [ ] **Step 3: Commit**

```bash
git add README.md TESTING.md
git commit -m "docs: update README and testing checklist for general image search"
```

- [ ] **Step 4: Rebuild zip**

```bash
rm -f cgtrader-extension.zip
zip -r cgtrader-extension.zip manifest.json background.js content.js icons -x "*.DS_Store"
```

---

### Task 5: Finish

- [ ] Merge feature branch to `main`, push to origin, verify clean tree.
- [ ] Hand off: teammates reload the extension and follow `TESTING.md`
  (context menu and real-click behavior can only be verified in-extension).
