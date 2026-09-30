// Opened by background.js when the Cookies tool needs site access. chrome.permissions.request
// needs a click inside an extension page, which the toolbar (running in the web page) can't give.

const params = new URLSearchParams(location.search);
const tabId = Number(params.get('tab'));
const origins = (params.get('origins') || '').split(' ').filter(Boolean);

// "*://*.www.example.com/*" -> "www.example.com and its subdomains", "*://example.com/*" -> "example.com"
const list = document.getElementById('sites');
origins.forEach((origin) => {
    const host = origin.replace(/^\*:\/\//, '').replace(/\/\*$/, '');
    const item = document.createElement('li');
    item.textContent = host.replace(/^\*\./, '');
    if (host.startsWith('*.')) {
        const extra = document.createElement('span');
        extra.textContent = ' and its subdomains';
        item.append(extra);
    }
    list.append(item);
});

document.getElementById('cancel').addEventListener('click', () => window.close());

document.getElementById('allow').addEventListener('click', async () => {
    const error = document.getElementById('error');
    error.hidden = true;

    let granted = false;
    try {
        granted = await chrome.permissions.request({ origins });
    } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        return;
    }

    if (!granted) {
        error.textContent = 'Access wasn\'t granted, so the Cookies tool can\'t show this site\'s cookies.';
        error.hidden = false;
        return;
    }

    // Tell the page's Cookies panel to load, then go back to it.
    await chrome.tabs.sendMessage(tabId, { type: 'develobar:cookies-granted' }).catch(() => {});
    window.close();
});
