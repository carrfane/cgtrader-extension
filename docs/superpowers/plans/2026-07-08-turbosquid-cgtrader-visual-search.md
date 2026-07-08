# TurboSquid → CGTrader Visual Search Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome MV3 extension that adds a "Search on CGTrader" button to TurboSquid product pages; clicking uploads the product image to CGTrader visual search and opens results in a new tab.

**Architecture:** A content script injects the button into the TurboSquid buy box and picks the current product image URL; a background service worker fetches a CSRF token from cgtrader.com, downloads the image, POSTs it to `/api/internal/users/upload_search_image`, and opens `/3d-models?image_id=<id>`.

**Tech Stack:** Plain JavaScript, Manifest V3, no build step. Spec: `docs/superpowers/specs/2026-07-08-turbosquid-cgtrader-visual-search-design.md`

**Verification model:** No automated test harness (per spec). Each task verifies with `node --check` for syntax, plus targeted real-world checks (curl for the API flow was already validated; Playwright evaluation on the live TurboSquid page for DOM logic). Final end-to-end test is a manual load-unpacked checklist in `TESTING.md`.

---

### Task 1: Manifest and icons

**Files:**
- Create: `manifest.json`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

- [ ] **Step 1: Write manifest.json**

```json
{
  "manifest_version": 3,
  "name": "CGTrader Visual Search for TurboSquid",
  "version": "0.1.0",
  "description": "Adds a 'Search on CGTrader' button to TurboSquid product pages to find visually similar 3D models on CGTrader.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": ["tabs"],
  "host_permissions": [
    "https://www.cgtrader.com/*",
    "https://p.turbosquid.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.turbosquid.com/3d-models/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons with PIL**

Run:
```bash
python3 - <<'EOF'
from PIL import Image, ImageDraw
import os
os.makedirs('icons', exist_ok=True)
for size in (16, 48, 128):
    img = Image.new('RGB', (size, size), (36, 178, 132))  # CGTrader green
    d = ImageDraw.Draw(img)
    # simple white magnifier glyph: circle + handle, scaled
    r = size * 0.28
    cx, cy = size * 0.42, size * 0.42
    w = max(1, size // 12)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255), width=w)
    d.line([cx + r * 0.7, cy + r * 0.7, size * 0.82, size * 0.82], fill=(255, 255, 255), width=w)
    img.save(f'icons/icon{size}.png')
print('icons written')
EOF
```
Expected: `icons written`, three PNG files exist.

- [ ] **Step 3: Validate manifest is parseable JSON**

Run: `python3 -c "import json; json.load(open('manifest.json')); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add manifest.json icons
git commit -m "feat: add MV3 manifest and icons"
```

---

### Task 2: Background service worker

**Files:**
- Create: `background.js`

- [ ] **Step 1: Write background.js**

```javascript
// background.js - service worker
// Handles: CSRF token fetch, image download, upload to CGTrader, open results tab.

const CGTRADER_ORIGIN = 'https://www.cgtrader.com';
const UPLOAD_PATH = '/api/internal/users/upload_search_image';
const LOG_PREFIX = '[cgtrader-ext]';

async function fetchCsrfToken() {
  const response = await fetch(`${CGTRADER_ORIGIN}/`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`CGTrader homepage fetch failed: ${response.status}`);
  }
  const html = await response.text();
  const match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
  if (!match) {
    throw new Error('CSRF token not found in CGTrader homepage');
  }
  return match[1];
}

async function fetchImageBlob(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error(`Unexpected content type: ${blob.type}`);
  }
  return blob;
}

function filenameFromUrl(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const last = pathname.split('/').filter(Boolean).pop();
    if (last && /\.(jpe?g|png|webp|gif)$/i.test(last)) return last;
  } catch (_) {
    // fall through
  }
  return 'search-image.jpg';
}

