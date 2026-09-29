// Develobar content script entry point.
// Runs after toolbar/toolbar.js and the tool scripts (see manifest.json).

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

    // Open state is shared: opening or closing in one tab applies to all of them.
    chrome.storage.onChanged.addListener((changes, area) => {
        const change = changes[Develobar.STORAGE_KEY];
        if (area !== 'local' || !change) return;
        change.newValue ? Develobar.mount() : Develobar.unmount();
    });

    // Re-open automatically if the bar was open last time.
    Develobar.isOpen().then((open) => {
        if (open) Develobar.mount();
    });
})();
