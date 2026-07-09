# CGTrader Visual Search

A Chrome extension that lets you search for visually similar 3D models on CGTrader from **any image on the web**.

- **Hover** any reasonably large image → a green **"Search on CGTrader"** button appears in its corner.
- Or **right-click** any image → **"Search image on CGTrader"**.

Either way, the image is sent to CGTrader's visual similarity search and the results open in a new tab. Works anonymously; if you're logged in to CGTrader, your session is reused automatically.

---

## Why

A general, site-agnostic way to find comparable models on CGTrader starting from any reference image you come across online — a product photo, a render, a screenshot on a blog, etc.

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
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the cloned `cgtrader-extension` folder

The extension icon appears in your toolbar.

> **Permissions note:** the extension requests access to all sites so it can
> read image URLs and download images from any CDN. Chrome will show a
> "Read and change all your data on all websites" warning on install — this
> is expected for a general image-search tool.

### 3. Try it

- **Hover** a large image on any page (e.g. https://en.wikipedia.org/wiki/Porsche_911_GT3)
  and click the **Search on CGTrader** button.
- Or **right-click** any image and choose **Search image on CGTrader**.

A new tab opens with visually similar CGTrader models.

Full verification steps are in [`TESTING.md`](./TESTING.md).

### 4. Reloading after a code change

Go to `chrome://extensions` and click the **reload icon** on the extension card. No need to re-add it.

---

## How it works

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest — runs on all sites, `tabs` + `contextMenus` permissions |
| `content.js` | Delegated hover listener + a Shadow-DOM overlay button on large images |
| `background.js` | Service worker — context menu, CSRF token, image download, upload, opens the results tab |

**Search flow:**
1. Content script (hover) or context menu picks an image URL
2. Background worker fetches `cgtrader.com` to get a CSRF token + session cookie
3. Image is uploaded to `POST /api/internal/users/upload_search_image`
4. CGTrader returns `{ imageId }` → results tab opens at `/3d-models?image_id=<imageId>`

The hover overlay lives in a **closed Shadow DOM** so page styles can't affect it, uses a single delegated `mouseover` listener (cheap on image-heavy pages), and ignores images smaller than 120px. Clicking never triggers link navigation.

---

## Building a distributable zip

The zip is not committed. Regenerate it any time with:

```bash
zip -r cgtrader-extension.zip manifest.json background.js content.js icons
```

Use the zip for Chrome Web Store submission, or just **Load unpacked** the folder for local testing.

---

## Contributing

1. Make your changes
2. Reload the extension at `chrome://extensions`
3. Run through [`TESTING.md`](./TESTING.md)
4. Open a PR