async function uploadImage(blob, filename, csrfToken) {
  const formData = new FormData();
  formData.append('file', blob, filename);
  return fetch(`${CGTRADER_ORIGIN}${UPLOAD_PATH}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      'X-CSRF-Token': csrfToken,
      'Accept': 'application/json',
    },
  });
}

async function searchOnCgtrader(imageUrl) {
  const blob = await fetchImageBlob(imageUrl);
  const filename = filenameFromUrl(imageUrl);

  let csrfToken = await fetchCsrfToken();
  let response = await uploadImage(blob, filename, csrfToken);

  // Stale token: refresh once and retry.
  if (response.status === 403 || response.status === 422) {
    console.warn(`${LOG_PREFIX} upload got ${response.status}, refreshing token and retrying`);
    csrfToken = await fetchCsrfToken();
    response = await uploadImage(blob, filename, csrfToken);
  }

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data || typeof data.imageId === 'undefined') {
    throw new Error('Upload response missing imageId');
  }

  await chrome.tabs.create({
    url: `${CGTRADER_ORIGIN}/3d-models?image_id=${encodeURIComponent(data.imageId)}`,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'cgtrader-search' && message.imageUrl) {
    searchOnCgtrader(message.imageUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error(`${LOG_PREFIX} search failed:`, error);
        sendResponse({ ok: false, error: String(error && error.message || error) });
      });
    return true; // keep the message channel open for the async response
  }
  return false;
});
```

- [ ] **Step 2: Syntax check**

Run: `node --check background.js`
Expected: no output (exit 0).

- [ ] **Step 3: Verify the token regex against the real homepage**

Run:
```bash
node -e "
fetch('https://www.cgtrader.com/').then(r => r.text()).then(html => {
  const m = html.match(/<meta\s+name=\"csrf-token\"\s+content=\"([^\"]+)\"/);
  console.log(m ? 'TOKEN FOUND: ' + m[1].slice(0, 12) + '...' : 'TOKEN NOT FOUND');
});
"
```
Expected: `TOKEN FOUND: ...`

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "feat: add background worker for CSRF, upload and results tab"
```

---

### Task 3: Content script and styles

**Files:**
- Create: `content.js`
- Create: `content.css`

- [ ] **Step 1: Write content.css**

```css
.cgt-ext-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 10px;
  padding: 12px 16px;
  border: none;
  border-radius: 6px;
  background-color: #24b284;
  color: #ffffff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.cgt-ext-button:hover:not(:disabled) {
  background-color: #1e9770;
}

.cgt-ext-button:disabled {
  opacity: 0.7;
  cursor: default;
}

.cgt-ext-button--floating {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147483647;
  width: auto;
  margin-top: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.cgt-ext-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: cgt-ext-spin 0.8s linear infinite;
}

@keyframes cgt-ext-spin {
  to { transform: rotate(360deg); }
}

.cgt-ext-error {
  margin-top: 6px;
  color: #d93025;
  font-size: 12px;
  font-family: inherit;
}
```

- [ ] **Step 2: Write content.js**

```javascript
// content.js - runs on TurboSquid product pages.
// Injects a "Search on CGTrader" button and delegates the search to the background worker.

(() => {
  const LOG_PREFIX = '[cgtrader-ext]';
  const BUTTON_ID = 'cgt-ext-search-button';
  const FALLBACK_TIMEOUT_MS = 10000;

  function findAddToCartButton() {
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
```

- [ ] **Step 3: Syntax check**

Run: `node --check content.js`
Expected: no output (exit 0).

- [ ] **Step 4: Verify DOM logic against the live TurboSquid page via Playwright**

Using the Playwright MCP, navigate to
`https://www.turbosquid.com/3d-models/3d-male-body-anatomy-skin-1467539` and
evaluate the bodies of `findAddToCartButton` and `findProductImageUrl` (copy
the function code into `browser_evaluate`). Expected:
- Add to Cart button found (returns truthy element info).
- Image URL returned starts with `https://p.turbosquid.com/` and matches the main preview.

- [ ] **Step 5: Commit**

```bash
git add content.js content.css
git commit -m "feat: add content script injecting Search on CGTrader button"
```

---

### Task 4: End-to-end simulation and TESTING.md

**Files:**
- Create: `TESTING.md`

- [ ] **Step 1: Simulate the full flow outside the extension**

Verify the exact background-worker sequence works with the real image URL
found in Task 3 Step 4 (already validated once with curl during design;
re-run to confirm with the final URL):

```bash
cd /var/folders/b7/y1pbdh913z3d83b2tkqzq8s00000gn/T/opencode
curl -s -c e2e_cookies.txt -A "Mozilla/5.0" https://www.cgtrader.com/ -o e2e_home.html
TOKEN=$(rg -o 'name="csrf-token" content="([^"]+)"' -r '$1' e2e_home.html | head -1)
curl -s -A "Mozilla/5.0" "<IMAGE_URL_FROM_TASK_3>" -o e2e_image.jpg
curl -s -b e2e_cookies.txt -A "Mozilla/5.0" \
  -H "X-CSRF-Token: $TOKEN" -H "Accept: application/json" \
  -F "file=@e2e_image.jpg;type=image/jpeg" \
  -w "\nHTTP %{http_code}\n" \
  https://www.cgtrader.com/api/internal/users/upload_search_image
```
Expected: `{"imageId":<number>}` and `HTTP 200`. Optionally open
`https://www.cgtrader.com/3d-models?image_id=<number>` in Playwright to
confirm results render.

- [ ] **Step 2: Write TESTING.md**

```markdown
# Manual Testing Checklist

Load the extension: `chrome://extensions` → enable Developer mode →
"Load unpacked" → select this folder.

1. Open https://www.turbosquid.com/3d-models/3d-male-body-anatomy-skin-1467539
   - [ ] "Search on CGTrader" button appears below "Add to Cart".
2. Click the button.
   - [ ] Button shows a spinner ("Searching…") and is disabled.
   - [ ] A new tab opens on https://www.cgtrader.com/3d-models?image_id=<id>
         showing visually similar models.
   - [ ] Original TurboSquid tab stays open; button returns to normal.
3. Repeat on 2-3 other product pages from different categories.
   - [ ] Button appears and search works on each.
4. Flip the image carousel to a different preview, then click the button.
   - [ ] The search uses the currently displayed image (results reflect it).
5. Disconnect network (or block cgtrader.com via DevTools), click the button.
   - [ ] Inline error "Something went wrong — try again." appears and fades.
   - [ ] Button recovers to a clickable state.
6. Open a non-product TurboSquid page (e.g. https://www.turbosquid.com/Search/3D-Models/free).
   - [ ] No button is injected (content script only matches /3d-models/*).
7. While logged in to cgtrader.com, repeat step 2.
   - [ ] Works the same (session reused).
```

- [ ] **Step 3: Commit**

```bash
git add TESTING.md
git commit -m "docs: add manual testing checklist"
```

---

### Task 5: Final review and manual verification handoff

- [ ] **Step 1: Verify repo state**

Run: `git status --short` (expect clean) and `git log --oneline` (expect the
commits from Tasks 1-4 plus the spec/plan commits).

- [ ] **Step 2: Confirm file inventory matches the spec**

Expected files: `manifest.json`, `background.js`, `content.js`,
`content.css`, `icons/icon{16,48,128}.png`, `TESTING.md`, docs.

- [ ] **Step 3: Hand off to the user for load-unpacked manual test**

The extension cannot be fully exercised without loading it into the user's
Chrome. Tell the user to follow `TESTING.md` and report any failures.
