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

// --- Right-click context menu on images (covers iframes and overlay blind spots) ---

const MENU_ID = 'cgtrader-image-search';

function isCgtraderUrl(url) {
  try {
    return /(^|\.)cgtrader\.com$/i.test(new URL(url).hostname);
  } catch (_) {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Search image on CGTrader',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  // No point searching CGTrader from a CGTrader page.
  if (isCgtraderUrl(info.pageUrl)) return;
  searchOnCgtrader(info.srcUrl).catch((error) => {
    console.error(`${LOG_PREFIX} context menu search failed:`, error);
  });
});
