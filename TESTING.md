# Manual Testing Checklist

Load the extension: `chrome://extensions` → enable Developer mode →
"Load unpacked" → select this folder. If updating, click the reload icon.

## Hover overlay

1. Open any page with large images (e.g. https://en.wikipedia.org/wiki/Porsche_911_GT3).
   - [ ] Hovering a large image (≥120px) shows a green "Search on CGTrader"
         button in the image's top-right corner after a short delay.
   - [ ] Hovering small images/icons/logos shows nothing.
2. Click the "Search on CGTrader" button.
   - [ ] Button shows a spinner ("Searching…").
   - [ ] A new tab opens on https://www.cgtrader.com/3d-models?image_id=<id>
         with visually similar models.
   - [ ] The original page stays open; if the image was a link, clicking the
         button did NOT navigate.
3. Try several different sites (a news site, a shop, an image gallery).
   - [ ] The overlay appears and search works across sites.
4. Try a TurboSquid product page (both work the same as any other site):
   - https://www.turbosquid.com/3d-models/2023-porsche-911-gt3-rs-yellow-2087437
   - https://www.turbosquid.com/es/3d-models/2023-porsche-911-gt3-rs-yellow-2087437
   - [ ] Hovering the preview image shows the button and search works.

## Right-click context menu

5. Right-click any image on any page.
   - [ ] A "Search image on CGTrader" menu item appears.
   - [ ] Clicking it opens a new tab with CGTrader results for that image.
6. Right-click an image inside an embedded iframe (e.g. an embedded image widget).
   - [ ] The context menu item still works (this is where the menu beats the
         hover overlay).

## CGTrader is excluded

7. Open any CGTrader page (e.g. https://www.cgtrader.com/3d-models).
   - [ ] Hovering images shows NO overlay button.
   - [ ] Right-clicking an image shows NO "Search image on CGTrader" menu item.

## Error handling

8. On a non-CGTrader page, in DevTools → Network block `www.cgtrader.com`,
   then click the hover button.
   - [ ] The button briefly turns red with "Something went wrong", then reverts.

## Session reuse

8. While logged in to cgtrader.com, repeat step 2.
   - [ ] Works the same (your session is reused automatically).
