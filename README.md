# CGTrader Visual Search for TurboSquid

A Chrome extension that adds a **"Search on CGTrader"** button to TurboSquid product pages. Clicking it uploads the product's preview image to CGTrader's visual similarity search and opens the results in a new tab — so you can quickly find comparable 3D models on CGTrader without leaving TurboSquid.

Works on both root and localized TurboSquid URLs:
- `https://www.turbosquid.com/3d-models/<slug>`
- `https://www.turbosquid.com/es/3d-models/<slug>` (and any other locale prefix)

---

## How it looks

The button is injected directly below the "Add to Cart" button in the buy box:

```
[ Add to Cart         ]
[ Search on CGTrader  ]   ← injected by this extension
```

---

## Testing locally

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- Git

### 1. Clone the repo

```bash
git clone https://github.com/carrfane/cgtrader-extension.git
cd cgtrader-extension
```

### 2. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the cloned `cgtrader-extension` folder

The extension icon should appear in your toolbar.

### 3. Run through the test checklist

Open a TurboSquid product page and verify each item:

**Basic flow**
- [ ] Open https://www.turbosquid.com/3d-models/3d-male-body-anatomy-skin-1467539
- [ ] "Search on CGTrader" button appears below "Add to Cart"
- [ ] Click the button — it shows a spinner ("Searching…") and disables itself
- [ ] A new tab opens on `https://www.cgtrader.com/3d-models?image_id=<id>` showing visually similar models
- [ ] The original TurboSquid tab stays open; the button returns to its normal state

**Localized URLs**
- [ ] Open https://www.turbosquid.com/es/3d-models/2023-porsche-911-gt3-rs-yellow-2087437
- [ ] The button appears below the translated buy button ("Añadir a la Cesta") and the search works

**Carousel image**
- [ ] Flip the image carousel to a different preview, then click the button
- [ ] The results on CGTrader reflect the image you had selected (not always the first one)

**Error handling**
- [ ] In Chrome DevTools → Network tab, block `www.cgtrader.com`, then click the button
- [ ] An inline error "Something went wrong — try again." appears for a few seconds and the button recovers

**No injection on non-product pages**
- [ ] Open https://www.turbosquid.com/Search/3D-Models/free
- [ ] No button is injected

### 4. Reloading after a code change

If you pull new changes, go back to `chrome://extensions`, find the extension, and click the **reload icon** (circular arrow). You do not need to re-add it.

---

## How it works

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest — URL matching, permissions |
| `content.js` | Injects the button into the TurboSquid buy box |
| `content.css` | Button styles (scoped with `cgt-ext-` prefix) |
| `background.js` | Service worker — fetches CSRF token, downloads the image, POSTs to CGTrader, opens the results tab |

**Search flow:**
1. Content script picks the largest visible product image from `p.turbosquid.com` (falls back to `og:image`)
2. Background worker fetches `cgtrader.com` to get a CSRF token + session cookie
3. Image is uploaded to `POST /api/internal/users/upload_search_image` — works anonymously; if you're logged into CGTrader your session is reused automatically
4. CGTrader returns `{ imageId }` → results tab opens at `/3d-models?image_id=<imageId>`

---

## Contributing

1. Make your changes
2. Reload the extension at `chrome://extensions`
3. Run through the checklist in step 3 above (or the full `TESTING.md`)
4. Open a PR
