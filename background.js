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
    'tools/cookies/cookies.js',
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

// ---- Cookies ----
// Content scripts can't use chrome.cookies, so the Cookies tool asks here. Cookie access is an
// optional host permission the user grants per site (permission/permission.html). Every request is
// limited to cookies the sending page's host receives, whatever else has been granted.

// The page's host (and its subdomains) plus each parent domain, because cookies set on a parent
// (e.g. .example.com) are sent to www.example.com too.
function cookieOrigins(hostname) {
    if (/^[\d.]+$/.test(hostname) || hostname.startsWith('[')) return [`*://${hostname}/*`];
    const labels = hostname.split('.');
    const origins = [`*://*.${hostname}/*`];
    for (let i = 1; i < labels.length - 1; i++) origins.push(`*://${labels.slice(i).join('.')}/*`);
    return origins;
}

function cookieApplies(cookie, hostname) {
    const domain = cookie.domain.replace(/^\./, '');
    return domain === hostname || (!cookie.hostOnly && hostname.endsWith(`.${domain}`));
}

function cookieUrl(cookie) {
    return `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`;
}

// Incognito tabs use their own cookie store.
async function cookieStoreFor(tabId) {
    const stores = await chrome.cookies.getAllCookieStores();
    return stores.find((s) => s.tabIds.includes(tabId))?.id;
}

async function openPermissionWindow(tab, origins) {
    const width = 460;
    const height = 360;
    const params = new URLSearchParams({ tab: tab.id, origins: origins.join(' ') });
    const win = await chrome.windows.get(tab.windowId);
    await chrome.windows.create({
        url: chrome.runtime.getURL(`permission/permission.html?${params}`),
        type: 'popup',
        width,
        height,
        left: Math.max(0, Math.round(win.left + (win.width - width) / 2)),
        top: Math.max(0, win.top + 80),
        focused: true
    });
}

async function handleCookies(msg, sender) {
    const page = new URL(sender.url);
    if (page.protocol !== 'http:' && page.protocol !== 'https:') {
        return { unsupported: true };
    }

    const host = page.hostname;
    const origins = cookieOrigins(host);

    switch (msg.action) {
        case 'status':
            return { host, granted: await chrome.permissions.contains({ origins }) };
        case 'request':
            await openPermissionWindow(sender.tab, origins);
            return {};
        case 'revoke':
            await chrome.permissions.remove({ origins });
            return {};
    }

    const storeId = await cookieStoreFor(sender.tab.id);
    const own = (cookie) => {
        if (!cookieApplies(cookie, host)) throw new Error(`That cookie doesn't belong to ${host}.`);
    };

    if (msg.action === 'list') {
        const all = await chrome.cookies.getAll({ storeId });
        return { cookies: all.filter((c) => cookieApplies(c, host)) };
    }

    if (msg.action === 'set') {
        const { cookie, original } = msg;
        own(cookie);
        if (original) own(original);

        const details = {
            url: cookieUrl(cookie),
            name: cookie.name,
            value: cookie.value,
            path: cookie.path || '/',
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            storeId
        };
        if (!cookie.hostOnly) details.domain = cookie.domain.replace(/^\./, '');
        if (cookie.expirationDate) details.expirationDate = cookie.expirationDate;

        const saved = await chrome.cookies.set(details);
        if (!saved) throw new Error('Chrome rejected the cookie. Check the name, domain, path and Secure/SameSite settings.');

        // Renaming or moving a cookie creates a new one, so remove the old one.
        if (original && (original.name !== saved.name || original.domain !== saved.domain || original.path !== saved.path)) {
            await chrome.cookies.remove({ url: cookieUrl(original), name: original.name, storeId });
        }
        return { cookie: saved };
    }

    if (msg.action === 'remove') {
        for (const cookie of msg.cookies) {
            own(cookie);
            await chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name, storeId });
        }
        return {};
    }

    throw new Error(`Unknown cookie action: ${msg.action}`);
}

// Requests from content scripts that need extension-only APIs.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'develobar:cookies' && sender.tab?.id) {
        handleCookies(msg, sender)
            .then((result) => sendResponse({ ok: true, ...result }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
    }

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
