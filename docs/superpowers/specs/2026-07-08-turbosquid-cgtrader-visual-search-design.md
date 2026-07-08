# TurboSquid → CGTrader Visual Search — Chrome Extension Design

**Date:** 2026-07-08
**Status:** Approved

## Purpose

A Chrome extension (Manifest V3) that injects a "Search on CGTrader" button
into TurboSquid product pages. Clicking it takes the product's main preview
image, uploads it to CGTrader's visual similarity search, and opens the
results in a new tab.

## Validated facts (tested 2026-07-08)

- `POST https://www.cgtrader.com/api/internal/users/upload_search_image`
  - Multipart form, field name `file` (image bytes).
  - Requires `X-CSRF-Token` header matching the Rails session cookie.
  - Does **not** require login (`skip_before_action :authorize_user`).
  - Response: `{"imageId": <int>}` (HTTP 200).
  - Verified end-to-end with curl from a fresh anonymous session.
- Results page: `https://www.cgtrader.com/3d-models?image_id=<imageId>`
  (matches CGTrader's own `useImageSearch.js` frontend hook).
- CSRF token is available in `<meta name="csrf-token" content="...">` on any
  CGTrader HTML page; fetching `https://www.cgtrader.com/` anonymously sets a
  session cookie and returns a matching token.
- TurboSquid product pages (`https://www.turbosquid.com/3d-models/*`):
  - Serve product images from `https://p.turbosquid.com/`.
  - Expose the main preview via `<meta property="og:image">` and as the
    largest `img` in the carousel (`img.m-auto.h-full.object-contain` today,
    but classes are Tailwind utilities — not stable).
  - No stable element IDs; the buy box contains an "Add to Cart" button.
  - TurboSquid uses DataDome bot protection: server-side scraping fails, but
    everything works in the user's real browser session, which is where the
    content script runs.

## Architecture

Plain JavaScript, Manifest V3, no build step.

```
cgtrader-extension/
├── manifest.json
├── content.js      # runs on TurboSquid product pages
├── content.css     # button styles
├── background.js   # service worker: CSRF, image fetch, upload, open tab
└── icons/          # 16/48/128 px extension icons
```

### manifest.json

- `manifest_version: 3`
- `content_scripts`: `matches: ["https://www.turbosquid.com/3d-models/*"]`,
  injecting `content.js` + `content.css` at `document_idle`.
- `background.service_worker: background.js`
- `host_permissions`: `https://www.cgtrader.com/*`, `https://p.turbosquid.com/*`
- `permissions`: `["tabs"]`

### content.js (TurboSquid page)

Responsibilities: button injection, image URL selection, UX states.

- **Injection:** find the buy box by locating the "Add to Cart" button via
  text match; insert the "Search on CGTrader" button after it. Use a
  `MutationObserver` (with a re-injection guard) because the page is a
  client-rendered SPA and may re-render. Fallback if no anchor is found
  within a timeout: fixed-position floating button at the bottom-right of
  the viewport.
- **Image selection:** on click, choose the currently displayed carousel
  image = the largest visible `<img>` whose `src` is on `p.turbosquid.com`;
  fallback to `og:image` meta content.
- **Flow:** disable button + show "Searching…" spinner state →
  `chrome.runtime.sendMessage({ type: 'cgtrader-search', imageUrl })` →
  on `{ ok: true }` restore button; on `{ ok: false, error }` restore button
  and show a small inline "Something went wrong — try again" message for a
  few seconds.
- **Styling:** self-contained CSS with a distinctive class prefix
  (`cgt-ext-`) to avoid colliding with page styles. CGTrader brand color.

### background.js (service worker)

Message handler for `cgtrader-search`:

1. **Get CSRF token:** `fetch('https://www.cgtrader.com/', { credentials: 'include' })`,
   regex out `<meta name="csrf-token" content="(...)">`. The session cookie
   set by this response (or the user's existing CGTrader session) lives in
   the browser cookie jar and is sent with the upload.
2. **Fetch image:** `fetch(imageUrl)` → `Blob`. Host permission for
   `p.turbosquid.com` bypasses CORS.
3. **Upload:** `POST /api/internal/users/upload_search_image` with
   `FormData` (`file` = blob, filename derived from URL), header
   `X-CSRF-Token`, `credentials: 'include'`. Parse `imageId` from JSON.
4. **Open results:** `chrome.tabs.create({ url:
   'https://www.cgtrader.com/3d-models?image_id=' + imageId })` — new tab so
   the TurboSquid page stays open for comparison.
5. Respond `{ ok: true }` / `{ ok: false, error }` to the content script.

**Retry:** if the upload returns 403/422 (stale token), re-fetch the
homepage once for a fresh token and retry the upload once.

## Error handling

| Failure | Behavior |
| --- | --- |
| No product image found on page | Inline error message, button restored |
| CGTrader homepage/token fetch fails | Inline error, button restored |
| Image download fails | Inline error, button restored |
| Upload 403/422 | One token refresh + retry, then inline error |
| Upload other non-200 / bad JSON | Inline error, button restored |

All errors are logged to the console with a `[cgtrader-ext]` prefix.

## Testing

Manual, via `chrome://extensions` load-unpacked:

1. Open `https://www.turbosquid.com/3d-models/3d-male-body-anatomy-skin-1467539`
   → button appears next to "Add to Cart".
2. Click → spinner → new tab opens on CGTrader results with visually
   similar models.
3. Repeat on 2–3 other product pages (different categories).
4. Flip the carousel to another preview, click → search uses that image.
5. Kill network → click → inline error appears, button recovers.
6. Verify no button injection on non-product TurboSquid pages.

A `TESTING.md` checklist captures these steps. No automated test harness.

## Out of scope

- Other marketplaces (Sketchfab, Fab, etc.)
- Options/settings page, popup UI
- Chrome Web Store packaging/publishing
- Same-tab navigation (results open in a new tab)
