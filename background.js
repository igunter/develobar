// Develobar service worker.

const CONTENT_FILES = [
    'toolbar/toolbar.js',
    'tools/screenshot/region-select.js',
    'tools/screenshot/full-page.js',
    'tools/screenshot/screenshot.js',
    'tools/colour-picker/colour-picker.js',
    'tools/ruler/ruler.js',
    'tools/copy-css/copy-css.js',
    'tools/accessibility/accessibility.js',
    'tools/seo/seo.js',
    'content.js'
];

// Send a message to the tab's content script, injecting it first if the page doesn't have one yet.
async function sendToTab(tabId, message) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
        await chrome.tabs.sendMessage(tabId, message);
    }
}

// Toolbar icon (or Alt+Shift+D) toggles the bar in the active tab.
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    try {
        await sendToTab(tab.id, { type: 'develobar:toggle' });
    } catch (err) {
        // chrome://, Web Store and other restricted pages can't be scripted.
        console.warn('Develobar: cannot run on this page.', err);
    }
});

// ---- Keep the bar open across reloads ----
// Tabs with the bar open are remembered in session storage (the service worker can be stopped
// between events). When one finishes loading again, the bar is put back. activeTab access lasts
// while the tab stays on the same site, so this works for reloads and same-site links; once the
// tab moves to another site Chrome refuses the injection and the tab is forgotten.

const openKey = (tabId) => `open:${tabId}`;

async function setOpen(tabId, open) {
    if (open) await chrome.storage.session.set({ [openKey(tabId)]: true });
    else await chrome.storage.session.remove(openKey(tabId));
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;

    const key = openKey(tabId);
    const stored = await chrome.storage.session.get(key);
    if (!stored[key]) return;

    try {
        await sendToTab(tabId, { type: 'develobar:open' });
    } catch {
        await setOpen(tabId, false); // no longer allowed on this page
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    setOpen(tabId, false);
});

// captureVisibleTab grabs whichever tab is showing, so refuse if the user has switched away
// (e.g. part way through a full page capture).
async function captureTab(tab) {
    const current = await chrome.tabs.get(tab.id);
    if (!current.active) throw new Error('Keep the page tab selected during capture.');
    return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}

// Requests from content scripts that need extension-only APIs.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'develobar:capture') {
        captureTab(sender.tab)
            .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true; // keep the channel open for the async response
    }

    // The bar was opened or closed in a tab.
    if (msg?.type === 'develobar:state' && sender.tab?.id) {
        setOpen(sender.tab.id, !!msg.open);
    }
});
