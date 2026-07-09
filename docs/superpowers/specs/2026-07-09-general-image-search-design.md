# CGTrader Visual Search — General Image Search Design (v0.2.0)

**Date:** 2026-07-09
**Status:** Approved
**Supersedes:** `2026-07-08-turbosquid-cgtrader-visual-search-design.md`

## Purpose

Pivot the extension from TurboSquid-specific to a general image search:
hovering any sufficiently large `<img>` on any website shows a
"Search on CGTrader" button; clicking it uploads that image to CGTrader's
visual similarity search and opens the results in a new tab. A right-click
context menu item on images provides the same action as a robust fallback.

Rationale: team feedback that targeting TurboSquid directly is too extreme;
a general tool is broader and avoids competitor-targeting optics.

## Unchanged (validated in v0.1)

- Background flow: GET `https://www.cgtrader.com/` → parse
  `<meta name="csrf-token">` → download image → multipart POST `file` to
  `/api/internal/users/upload_search_image` with `X-CSRF-Token` +
  `credentials: 'include'` → `{ imageId }` → open
  `https://www.cgtrader.com/3d-models?image_id=<imageId>` in a new tab.
- Works anonymously; reuses the user's CGTrader session if logged in.
- Stale-token retry once on 403/422.
- Message protocol: content → background
  `{ type: 'cgtrader-search', imageUrl }` → `{ ok } | { ok: false, error }`.

## Removed

- TurboSquid buy-box button injection, product-path guard, TurboSquid-specific
  manifest matches and `p.turbosquid.com` host permission.
- `content.css` (styles move into a Shadow DOM inside `content.js`).

## Architecture

```
cgtrader-extension/
├── manifest.json    # v0.2.0: <all_urls>, tabs + contextMenus
├── content.js       # hover overlay (Shadow DOM), all sites
├── background.js    # worker: upload flow + context menu
└── icons/
```

### manifest.json

- `content_scripts`: `matches: ["<all_urls>"]`, `js: ["content.js"]`,
  `run_at: document_idle` (no CSS file).
- `host_permissions`: `["<all_urls>"]` — required to download images from
  arbitrary CDNs in the worker (also covers cgtrader.com).
- `permissions`: `["tabs", "contextMenus"]`.
- Name/description: "CGTrader Visual Search" — no TurboSquid mention.

### content.js — hover overlay

- **Event delegation:** one document-level `mouseover` listener; no
  per-image listeners, no MutationObserver.
- **Eligible image:** `<img>` whose rendered shorter side ≥ 120px, visible,
  and whose `currentSrc || src` scheme is `http(s):` or `data:`. Other
  schemes (`blob:` etc.) are ineligible (button not shown is acceptable;
  if clicked and fetch fails, error state shows).
- **Overlay:** a single reusable button inside a **closed Shadow DOM** host
  appended to `document.documentElement`, `position: fixed`, anchored to the
  hovered image's top-right corner. Shown after a 150 ms hover delay
  (cancelled if the pointer leaves first). Hidden when the pointer leaves
  both the image and the overlay, and on scroll/resize (simplest correct
  positioning).
- **Click:** `preventDefault` + `stopPropagation` (images wrapped in links
  must not navigate). Button shows a spinner state while searching; on
  failure it briefly shows "Something went wrong" then reverts. On success
  the background opens the results tab.
- Not covered (YAGNI): CSS `background-image` elements, `<picture>` sources
  beyond `currentSrc`, images inside iframes (context menu covers those).

### background.js — additions

- `chrome.runtime.onInstalled` → `chrome.contextMenus.create({ id, title:
  'Search image on CGTrader', contexts: ['image'] })`.
- `chrome.contextMenus.onClicked` → `searchOnCgtrader(info.srcUrl)`.
  Works in iframes and on pages where the overlay has blind spots.
- `fetchImageBlob` accepts `data:` URLs (service-worker `fetch` supports
  them natively); keeps the `image/*` content-type check.
- Context-menu errors have no page UI; log to console (worker) only.

## Error handling

| Failure | Behavior |
| --- | --- |
| Image fetch fails (hotlink protection, dead URL) | Button error state (hover) / console log (menu) |
| CSRF fetch fails | Same |
| Upload 403/422 | One token refresh + retry, then error |
| Other non-200 / bad JSON | Error state |

## Known trade-offs

- `<all_urls>` triggers a broad install warning and stricter Web Store
  review. Acceptable for team testing via load-unpacked; revisit before
  public release.
- Hotlink-protected images fail with a clean error; no referer spoofing.

## Testing

Manual via load-unpacked (`TESTING.md`): hover on 3–4 varied sites
(including a TurboSquid product page and a localized one), tiny-image
exclusion, link-wrapped image doesn't navigate, context menu on a normal
image and inside an iframe, error path with cgtrader.com blocked.

Pre-merge automated checks: `node --check`, manifest JSON parse, Playwright
injection of the overlay logic on live pages to verify detection,
positioning and click interception.
