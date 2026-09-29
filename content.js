// Develobar content script entry point.
// Injected by background.js after toolbar/toolbar.js and the tool scripts.

(() => {
    if (window.__develobarContentLoaded) return; // guard against double injection
    window.__develobarContentLoaded = true;

    const { Develobar } = window;

    // Toolbar icon / shortcut (via background.js).
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'develobar:toggle') {
            Develobar.toggle();
        }
    });
})();
