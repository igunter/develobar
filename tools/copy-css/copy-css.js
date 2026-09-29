// Copy CSS tool. Hover to highlight an element, click to pick it; the panel under the button
// shows the CSS needed to reproduce its look, ready to copy or download.
// ↑ / ↓ while hovering walk to the parent / back to the child. Esc cancels.
//
// The browser's computed style lists ~350 properties, almost all defaults. We compare against
// a plain element of the same tag in a blank iframe (browser defaults only, no page CSS) and
// keep just the differences, then fold longhands back into shorthands where we can.
// Limits: :hover/:focus states, media queries and original units/variables aren't recoverable
// from computed styles, so they aren't included.

(() => {
    const { Develobar } = window;

    const OVERLAY_CSS = `
        :host { all: initial; }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483646; /* just below the toolbar, so the panel stays usable */
            cursor: crosshair;
            font-family: Arial, sans-serif;
            font-size: 12px;
        }

        .highlight {
            position: fixed;
            box-sizing: border-box;
            background: rgba(37, 99, 235, 0.15);
            outline: 2px solid #2563eb;
            pointer-events: none;
        }

        .tag {
            position: fixed;
            padding: 3px 6px;
            border-radius: 4px;
            background: #18181b;
            color: #fff;
            white-space: nowrap;
            pointer-events: none;
        }

        .tag .size {
            color: #a1a1aa;
            margin-left: 6px;
        }

        [hidden] {
            display: none;
        }
    `;

    const HTML = `
        <div class="overlay">
            <div class="highlight" hidden></div>
            <div class="tag" hidden></div>
        </div>
    `;

    // Vendor-prefixed properties are mostly aliases; keep the few that do something unique.
    const PREFIXED_KEEP = new Set([
        '-webkit-line-clamp',
        '-webkit-box-orient',
        '-webkit-background-clip',
        '-webkit-text-fill-color',
        '-webkit-text-stroke-width',
        '-webkit-text-stroke-color',
        '-webkit-font-smoothing'
    ]);

    // Logical properties duplicate the physical ones (margin-top etc.) we already output.
    const LOGICAL = /^(block-size|inline-size|(min|max)-(block|inline)-size|inset-(block|inline)|(margin|padding|scroll-margin|scroll-padding)-(block|inline)|border-(block|inline)|border-(start|end)-|contain-intrinsic-(block|inline)|overscroll-behavior-(block|inline)|overflow-(block|inline))/;

    // Colours that default to currentColor: noise when they just match `color`.
    const FOLLOWS_COLOR = /^(border-(top|right|bottom|left)-color|outline-color|text-decoration-color|text-emphasis-color|(column|row)-rule-color|caret-color|-webkit-text-fill-color|-webkit-text-stroke-color)$/;

    // Inherited properties. On ::before/::after these just echo the element, so skip them there.
    const INHERITED = /^(color|font|letter-spacing|line-height|text-(align|indent|transform|shadow|rendering|wrap)|white-space|word-(spacing|break)|overflow-wrap|visibility|cursor|direction|writing-mode|list-style|quotes|hyphens|tab-size|caret-color|border-collapse|border-spacing|-webkit-text-fill-color|-webkit-font-smoothing)/;

    const SIDES = ['top', 'right', 'bottom', 'left'];

    let host = null;
    let els = null;
    let panel = null;
    let base = null;   // deepest element under the pointer
    let depth = 0;     // how many parents up from `base` (↑ / ↓)
    let target = null; // currently highlighted element
    const defaultsCache = new Map();

    // ---- Style extraction ----

    function toObject(style) {
        const out = {};
        for (let i = 0; i < style.length; i++) {
            const name = style[i];
            out[name] = style.getPropertyValue(name);
        }
        return out;
    }

    // Browser defaults for a tag (and pseudo-element), from a blank same-origin iframe.
    // Attributes that change an element's default styling (links vs plain <a>, input types).
    const DEFAULT_ATTRS = ['href', 'type'];

    function defaultsFor(el, pseudo) {
        const attrs = DEFAULT_ATTRS.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${a === 'href' ? '' : el.getAttribute(a)}`);
        const key = `${el.namespaceURI}|${el.localName}|${attrs.join(',')}|${pseudo || ''}`;
        if (defaultsCache.has(key)) return defaultsCache.get(key);

        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;border:0;visibility:hidden;';
        document.documentElement.appendChild(frame);
        try {
            const doc = frame.contentDocument;
            // Standards mode, as a blank iframe would otherwise use quirks-mode defaults.
            doc.open();
            doc.write('<!doctype html><html><head></head><body></body></html>');
            doc.close();
            const plain = doc.createElementNS(el.namespaceURI, el.localName);
            for (const a of DEFAULT_ATTRS) {
                if (el.hasAttribute(a)) plain.setAttribute(a, a === 'href' ? '#' : el.getAttribute(a));
            }
            doc.body.appendChild(plain);
            const defaults = toObject(frame.contentWindow.getComputedStyle(plain, pseudo));
            defaultsCache.set(key, defaults);
            return defaults;
        } finally {
            frame.remove();
        }
    }

    // Would these properties compute the same if set to `auto`? Tells an explicit size or
    // margin apart from one the browser worked out, e.g. a button sized by its text or
    // `margin: 0 auto` centring. Briefly overrides the inline style, then restores it.
    function behavesAsAuto(el, props) {
        const before = props.map((p) => getComputedStyle(el).getPropertyValue(p));
        const saved = props.map((p) => [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
        props.forEach((p) => el.style.setProperty(p, 'auto', 'important'));
        const after = props.map((p) => getComputedStyle(el).getPropertyValue(p));
        props.forEach((p, i) => {
            if (saved[i][0]) el.style.setProperty(p, saved[i][0], saved[i][1]);
            else el.style.removeProperty(p);
        });
        return before.every((v, i) => v === after[i]);
    }

    function isNone(value) {
        return value === 'none' || value === 'normal' || value === '';
    }

    // Properties of `el` (or its pseudo-element) that differ from the browser defaults.
    function differences(el, pseudo) {
        const computed = toObject(getComputedStyle(el, pseudo));
        const defaults = defaultsFor(el, pseudo);
        const own = pseudo ? toObject(getComputedStyle(el)) : null;
        const out = {};

        for (const [name, value] of Object.entries(computed)) {
            if (name.startsWith('--')) continue;
            if (name.startsWith('-') && !PREFIXED_KEEP.has(name)) continue;
            if (LOGICAL.test(name)) continue;
            if (value === defaults[name]) continue;
            if (FOLLOWS_COLOR.test(name) && value === computed.color) continue;
            if (own && INHERITED.test(name) && value === own[name]) continue;
            out[name] = value;
        }

        // Drop values that only exist because of their size, or that have no effect.
        if (isNone(computed.transform)) delete out['transform-origin'];
        if (isNone(computed.perspective)) delete out['perspective-origin'];
        if (computed['outline-style'] === 'none') {
            for (const name of Object.keys(out)) if (name.startsWith('outline')) delete out[name];
        }
        for (const rule of ['column-rule', 'row-rule']) {
            if (computed[`${rule}-style`] && computed[`${rule}-style`] !== 'none') continue;
            for (const name of Object.keys(out)) if (name.startsWith(rule)) delete out[name];
        }

        // Sizes and centring margins the browser calculated rather than the page set.
        if (!pseudo) {
            for (const size of ['width', 'height']) {
                if (size in out && behavesAsAuto(el, [size])) delete out[size];
            }
            const left = computed['margin-left'];
            if (left !== '0px' && left === computed['margin-right'] && behavesAsAuto(el, ['margin-left', 'margin-right'])) {
                out['margin-left'] = out['margin-right'] = 'auto';
            }
        }
        for (const side of SIDES) {
            if (computed[`border-${side}-style`] === 'none') {
                delete out[`border-${side}-width`];
                delete out[`border-${side}-color`];
            }
        }

        // Chrome reports text-decoration as well as its longhands.
        if ('text-decoration' in out) {
            ['line', 'style', 'color', 'thickness'].forEach((p) => delete out[`text-decoration-${p}`]);
        }

        collapse(out, computed);
        return out;
    }

    // "1px 1px 1px 1px" -> "1px", "1px 2px 1px 2px" -> "1px 2px", and so on.
    function boxShorthand([t, r, b, l]) {
        if (r === l) {
            if (t === b) return t === r ? t : `${t} ${r}`;
            return `${t} ${r} ${b}`;
        }
        return `${t} ${r} ${b} ${l}`;
    }

    // Fold longhands into shorthands. Missing sides are filled from the computed style.
    function collapse(out, computed) {
        const fold = (shorthand, names) => {
            if (!names.some((n) => n in out)) return;
            const values = names.map((n) => out[n] ?? computed[n]);
            if (values.some((v) => v.includes(' '))) return; // e.g. elliptical radii
            names.forEach((n) => delete out[n]);
            out[shorthand] = boxShorthand(values);
        };

        fold('margin', SIDES.map((s) => `margin-${s}`));
        fold('padding', SIDES.map((s) => `padding-${s}`));
        fold('border-radius', ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => `border-${c}-radius`));

        // Borders: one `border` if all sides match, otherwise `border-top` etc.
        const parts = ['width', 'style', 'color'];
        const sideValue = (side) => parts.map((p) => computed[`border-${side}-${p}`]).join(' ');
        const touched = SIDES.filter((side) => parts.some((p) => `border-${side}-${p}` in out));
        if (!touched.length) return;

        const clearSide = (side) => parts.forEach((p) => delete out[`border-${side}-${p}`]);
        const values = SIDES.map(sideValue);
        const visible = SIDES.filter((side) => computed[`border-${side}-style`] !== 'none');

        if (visible.length === 4 && values.every((v) => v === values[0])) {
            SIDES.forEach(clearSide);
            out.border = values[0];
        } else {
            for (const side of touched) {
                clearSide(side);
                if (computed[`border-${side}-style`] !== 'none') out[`border-${side}`] = sideValue(side);
            }
        }
    }

    function selectorFor(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const classes = [...el.classList].slice(0, 3).map((c) => `.${CSS.escape(c)}`).join('');
        return classes || el.localName;
    }

    function describe(el) {
        const id = el.id ? `#${el.id}` : '';
        const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
        return `${el.localName}${id}${classes}`;
    }

    function block(selector, props) {
        const lines = Object.keys(props).sort().map((name) => `    ${name}: ${props[name]};`);
        return `${selector} {\n${lines.join('\n')}\n}`;
    }

    function generate(el) {
        const selector = selectorFor(el);
        const blocks = [block(selector, differences(el))];

        for (const pseudo of ['::before', '::after']) {
            if (isNone(getComputedStyle(el, pseudo).content)) continue;
            blocks.push(block(`${selector}${pseudo}`, differences(el, pseudo)));
        }

        return `/* ${describe(el)}, copied from ${location.hostname || location.href} */\n\n${blocks.join('\n\n')}\n`;
    }

    // ---- Panel ----

    function buildPanel() {
        panel = Develobar.getPanel('copy-css');
        if (!panel) return;

        panel.innerHTML = `
            <div class="css-target">Hover an element…</div>
            <pre class="css-code" hidden></pre>
            <div class="css-actions" hidden>
                <button data-css-action="copy" class="primary">Copy</button>
                <button data-css-action="download">Download .css</button>
            </div>
            <div class="picker-hint">Click to pick · ↑ ↓ parent / child · Esc to cancel</div>
            <div class="css-note" hidden>Hover/focus states and media queries aren't included.</div>
        `;
        panel.onclick = onPanelClick;

        Develobar.openPanel('copy-css');
    }

    function showResult(el) {
        if (!panel?.isConnected) return;
        const code = generate(el);

        panel.querySelector('.css-target').textContent = describe(el);
        panel.querySelector('.css-code').textContent = code;
        panel.querySelector('.css-code').hidden = false;
        panel.querySelector('.css-actions').hidden = false;
        panel.querySelector('.css-note').hidden = false;
        panel.querySelector('.picker-hint')?.remove();
        panel.dataset.filename = `${(selectorFor(el).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'element')}.css`;
    }

    async function onPanelClick(e) {
        const button = e.target.closest('button[data-css-action]');
        if (!button) return;
        const code = panel.querySelector('.css-code').textContent;

        if (button.dataset.cssAction === 'copy') {
            let ok = true;
            try {
                await navigator.clipboard.writeText(code);
            } catch {
                ok = false;
            }
            button.textContent = ok ? 'Copied' : 'Copy failed';
            setTimeout(() => { button.textContent = 'Copy'; }, 1500);
        } else {
            const url = URL.createObjectURL(new Blob([code], { type: 'text/css' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = panel.dataset.filename || 'element.css';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
    }

    // ---- Picking ----

    // Topmost page element at a point, ignoring Develobar's own UI.
    function elementAt(x, y) {
        const bar = document.getElementById('develobar-host');
        return document.elementsFromPoint(x, y).find((el) => el !== host && el !== bar
            && el !== document.documentElement && el !== document.body) || null;
    }

    function setTarget() {
        target = base;
        for (let i = 0; i < depth && target?.parentElement && target.parentElement !== document.body; i++) {
            target = target.parentElement;
        }
        render();
    }

    function render() {
        if (!els) return;
        els.highlight.hidden = els.tag.hidden = !target;
        if (!target) return;

        const r = target.getBoundingClientRect();
        Object.assign(els.highlight.style, {
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`
        });

        els.tag.innerHTML = '';
        els.tag.append(describe(target));
        const size = document.createElement('span');
        size.className = 'size';
        size.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
        els.tag.append(size);

        // Label above the element, or inside it when there's no room.
        const top = r.top - 24 >= Develobar.BAR_HEIGHT ? r.top - 24 : Math.max(r.top, Develobar.BAR_HEIGHT) + 4;
        els.tag.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - els.tag.offsetWidth - 4))}px`;
        els.tag.style.top = `${top}px`;
    }

    function onPointerMove(e) {
        const el = elementAt(e.clientX, e.clientY);
        if (el === base) return;
        base = el;
        depth = 0;
        setTarget();
    }

    function onClick(e) {
        // Swallow the click so it never reaches the page (or the toolbar's close-menus listener).
        e.preventDefault();
        e.stopPropagation();
        if (!target) return;

        const picked = target;
        Develobar.setActiveTool(null); // removes the overlay; the panel stays open
        showResult(picked);
    }

    function onKeyDown(e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            if (!base) return;
            const canGoUp = target?.parentElement && target.parentElement !== document.body;
            if (e.key === 'ArrowUp' && canGoUp) depth++;
            if (e.key === 'ArrowDown' && depth > 0) depth--;
            setTarget();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            Develobar.setActiveTool(null);
            panel?.closest('.dropdown')?.classList.remove('open');
        }
    }

    Develobar.registerTool({
        id: 'copy-css',

        activate() {
            host = document.createElement('div');
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<style>${OVERLAY_CSS}</style>${HTML}`;

            const overlay = shadow.querySelector('.overlay');
            els = {
                highlight: shadow.querySelector('.highlight'),
                tag: shadow.querySelector('.tag')
            };

            overlay.addEventListener('pointermove', onPointerMove);
            overlay.addEventListener('pointerdown', (e) => e.preventDefault()); // don't move focus or select text
            overlay.addEventListener('click', onClick);
            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('scroll', render, { passive: true });

            document.documentElement.appendChild(host);
            buildPanel();
        },

        deactivate() {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('scroll', render);
            host?.remove();
            host = els = base = target = null;
            depth = 0;
        }
    });
})();
