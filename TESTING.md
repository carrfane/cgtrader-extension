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
3b. Open a localized product URL, e.g.
    https://www.turbosquid.com/es/3d-models/2023-porsche-911-gt3-rs-yellow-2087437
   - [ ] Button appears below the translated buy button ("Añadir a la Cesta")
         and search works.
4. Flip the image carousel to a different preview, then click the button.
   - [ ] The search uses the currently displayed image (results reflect it).
5. Disconnect network (or block cgtrader.com via DevTools), click the button.
   - [ ] Inline error "Something went wrong — try again." appears and fades.
   - [ ] Button recovers to a clickable state.
6. Open a non-product TurboSquid page (e.g. https://www.turbosquid.com/Search/3D-Models/free).
   - [ ] No button is injected (content script only matches /3d-models/*).
7. While logged in to cgtrader.com, repeat step 2.
   - [ ] Works the same (session reused).
