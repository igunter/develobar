// Cookies tool. Opens a modal listing every cookie the current page receives (any path, including
// HttpOnly ones), with search, add, edit, delete and export as JSON or a Netscape cookies.txt file.
// Content scripts can't see HttpOnly cookies or cookie attributes, so reads and writes go through
// background.js (chrome.cookies). That needs site access, which the user grants once per site in
// permission/permission.html. Nothing leaves the browser.

(() => {
    const { Develobar } = window;

    const SAME_SITE = [
        { value: 'unspecified', label: 'Not set' },
        { value: 'lax', label: 'Lax' },
        { value: 'strict', label: 'Strict' },
        { value: 'no_restriction', label: 'None' }
    ];

    const CSS = `
        :host { all: initial; }

        * { box-sizing: border-box; }

        .backdrop {
            position: fixed;
            inset: ${Develobar.BAR_HEIGHT}px 0 0 0;
            z-index: 2147483646;
            background: rgba(0, 0, 0, 0.5);
        }

        .dialog {
            position: fixed;
            top: ${Develobar.BAR_HEIGHT + 20}px;
            left: 50%;
            z-index: 2147483646;
            width: min(1040px, calc(100vw - 32px));
            max-height: calc(100vh - ${Develobar.BAR_HEIGHT + 40}px);
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            background: #18181b;
            border: 1px solid #3f3f46;
            border-radius: 8px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
            color: #e4e4e7;
            font-family: Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
            outline: none;
        }

        header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-bottom: 1px solid #3f3f46;
        }

        header .heading {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: baseline;
            gap: 10px;
        }

        header strong {
            color: #fff;
            font-size: 15px;
        }

        header .site {
            overflow: hidden;
            color: #a1a1aa;
            font-size: 12px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        button {
            height: 28px;
            padding: 0 10px;
            border: 0;
            border-radius: 5px;
            background: #27272a;
            color: #e4e4e7;
            font: inherit;
            white-space: nowrap;
            cursor: pointer;
        }

        button:hover {
            background: #3f3f46;
            color: #fff;
        }

        button.close {
            background: transparent;
            font-size: 18px;
        }

        button.primary {
            background: #2563eb;
            color: #fff;
        }

        button.primary:hover {
            background: #1d4ed8;
        }

        button.danger:hover,
        button.danger.confirm {
            background: #dc2626;
            color: #fff;
        }

        button.small {
            height: 24px;
            padding: 0 8px;
            font-size: 12px;
        }

        .bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border-bottom: 1px solid #3f3f46;
        }

        .bar .spacer {
            flex: 1;
        }

        .bar .summary {
            color: #a1a1aa;
            font-size: 12px;
        }

        input, textarea, select {
            border: 1px solid #3f3f46;
            border-radius: 5px;
            background: #09090b;
            color: #fff;
            font: inherit;
            outline: none;
        }

        input:focus, textarea:focus, select:focus {
            border-color: #2563eb;
        }

        input[type="search"] {
            width: 260px;
            max-width: 100%;
            height: 28px;
            padding: 0 8px;
        }

        main {
            flex: 1;
            min-height: 160px;
            overflow: auto;
        }

        footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 12px;
            border-top: 1px solid #3f3f46;
            color: #71717a;
            font-size: 12px;
        }

        .mono {
            font-family: Consolas, Menlo, monospace;
            font-size: 12px;
        }

        .empty {
            padding: 28px 20px;
            color: #a1a1aa;
            text-align: center;
        }

        .empty p {
            max-width: 520px;
            margin: 0 auto 14px;
        }

        .error {
            color: #f87171;
        }

        /* Cookie table */

        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        th, td {
            padding: 6px 8px;
            border-bottom: 1px solid #27272a;
            text-align: left;
            vertical-align: middle;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        th {
            position: sticky;
            top: 0;
            background: #18181b;
            color: #a1a1aa;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
        }

        th:nth-child(1) { width: 18%; }
        th:nth-child(2) { width: 26%; }
        th:nth-child(3) { width: 15%; }
        th:nth-child(4) { width: 8%; }
        th:nth-child(5) { width: 13%; }
        th:nth-child(6) { width: 11%; }
        th:nth-child(7) { width: 128px; }

        tbody tr {
            cursor: pointer;
        }

        tbody tr:hover {
            background: #27272a;
        }

        td.name {
            color: #fff;
        }

        td.value {
            color: #86efac;
        }

        td.flags {
            white-space: normal;
        }

        td.actions {
            text-align: right;
        }

        .flag {
            display: inline-block;
            margin: 1px 3px 1px 0;
            padding: 0 5px;
            border-radius: 3px;
            background: #27272a;
            color: #a1a1aa;
            font-size: 10px;
            font-weight: 700;
            line-height: 16px;
        }

        .flag.http { background: #1e3a8a; color: #fff; }
        .flag.secure { background: #166534; color: #fff; }

        /* Edit form */

        form {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px;
        }

        label {
            display: flex;
            flex-direction: column;
            gap: 4px;
            color: #a1a1aa;
            font-size: 12px;
        }

        label input:not([type="checkbox"]), label select {
            height: 30px;
            padding: 0 8px;
            color-scheme: dark;
        }

        textarea {
            min-height: 90px;
            padding: 6px 8px;
            font-family: Consolas, Menlo, monospace;
            font-size: 12px;
            resize: vertical;
            word-break: break-all;
        }

        label.check {
            flex-direction: row;
            align-items: center;
            gap: 6px;
            color: #e4e4e7;
            font-size: 13px;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .row {
            display: flex;
            flex-wrap: wrap;
            align-items: flex-end;
            gap: 10px 18px;
        }

        .decoded {
            margin-top: -4px;
            color: #71717a;
            font-size: 12px;
            overflow-wrap: anywhere;
        }

        .hint {
            color: #71717a;
            font-size: 12px;
        }

        .form-actions {
            display: flex;
            gap: 6px;
            padding-top: 10px;
            border-top: 1px solid #3f3f46;
        }

        .form-actions .spacer {
            flex: 1;
        }

        [hidden] {
            display: none !important;
        }
    `;

    const HTML = `
        <div class="backdrop"></div>
        <div class="dialog" role="dialog" aria-modal="true" aria-label="Cookies" tabindex="-1">
            <header>
                <div class="heading">
                    <strong>Cookies</strong>
                    <span class="site"></span>
                </div>
                <button data-action="refresh" title="Read the cookies again">Refresh</button>
                <button class="close" data-action="close" title="Close (Esc)" aria-label="Close">×</button>
            </header>
            <div class="bar" hidden>
                <input type="search" placeholder="Search names, values and domains" aria-label="Search cookies" spellcheck="false" />
                <span class="summary"></span>
                <span class="spacer"></span>
                <button data-action="add">Add cookie</button>
                <button data-action="export-json" title="Download the listed cookies as JSON">Export JSON</button>
                <button data-action="export-txt" title="Download the listed cookies in Netscape format, for curl and wget">Export cookies.txt</button>
                <button data-action="delete-all" class="danger"></button>
            </div>
            <main></main>
            <footer hidden>
                <span>Changes apply to the browser straight away. Reload the page to see how it responds.</span>
                <button data-action="revoke" class="small" title="Develobar will ask again next time">Remove access to this site</button>
            </footer>
        </div>
    `;

    let host = null;
    let root = null;
    let site = '';            // the page's hostname
    let state = 'loading';    // loading | unsupported | access | error | list | edit
    let cookies = [];
    let query = '';
    let editing = null;       // { original } while the form is open; original is null for a new cookie
    let errorText = '';
    let deleteArmed = null;   // timer while "Delete all" is waiting for a second click
    let generation = 0;       // ignores responses that arrive after a reload or close

    // ---- Helpers ----

    function esc(text) {
        return String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    }

    function plural(n, word, many = `${word}s`) {
        return `${n} ${n === 1 ? word : many}`;
    }

    async function ask(action, extra = {}) {
        const res = await chrome.runtime.sendMessage({ type: 'develobar:cookies', action, ...extra });
        if (!res?.ok) throw new Error(res?.error || 'Develobar didn\'t respond. Try reloading the page.');
        return res;
    }

    function isIp(hostname) {
        return /^[\d.]+$/.test(hostname) || hostname.startsWith('[');
    }

    function tryDecode(value) {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    function formatExpiry(cookie) {
        if (cookie.session || !cookie.expirationDate) return 'Session';
        return new Date(cookie.expirationDate * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    // <input type="datetime-local"> works in local time without a zone.
    function toLocalInput(seconds) {
        const d = new Date(seconds * 1000);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    }

    function shown() {
        const q = query.trim().toLowerCase();
        return cookies
            .map((cookie, index) => ({ cookie, index }))
            .filter(({ cookie }) => !q || [cookie.name, cookie.value, cookie.domain].some((s) => s.toLowerCase().includes(q)));
    }

    function download(text, filename, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function exportJson(list) {
        const data = list.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            hostOnly: c.hostOnly,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            session: c.session,
            expirationDate: c.session ? null : c.expirationDate
        }));
        download(JSON.stringify(data, null, 2), `cookies-${site}.json`, 'application/json');
    }

    // Netscape format, as read by curl (-b) and wget (--load-cookies). HttpOnly cookies get curl's
    // "#HttpOnly_" prefix.
    function exportTxt(list) {
        const lines = list.map((c) => [
            `${c.httpOnly ? '#HttpOnly_' : ''}${c.domain}`,
            c.hostOnly ? 'FALSE' : 'TRUE',
            c.path,
            c.secure ? 'TRUE' : 'FALSE',
            c.session ? 0 : Math.round(c.expirationDate),
            c.name,
            c.value
        ].join('\t'));
        download(`# Netscape HTTP Cookie File\n# Exported by Develobar from ${site}\n\n${lines.join('\n')}\n`, `cookies-${site}.txt`, 'text/plain');
    }

    // ---- Rendering ----

    function renderAccess() {
        return `
            <div class="empty">
                <p>To show and edit cookies, including HttpOnly ones the page's own scripts can't see, Develobar needs your permission to access cookies on <strong>${esc(site)}</strong>.</p>
                <p class="hint">You only need to allow this once for each site. Cookies are shown to you here and never leave your browser.</p>
                <button data-action="allow" class="primary">Allow access…</button>
            </div>
        `;
    }

    function renderList() {
        const list = shown();
        if (!cookies.length) {
            return `<div class="empty"><p>${esc(site)} has no cookies.</p><button data-action="add">Add cookie</button></div>`;
        }
        if (!list.length) {
            return `<div class="empty"><p>No cookies match “${esc(query)}”.</p></div>`;
        }

        const sameSite = (v) => SAME_SITE.find((s) => s.value === v && v !== 'unspecified')?.label;

        return `
            <table>
                <thead>
                    <tr><th>Name</th><th>Value</th><th>Domain</th><th>Path</th><th>Expires</th><th>Flags</th><th></th></tr>
                </thead>
                <tbody>
                    ${list.map(({ cookie: c, index }) => `
                        <tr data-index="${index}" title="Click to edit">
                            <td class="name mono" title="${esc(c.name)}">${esc(c.name) || '<span class="hint">(no name)</span>'}</td>
                            <td class="value mono" title="${esc(c.value)}">${esc(c.value)}</td>
                            <td title="${esc(c.domain)}">${esc(c.domain)}</td>
                            <td class="mono" title="${esc(c.path)}">${esc(c.path)}</td>
                            <td>${esc(formatExpiry(c))}</td>
                            <td class="flags">
                                ${c.httpOnly ? '<span class="flag http" title="Not readable by the page\'s scripts">HttpOnly</span>' : ''}
                                ${c.secure ? '<span class="flag secure" title="Only sent over HTTPS">Secure</span>' : ''}
                                ${sameSite(c.sameSite) ? `<span class="flag">SameSite=${sameSite(c.sameSite)}</span>` : ''}
                            </td>
                            <td class="actions">
                                <button class="small" data-copy="${index}" title="Copy the value">Copy</button>
                                <button class="small danger" data-delete="${index}" title="Delete this cookie">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function domainOptions(current) {
        const options = [{ value: `host:${site}`, label: `${site} (this host only)` }];
        if (!isIp(site)) {
            const labels = site.split('.');
            for (let i = 0; i < labels.length - 1; i++) {
                const domain = labels.slice(i).join('.');
                options.push({ value: `domain:.${domain}`, label: `.${domain} (and its subdomains)` });
            }
        }
        if (current && !options.some((o) => o.value === current)) {
            options.push({ value: current, label: current.slice(current.indexOf(':') + 1) });
        }
        return options;
    }

    function renderForm() {
        const c = editing.original;
        const domainValue = !c ? `host:${site}` : c.hostOnly ? `host:${c.domain}` : `domain:.${c.domain.replace(/^\./, '')}`;
        const session = !c || c.session;
        const expires = session ? '' : toLocalInput(c.expirationDate);

        return `
            <form novalidate>
                <label>Name
                    <input name="name" class="mono" value="${esc(c?.name)}" spellcheck="false" autocomplete="off" />
                </label>
                <label>Value
                    <textarea name="value" spellcheck="false">${esc(c?.value)}</textarea>
                </label>
                <div class="decoded" hidden></div>
                <div class="grid">
                    <label>Domain
                        <select name="domain">
                            ${domainOptions(domainValue).map((o) => `<option value="${esc(o.value)}" ${o.value === domainValue ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                        </select>
                    </label>
                    <label>Path
                        <input name="path" class="mono" value="${esc(c?.path ?? '/')}" spellcheck="false" autocomplete="off" />
                    </label>
                </div>
                <div class="row">
                    <label>Expires
                        <input type="datetime-local" name="expires" value="${expires}" ${session ? 'disabled' : ''} />
                    </label>
                    <label class="check"><input type="checkbox" name="session" ${session ? 'checked' : ''} /> Session cookie (removed when the browser closes)</label>
                </div>
                <div class="row">
                    <label class="check"><input type="checkbox" name="secure" ${c?.secure ?? location.protocol === 'https:' ? 'checked' : ''} /> Secure</label>
                    <label class="check"><input type="checkbox" name="httpOnly" ${c?.httpOnly ? 'checked' : ''} /> HttpOnly</label>
                    <label>SameSite
                        <select name="sameSite">
                            ${SAME_SITE.map((s) => `<option value="${s.value}" ${(c?.sameSite ?? 'lax') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                        </select>
                    </label>
                </div>
                <p class="error" hidden></p>
                <div class="form-actions">
                    ${c ? '<button type="button" class="danger" data-action="delete-editing">Delete</button>' : ''}
                    <span class="spacer"></span>
                    <button type="button" data-action="cancel">Cancel</button>
                    <button type="submit" class="primary">${c ? 'Save' : 'Add cookie'}</button>
                </div>
            </form>
        `;
    }

    function updateDecoded() {
        const value = root.querySelector('textarea[name="value"]').value;
        const decoded = tryDecode(value);
        const line = root.querySelector('.decoded');
        line.hidden = decoded === value;
        line.textContent = `Decoded: ${decoded}`;
    }

    function updateBar() {
        const bar = root.querySelector('.bar');
        bar.hidden = state !== 'list';
        root.querySelector('footer').hidden = state !== 'list' && state !== 'edit';
        if (bar.hidden) return;

        const count = shown().length;
        root.querySelector('.summary').textContent = query
            ? `${count} of ${plural(cookies.length, 'cookie')}`
            : plural(cookies.length, 'cookie');

        const exportDisabled = !count;
        root.querySelectorAll('[data-action^="export"]').forEach((b) => { b.disabled = exportDisabled; });

        const deleteAll = root.querySelector('[data-action="delete-all"]');
        deleteAll.hidden = !count;
        deleteAll.classList.toggle('confirm', !!deleteArmed);
        deleteAll.textContent = deleteArmed
            ? `Click again to delete ${plural(count, 'cookie')}`
            : query ? `Delete ${count} shown` : 'Delete all';
    }

    function render() {
        if (!root) return;
        updateBar();

        const main = root.querySelector('main');
        const scroll = main.scrollTop;

        if (state === 'loading') main.innerHTML = '<div class="empty">Loading cookies…</div>';
        else if (state === 'unsupported') main.innerHTML = '<div class="empty"><p>Cookies can only be shown on http and https pages.</p></div>';
        else if (state === 'access') main.innerHTML = renderAccess();
        else if (state === 'error') main.innerHTML = `<div class="empty"><p class="error">${esc(errorText)}</p><button data-action="refresh">Try again</button></div>`;
        else if (state === 'list') main.innerHTML = renderList();
        else if (state === 'edit') {
            main.innerHTML = renderForm();
            updateDecoded();
            main.scrollTop = 0;
            main.querySelector('input[name="name"]').focus();
            return;
        }

        main.scrollTop = scroll;
    }

    // ---- Loading and saving ----

    async function load() {
        const run = ++generation;
        try {
            const status = await ask('status');
            if (run !== generation) return;

            if (status.unsupported) {
                state = 'unsupported';
            } else {
                site = status.host;
                root.querySelector('.site').textContent = site;
                if (!status.granted) {
                    state = 'access';
                } else {
                    const res = await ask('list');
                    if (run !== generation) return;
                    cookies = res.cookies.sort((a, b) => a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain));
                    if (state !== 'edit') state = 'list';
                }
            }
        } catch (err) {
            if (run !== generation) return;
            state = 'error';
            errorText = err.message;
        }
        render();
    }

    function readForm(form) {
        const f = form.elements;
        const domainValue = f.domain.value;
        const kind = domainValue.slice(0, domainValue.indexOf(':'));
        const domain = domainValue.slice(domainValue.indexOf(':') + 1);

        const cookie = {
            name: f.name.value.trim(),
            value: f.value.value,
            domain,
            hostOnly: kind === 'host',
            path: f.path.value.trim() || '/',
            secure: f.secure.checked,
            httpOnly: f.httpOnly.checked,
            sameSite: f.sameSite.value,
            expirationDate: null
        };

        if (!cookie.name) throw new Error('Give the cookie a name.');
        if (!cookie.path.startsWith('/')) throw new Error('The path must start with /.');
        if (cookie.sameSite === 'no_restriction' && !cookie.secure) {
            throw new Error('SameSite=None cookies must also be Secure.');
        }

        if (!f.session.checked) {
            if (!f.expires.value) throw new Error('Choose when the cookie expires, or make it a session cookie.');
            const seconds = new Date(f.expires.value).getTime() / 1000;
            if (seconds <= Date.now() / 1000) throw new Error('The expiry date must be in the future. To remove the cookie, delete it instead.');
            cookie.expirationDate = seconds;
        }

        return cookie;
    }

    async function save(form) {
        const error = form.querySelector('.error');
        error.hidden = true;

        try {
            const cookie = readForm(form);
            await ask('set', { cookie, original: editing.original });
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            return;
        }

        editing = null;
        state = 'list';
        await load();
    }

    async function remove(list) {
        try {
            await ask('remove', { cookies: list });
        } catch (err) {
            state = 'error';
            errorText = err.message;
            render();
            return;
        }
        editing = null;
        state = 'list';
        await load();
    }

    function openEditor(original) {
        editing = { original };
        state = 'edit';
        render();
    }

    function closeEditor() {
        editing = null;
        state = 'list';
        render();
    }

    // ---- Events ----

    function disarmDelete() {
        clearTimeout(deleteArmed);
        deleteArmed = null;
    }

    async function onClick(e) {
        const button = e.target.closest('button');

        // Clicking a row (not its buttons) edits the cookie.
        if (!button) {
            const row = e.target.closest('tr[data-index]');
            if (row) openEditor(cookies[row.dataset.index]);
            return;
        }

        const action = button.dataset.action;
        if (action !== 'delete-all' && deleteArmed) {
            disarmDelete();
            updateBar();
        }

        if (button.dataset.copy) {
            let ok = true;
            try {
                await navigator.clipboard.writeText(cookies[button.dataset.copy].value);
            } catch {
                ok = false;
            }
            button.textContent = ok ? 'Copied' : 'Failed';
            setTimeout(() => { button.textContent = 'Copy'; }, 1500);
        } else if (button.dataset.delete) {
            await remove([cookies[button.dataset.delete]]);
        } else if (action === 'close') {
            Develobar.setActiveTool(null);
        } else if (action === 'refresh') {
            if (state === 'edit') closeEditor();
            if (state !== 'list') { state = 'loading'; render(); }
            load();
        } else if (action === 'allow') {
            try {
                await ask('request');
                button.textContent = 'Waiting for you to allow access…';
            } catch (err) {
                state = 'error';
                errorText = err.message;
                render();
            }
        } else if (action === 'revoke') {
            await ask('revoke').catch(() => {});
            cookies = [];
            editing = null;
            state = 'access';
            render();
        } else if (action === 'add') {
            openEditor(null);
        } else if (action === 'cancel') {
            closeEditor();
        } else if (action === 'delete-editing') {
            await remove([editing.original]);
        } else if (action === 'export-json') {
            exportJson(shown().map((s) => s.cookie));
        } else if (action === 'export-txt') {
            exportTxt(shown().map((s) => s.cookie));
        } else if (action === 'delete-all') {
            if (deleteArmed) {
                disarmDelete();
                await remove(shown().map((s) => s.cookie));
            } else {
                deleteArmed = setTimeout(() => { deleteArmed = null; updateBar(); }, 4000);
                updateBar();
            }
        }
    }

    function onInput(e) {
        if (e.target.matches('input[type="search"]')) {
            query = e.target.value;
            disarmDelete();
            updateBar();
            render();
        } else if (e.target.matches('textarea[name="value"]')) {
            updateDecoded();
        }
    }

    function onChange(e) {
        const form = e.target.form;
        if (!form) return;
        if (e.target.name === 'session') {
            const expires = form.elements.expires;
            expires.disabled = e.target.checked;
            if (!e.target.checked && !expires.value) {
                expires.value = toLocalInput(Date.now() / 1000 + 30 * 24 * 60 * 60); // default to 30 days
            }
        } else if (e.target.name === 'sameSite' && e.target.value === 'no_restriction') {
            form.elements.secure.checked = true;
        }
    }

    function onKeyDown(e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        if (state === 'edit') closeEditor();
        else Develobar.setActiveTool(null);
    }

    // The permission window reports back here once access is granted.
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'develobar:cookies-granted' && root) {
            state = 'loading';
            render();
            load();
        }
    });

    Develobar.registerTool({
        id: 'cookies',

        activate() {
            host = document.createElement('div');
            root = host.attachShadow({ mode: 'open' });
            root.innerHTML = `<style>${CSS}</style>${HTML}`;

            const dialog = root.querySelector('.dialog');
            root.querySelector('.backdrop').addEventListener('click', () => Develobar.setActiveTool(null));
            dialog.addEventListener('click', onClick);
            dialog.addEventListener('input', onInput);
            dialog.addEventListener('change', onChange);
            dialog.addEventListener('submit', (e) => {
                e.preventDefault();
                save(e.target);
            });
            // Keep typing in the dialog away from the page's shortcuts.
            ['keydown', 'keyup', 'keypress'].forEach((type) => {
                dialog.addEventListener(type, (e) => {
                    if (e.key !== 'Escape') e.stopPropagation();
                });
            });
            window.addEventListener('keydown', onKeyDown, true);

            document.documentElement.appendChild(host);
            dialog.focus();

            state = 'loading';
            query = '';
            render();
            load();
        },

        deactivate() {
            generation++;
            disarmDelete();
            window.removeEventListener('keydown', onKeyDown, true);
            host?.remove();
            host = root = null;
            cookies = [];
            editing = null;
        }
    });
})();
