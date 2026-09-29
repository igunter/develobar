// Develobar service worker.

const CONTENT_FILES = [
    'toolbar/toolbar.js',
    'tools/screenshot/region-select.js',
    'tools/screenshot/full-page.js',
    'tools/screenshot/screenshot.js',
    'tools/colour-picker/colour-picker.js',
    'tools/ruler/ruler.js',
    'tools/copy-css/copy-css.js',
    'content.js'
];

// Toolbar icon (or Alt+Shift+D) toggles the bar in the active tab.
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'develobar:toggle' });
    } catch {
        // First use on this page (activeTab only lets us inject on click), so it has no content script yet.
        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
            await chrome.tabs.sendMessage(tab.id, { type: 'develobar:toggle' });
        } catch (err) {
            // chrome://, Web Store and other restricted pages can't be scripted.
            console.warn('Develobar: cannot run on this page.', err);
        }
    }
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
});
