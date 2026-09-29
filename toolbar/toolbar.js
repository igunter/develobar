// Develobar toolbar: mounts toolbar.html/css into a shadow root and routes button clicks to tools.
// Tools register themselves with Develobar.registerTool({ id, activate, deactivate? }).

window.Develobar = window.Develobar || (() => {
    const HOST_ID = 'develobar-host';
    const PAGE_CLASS = 'develobar-active';
    const BAR_HEIGHT = 42;

    const tools = {};
    let host = null;
    let activeTool = null;
    let wantOpen = false; // guards against unmount() landing while mount() is still fetching

    function registerTool(tool) {
        tools[tool.id] = tool;
    }

    // After the extension is reloaded or updated, scripts already running in open tabs are cut
    // off: every chrome.* call throws "Extension context invalidated".
    function contextValid() {
        return !!chrome.runtime?.id;
    }

    async function mount() {
        if (wantOpen) return;
        wantOpen = true;

        const [html, css] = await Promise.all([
            fetch(chrome.runtime.getURL('toolbar/toolbar.html')).then((r) => r.text()),
            fetch(chrome.runtime.getURL('toolbar/toolbar.css')).then((r) => r.text())
        ]);

        if (!wantOpen || host) return;

        // A bar left behind by a previous version of the extension (see contextValid).
        document.getElementById(HOST_ID)?.remove();

        host = document.createElement('div');
        host.id = HOST_ID;
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${css}</style>${html}`;

        // Paths in toolbar.html are relative to the extension root; point them at the extension, not the page.
        shadow.querySelectorAll('img[src]').forEach((img) => {
            img.src = chrome.runtime.getURL(img.getAttribute('src').replace(/^\//, ''));
        });

        shadow.addEventListener('click', onClick);

        document.documentElement.appendChild(host);
        pushPageDown(true);
    }

    function unmount() {
        wantOpen = false;
        if (!host) return;
        setActiveTool(null);
        host.remove();
        host = null;
        pushPageDown(false);
    }

    function toggle() {
        wantOpen ? unmount() : mount();
    }

    // Shift the page down so the bar doesn't cover content.
    function pushPageDown(on) {
        if (!document.getElementById('develobar-page-style')) {
            const style = document.createElement('style');
            style.id = 'develobar-page-style';
            style.textContent = `html.${PAGE_CLASS} { padding-top: ${BAR_HEIGHT}px !important; }`;
            document.head.appendChild(style);
        }
        document.documentElement.classList.toggle(PAGE_CLASS, on);
        shiftFixedElements(on);
    }

    // Padding moves the normal page flow, but fixed/sticky headers are positioned against
    // the viewport and would sit under the bar. Push those down too, and keep watching for
    // new ones (e.g. headers that only become fixed once the page scrolls).
    const shifted = new Map(); // element -> its original inline `top`
    let observer = null;

    function shiftFixedElements(on) {
        if (on) {
            if (observer) return;
            scan(document.body);
            observer = new MutationObserver(onMutations);
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        } else {
            observer?.disconnect();
            observer = null;
            shifted.forEach((_, el) => unshift(el));
        }
    }

    function scan(root) {
        if (root?.nodeType !== Node.ELEMENT_NODE) return;
        shift(root);
        root.querySelectorAll('*').forEach(shift);
    }

    function shift(el) {
        if (shifted.has(el) || el === host || el.id === HOST_ID) return;

        const style = getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') return;

        const top = parseFloat(style.top);
        if (Number.isNaN(top) || top >= BAR_HEIGHT) return;

        shifted.set(el, {
            value: el.style.getPropertyValue('top'),
            priority: el.style.getPropertyPriority('top')
        });
        el.style.setProperty('top', `${top + BAR_HEIGHT}px`, 'important');
    }

    function unshift(el) {
        const original = shifted.get(el);
        if (!original) return;
        shifted.delete(el);
        if (original.value) {
            el.style.setProperty('top', original.value, original.priority);
        } else {
            el.style.removeProperty('top');
        }
    }

    function onMutations(mutations) {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach(scan);
            } else {
                // Class changed: re-evaluate from the page's own styles.
                unshift(m.target);
                shift(m.target);
            }
        }
    }

    function onClick(e) {
        const button = e.target.closest('button');
        if (!button) return;

        // This bar belongs to a previous version of the extension, so its tools can't work.
        if (!contextValid()) {
            if (button.dataset.action === 'close') unmount();
            else showStaleNotice();
            return;
        }

        // Panels are filled and handled by their tool.
        if (button.closest('.panel')) return;

        if (button.dataset.dropdown) {
            const dropdown = button.closest('.dropdown');
            const wasOpen = dropdown.classList.contains('open');
            closeMenus();
            dropdown.classList.toggle('open', !wasOpen);
            return;
        }

        closeMenus();

        if (button.dataset.action === 'close') {
            unmount();
            return;
        }

        const id = button.dataset.tool;
        const option = button.dataset.option;

        // Menu options always run; plain buttons toggle their tool on/off.
        if (option) {
            setActiveTool(id, option);
        } else {
            setActiveTool(activeTool?.id === id ? null : id);
        }
    }

    // Replace the tool buttons with a message. Styled inline because the stylesheet in this
    // shadow root may be from an older version.
    function showStaleNotice() {
        const bar = host?.shadowRoot.getElementById('develobar');
        if (!bar || bar.querySelector('.stale-notice')) return;

        bar.querySelectorAll(':scope > :not(.brand):not(.close)').forEach((el) => el.remove());

        const notice = document.createElement('div');
        notice.className = 'stale-notice';
        notice.style.cssText = 'flex: 1; padding: 0 8px; color: #e4e4e7;';
        notice.textContent = 'Develobar has been updated. Reload this page to keep using it.';
        bar.querySelector('.close')?.before(notice);
    }

    function closeMenus() {
        host?.shadowRoot.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
    }

    // A tool's panel (e.g. colour results) sits in a dropdown under its button.
    function getPanel(id) {
        return host?.shadowRoot.querySelector(`[data-panel="${id}"]`) || null;
    }

    function openPanel(id) {
        const panel = getPanel(id);
        if (!panel) return;
        closeMenus();
        panel.closest('.dropdown').classList.add('open');
    }

    // Clicks outside the toolbar close any open menu.
    document.addEventListener('click', (e) => {
        if (host && !e.composedPath().includes(host)) closeMenus();
    });

    function setActiveTool(id, option) {
        activeTool?.deactivate?.();
        activeTool = null;

        host?.shadowRoot.querySelectorAll('button[data-tool], button[data-dropdown]').forEach((b) => {
            b.classList.toggle('active', !!id && (b.dataset.dropdown || b.dataset.tool) === id);
        });

        if (!id) return;

        const tool = tools[id];
        if (!tool) {
            console.info(`Develobar: "${id}" is not implemented yet.`);
            setActiveTool(null);
            return;
        }

        activeTool = tool;
        tool.activate(option);
    }

    // Temporarily remove the bar (and page offset) from view, e.g. while capturing a screenshot.
    function setHidden(hidden) {
        if (!host) return;
        host.style.display = hidden ? 'none' : '';
        pushPageDown(!hidden);
    }

    return { registerTool, toggle, mount, unmount, setActiveTool, setHidden, getPanel, openPanel, BAR_HEIGHT };
})();
