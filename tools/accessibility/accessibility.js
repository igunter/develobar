// Accessibility tool. Scans the page and lists problems in the panel under the button, in four tabs:
//  - Contrast: text colour against its background, checked against WCAG AA or AAA, plus a manual
//    checker for any two colours.
//  - Images: missing or unhelpful alt text.
//  - Headings: the page outline, flagging a missing h1, skipped levels and empty headings.
//  - Keyboard: controls with no accessible name, positive tabindex, things that look clickable but
//    can't be reached by keyboard, and an optional overlay numbering the tab order on the page.
// Click a result to scroll to and outline the element; click again for the next one in a group.
//
// Limits: backgrounds are worked out from each element's ancestors, so text positioned over
// unrelated elements isn't scored accurately, and text over images or gradients is listed for a
// manual check. Shadow DOM and iframes aren't scanned. Automated checks only catch part of WCAG;
// they don't replace testing with a keyboard and a screen reader.

(() => {
    const { Develobar } = window;

    const MAX_TEXT_ELEMENTS = 5000;
    const MAX_ROWS = 200;
    const WHITE = { r: 255, g: 255, b: 255, a: 1 };
    const LARGE_PX = 24;         // 18pt
    const LARGE_BOLD_PX = 18.66; // 14pt, when bold
    const THRESHOLDS = { AA: { normal: 4.5, large: 3 }, AAA: { normal: 7, large: 4.5 } };

    const TABS = [
        { id: 'contrast', label: 'Contrast' },
        { id: 'images', label: 'Images' },
        { id: 'headings', label: 'Headings' },
        { id: 'keyboard', label: 'Keyboard' }
    ];

    const OVERLAY_CSS = `
        :host { all: initial; }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483646; /* just below the toolbar */
            pointer-events: none; /* the page stays usable, e.g. to Tab through it */
            font-family: Arial, sans-serif;
            font-size: 11px;
        }

        .highlight {
            position: fixed;
            box-sizing: border-box;
            outline: 3px solid #f59e0b;
            outline-offset: 2px;
            background: rgba(245, 158, 11, 0.15);
            animation: pulse 0.6s ease-in-out 3;
        }

        @keyframes pulse {
            50% { outline-offset: 8px; }
        }

        .tag {
            position: fixed;
            padding: 3px 6px;
            border-radius: 4px;
            background: #18181b;
            color: #fff;
            font-size: 12px;
            white-space: nowrap;
        }

        svg {
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
        }

        polyline {
            fill: none;
            stroke: #2563eb;
            stroke-width: 2;
            stroke-opacity: 0.6;
            stroke-dasharray: 5 4;
        }

        .badge {
            position: fixed;
            min-width: 20px;
            height: 20px;
            padding: 0 5px;
            box-sizing: border-box;
            border-radius: 10px;
            background: #2563eb;
            color: #fff;
            font-weight: 700;
            line-height: 20px;
            text-align: center;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
            transform: translate(-50%, -50%);
        }

        .badge.issue {
            background: #dc2626;
        }

        /* The element that currently has focus. */
        .badge.current {
            z-index: 1;
            background: #f59e0b;
            color: #18181b;
            transform: translate(-50%, -50%) scale(1.4);
        }

        [hidden] {
            display: none;
        }
    `;

    const OVERLAY_HTML = `
        <div class="overlay">
            <svg hidden><polyline></polyline></svg>
            <div class="badges" hidden></div>
            <div class="highlight" hidden></div>
            <div class="tag" hidden></div>
        </div>
    `;

    let host = null;
    let els = null;
    let panel = null;
    let results = null;
    let refs = [];          // rows' targets: { els, pos, colours? }, indexed by data-ref
    let badges = [];        // tab order overlay: { el, node }
    let highlighted = null;
    let frame = 0;
    let scanTimer = 0;
    let tab = 'contrast';
    let level = 'AA';
    let showOrder = false;
    const checker = { fg: '#767676', bg: '#FFFFFF' };

    // Per-scan caches.
    let styleCache = null;
    let backgroundCache = null;
    let opacityCache = null;

    // ---- Helpers ----

    function esc(text) {
        return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    }

    function describe(el) {
        const id = el.id ? `#${el.id}` : '';
        const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
        return `${el.localName}${id}${classes}`;
    }

    function truncate(text, length) {
        return text.length > length ? `${text.slice(0, length - 1)}…` : text;
    }

    function styleOf(el) {
        let style = styleCache.get(el);
        if (!style) {
            style = getComputedStyle(el);
            styleCache.set(el, style);
        }
        return style;
    }

    function hiddenFromAT(el) {
        return !!el.closest('[aria-hidden="true"]');
    }

    // Rendered, big enough to read, and not moved off the page (e.g. screen-reader-only text).
    function isShown(el) {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        return r.right + window.scrollX > 0 && r.bottom + window.scrollY > 0;
    }

    // ---- Colour ----

    const colourCache = new Map();
    let colourContext = null;

    // Computed colours are usually rgb()/rgba(); anything else (oklch(), color(), lab()…) is
    // converted to sRGB by drawing it on a canvas.
    function parseColour(value) {
        if (colourCache.has(value)) return colourCache.get(value);

        let colour;
        const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
        if (m) {
            const a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] ? 100 : 1);
            colour = { r: +m[1], g: +m[2], b: +m[3], a };
        } else {
            if (!colourContext) {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                colourContext = canvas.getContext('2d', { willReadFrequently: true });
            }
            colourContext.clearRect(0, 0, 1, 1);
            colourContext.fillStyle = 'transparent';
            colourContext.fillStyle = value; // ignored if the browser can't parse it
            colourContext.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = colourContext.getImageData(0, 0, 1, 1).data;
            colour = { r, g, b, a: a / 255 };
        }

        colourCache.set(value, colour);
        return colour;
    }

    // Paint `top` over `bottom`.
    function over(top, bottom) {
        const a = top.a + bottom.a * (1 - top.a);
        if (!a) return { r: 0, g: 0, b: 0, a: 0 };
        const channel = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
        return { r: channel('r'), g: channel('g'), b: channel('b'), a };
    }

    function luminance({ r, g, b }) {
        const linear = (v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    }

    function contrast(a, b) {
        const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (light + 0.05) / (dark + 0.05);
    }

    // WCAG says not to round up, so 4.499 shows (and fails) as 4.49.
    function formatRatio(ratio) {
        return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
    }

    function toHex({ r, g, b }) {
        return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    }

    function fromHex(text) {
        let hex = text.trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, '$&$&');
        if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
        const n = parseInt(hex, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }

    function required(large, lvl = level) {
        return THRESHOLDS[lvl][large ? 'large' : 'normal'];
    }

    // ---- Contrast scan ----

    // What's painted behind `el`: its own background over its ancestors'. `image` is set when a
    // background image or gradient shows through, as text can't be scored against those.
    function backgroundOf(el) {
        if (!el) return { colour: WHITE, image: false };
        if (backgroundCache.has(el)) return backgroundCache.get(el);

        const style = styleOf(el);
        const own = parseColour(style.backgroundColor);
        const image = style.backgroundImage !== 'none'; // painted above the element's own colour
        let result;
        if (own.a >= 1) {
            result = { colour: own, image };
        } else {
            const parent = backgroundOf(el.parentElement);
            result = {
                colour: own.a > 0 ? over(own, parent.colour) : parent.colour,
                image: image || parent.image
            };
        }

        backgroundCache.set(el, result);
        return result;
    }

    function opacityOf(el) {
        if (!el) return 1;
        if (opacityCache.has(el)) return opacityCache.get(el);
        const opacity = parseFloat(styleOf(el).opacity) * opacityOf(el.parentElement);
        opacityCache.set(el, opacity);
        return opacity;
    }

    const SKIP_TEXT_PARENTS = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'option', 'optgroup']);
    const TEXT_CONTROLS = 'input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"]), select, textarea';

    // Elements that directly contain visible text, plus form controls showing a value.
    function textElements() {
        const found = new Set();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => (/\S/.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
        });
        while (found.size < MAX_TEXT_ELEMENTS && walker.nextNode()) {
            const parent = walker.currentNode.parentElement;
            if (parent && !SKIP_TEXT_PARENTS.has(parent.localName)) found.add(parent);
        }
        const truncated = found.size >= MAX_TEXT_ELEMENTS;
        document.body.querySelectorAll(TEXT_CONTROLS).forEach((el) => {
            if (el.value.trim()) found.add(el);
        });
        return { elements: found, truncated };
    }

    function sampleText(el) {
        const text = el.localName === 'select' ? el.selectedOptions[0]?.text || ''
            : el.matches('input, textarea') ? el.value : el.textContent;
        return truncate(text.replace(/\s+/g, ' ').trim(), 70);
    }

    // Text grouped by colour pair and size, so one fix covers a group. Sorted worst first.
    function scanContrast() {
        const { elements, truncated } = textElements();
        const groups = new Map();

        for (const el of elements) {
            // SVG text uses fill, and disabled controls are exempt from WCAG contrast.
            if (el.closest('svg, :disabled, [aria-disabled="true"]')) continue;
            if (!isShown(el)) continue;

            const style = styleOf(el);
            const fill = parseColour(style.webkitTextFillColor || style.color);
            const alpha = fill.a * opacityOf(el);
            if (alpha === 0) continue; // e.g. gradient text via background-clip: text

            const bg = backgroundOf(el);
            const fg = over({ ...fill, a: alpha }, bg.colour);
            const size = parseFloat(style.fontSize);
            const weight = parseInt(style.fontWeight, 10) || 400;
            const large = size >= LARGE_PX || (size >= LARGE_BOLD_PX && weight >= 700);

            const fgHex = toHex(fg);
            const bgHex = toHex(bg.colour);
            const key = `${fgHex}|${bgHex}|${large}|${bg.image}`;
            let group = groups.get(key);
            if (!group) {
                group = { fg: fgHex, bg: bgHex, ratio: contrast(fg, bg.colour), large, image: bg.image, els: [] };
                groups.set(key, group);
            }
            group.els.push(el);
        }

        return { groups: [...groups.values()].sort((a, b) => a.ratio - b.ratio), truncated };
    }

    // ---- Accessible names ----

    // Text a screen reader would read for a node, skipping hidden parts.
    function textAlternative(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.data;
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') return '';

        const tag = node.localName;
        if (SKIP_TEXT_PARENTS.has(tag) && tag !== 'textarea') return '';
        const label = node.getAttribute('aria-label')?.trim();
        if (label) return label;
        if (tag === 'img' || tag === 'area' || (tag === 'input' && node.type === 'image')) return node.getAttribute('alt') || '';
        if (tag === 'svg') return node.querySelector('title')?.textContent || '';
        if (getComputedStyle(node).display === 'none') return '';
        return [...node.childNodes].map(textAlternative).join(' ');
    }

    function textOf(el) {
        return [...el.childNodes].map(textAlternative).join(' ').replace(/\s+/g, ' ').trim();
    }

    function labelledBy(el) {
        const ids = el.getAttribute('aria-labelledby');
        if (!ids) return '';
        return ids.trim().split(/\s+/).map((id) => {
            const target = document.getElementById(id);
            return target ? target.getAttribute('aria-label') || textOf(target) : '';
        }).join(' ').trim();
    }

    // A simplified version of the browser's accessible name calculation.
    function accessibleName(el) {
        const named = labelledBy(el) || el.getAttribute('aria-label')?.trim();
        if (named) return named;

        const tag = el.localName;
        const title = (el.getAttribute('title') || '').trim();

        if (tag === 'img' || tag === 'area') return (el.getAttribute('alt') || '').trim() || title;
        if (tag === 'svg') return (el.querySelector('title')?.textContent || '').trim() || title;
        if (tag === 'iframe') return title;

        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            if (tag === 'input' && el.type === 'image') return (el.getAttribute('alt') || '').trim() || title;
            if (tag === 'input' && ['submit', 'reset', 'button'].includes(el.type)) {
                const defaults = { submit: 'Submit', reset: 'Reset', button: '' };
                return el.value.trim() || defaults[el.type] || title;
            }
            const fromLabels = [...(el.labels || [])].map(textOf).join(' ').trim();
            return fromLabels || title || (el.getAttribute('placeholder') || '').trim();
        }

        return textOf(el) || title;
    }

    // ---- Images scan ----

    const GENERIC_ALT = /^(an? )?(image|img|photo|photograph|picture|pic|graphic|icon|logo|banner|spacer|placeholder|untitled|thumbnail|null|undefined)s?$/i;
    const FILENAME_ALT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?)$|^(img|image|dsc|photo|screenshot|screen shot)[-_ ]?\d+/i;

    function scanImages() {
        const issues = [];
        let total = 0;
        let decorative = 0;

        for (const img of document.body.querySelectorAll('img')) {
            if (!img.checkVisibility({ checkVisibilityCSS: true }) || hiddenFromAT(img)) continue;
            total++;

            const alt = img.getAttribute('alt');
            const role = img.getAttribute('role');
            if (alt === null) {
                if (labelledBy(img) || img.getAttribute('aria-label')?.trim()) continue;
                if (role === 'presentation' || role === 'none') {
                    decorative++;
                    continue;
                }
                issues.push({
                    el: img,
                    severity: 'error',
                    message: 'Missing alt attribute',
                    detail: 'Describe the image in alt, or use alt="" if it is purely decorative.'
                });
                continue;
            }

            const text = alt.trim();
            if (!text) {
                decorative++; // if it's the only content of a link or button, Keyboard reports the missing name
            } else if (FILENAME_ALT.test(text)) {
                issues.push({ el: img, severity: 'warning', message: 'Alt text looks like a file name', detail: `alt="${truncate(text, 60)}"` });
            } else if (GENERIC_ALT.test(text)) {
                issues.push({ el: img, severity: 'warning', message: 'Alt text doesn\'t describe the image', detail: `alt="${text}"` });
            } else if (text.length > 150) {
                issues.push({ el: img, severity: 'warning', message: 'Very long alt text', detail: `${text.length} characters. Keep alt short and put longer descriptions in the page.` });
            }
        }

        // Other kinds of image that need a text alternative.
        const others = [
            ['input[type="image"]', 'Image button has no alt text'],
            ['area[href]', 'Image map area has no alt text'],
            ['svg[role="img"]', 'SVG image has no accessible name'],
            ['[role="img"]:not(svg, img)', 'role="img" element has no accessible name']
        ];
        for (const [selector, message] of others) {
            for (const el of document.body.querySelectorAll(selector)) {
                if (hiddenFromAT(el)) continue;
                if (el.localName !== 'area' && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
                total++;
                if (!accessibleName(el)) {
                    issues.push({ el, severity: 'error', message, detail: 'Add alt text, aria-label or a <title>.' });
                }
            }
        }

        return { issues, total, decorative };
    }

    // ---- Headings scan ----

    function scanHeadings() {
        const headings = [];
        for (const el of document.body.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
            const role = el.getAttribute('role');
            if (role && role !== 'heading') continue; // e.g. <h2 role="presentation">
            if (hiddenFromAT(el) || !el.checkVisibility({ checkVisibilityCSS: true })) continue;

            const ariaLevel = parseInt(el.getAttribute('aria-level'), 10);
            const tagLevel = /^h[1-6]$/.test(el.localName) ? Number(el.localName[1]) : 2;
            headings.push({ el, level: ariaLevel >= 1 ? ariaLevel : tagLevel, text: accessibleName(el), issues: [] });
        }

        let previous = 0;
        for (const h of headings) {
            if (!h.text) h.issues.push({ severity: 'error', message: 'Empty heading' });
            if (previous && h.level > previous + 1) {
                h.issues.push({ severity: 'warning', message: `Skips a level: h${previous} to h${h.level}` });
            }
            previous = h.level;
        }

        const pageIssues = [];
        const h1s = headings.filter((h) => h.level === 1);
        if (!h1s.length) {
            pageIssues.push({ severity: 'warning', message: 'No h1 on the page', detail: 'Give the page one h1 that describes its main content.' });
        } else if (h1s.length > 1) {
            pageIssues.push({ severity: 'warning', message: `${h1s.length} h1 headings`, detail: 'Most pages read best with a single h1.', els: h1s.map((h) => h.el) });
        }

        const issueCount = pageIssues.length + headings.reduce((n, h) => n + h.issues.length, 0);
        return { headings, pageIssues, issueCount };
    }

    // ---- Keyboard scan ----

    const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]';
    const NEEDS_NAME = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [role="combobox"], [role="textbox"], [role="searchbox"], [role="slider"]';
    // Roles that should normally be in the tab order themselves. Tabs, menu items, options etc.
    // are left out as they often use a roving tabindex.
    const TABBABLE_ROLES = '[role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="slider"], [role="spinbutton"], [role="textbox"], [role="searchbox"], [role="combobox"]';

    function unnamedMessage(el) {
        const role = el.getAttribute('role');
        if (el.localName === 'a' || role === 'link') return ['Link has no text', 'Screen readers announce just "link". Add text, aria-label, or alt on its image.'];
        if (el.localName === 'button' || role === 'button' || el.type === 'submit' || el.type === 'button') return ['Button has no text', 'Icon-only buttons need an aria-label.'];
        if (el.localName === 'iframe') return ['iframe has no title', 'Add a title describing what the frame contains.'];
        if (el.matches('input, select, textarea')) return ['Form field has no label', 'Associate a <label>, or add aria-label.'];
        return ['Control has no accessible name', 'Add text or aria-label.'];
    }

    function scanKeyboard() {
        const issues = [];
        const flagged = new Set();
        const add = (el, severity, [message, detail]) => {
            issues.push({ el, severity, message, detail });
            flagged.add(el);
        };

        const stops = [];
        document.body.querySelectorAll(FOCUSABLE).forEach((el, index) => {
            if (el.tabIndex < 0 || el.matches(':disabled') || el.closest('[inert]')) return;
            if (!el.checkVisibility({ checkVisibilityCSS: true })) return;
            stops.push({ el, index, tabIndex: el.tabIndex });
        });

        // Positive tabindex comes first (lowest first), then everything else in page order.
        stops.sort((a, b) => {
            const pa = a.tabIndex > 0;
            const pb = b.tabIndex > 0;
            if (pa !== pb) return pa ? -1 : 1;
            if (pa && a.tabIndex !== b.tabIndex) return a.tabIndex - b.tabIndex;
            return a.index - b.index;
        });

        for (const { el, tabIndex } of stops) {
            if (hiddenFromAT(el)) {
                add(el, 'error', ['Focusable but hidden from screen readers', 'It\'s inside aria-hidden="true", so keyboard users land on something that isn\'t announced.']);
                continue;
            }
            if (el.matches(NEEDS_NAME) && !accessibleName(el)) add(el, 'error', unnamedMessage(el));
            if (tabIndex > 0) add(el, 'warning', [`tabindex="${tabIndex}"`, 'A positive tabindex moves this out of the natural order. Use 0 and reorder the HTML instead.']);
        }

        // Looks interactive but can't be reached with Tab.
        for (const el of document.body.querySelectorAll(`${TABBABLE_ROLES}, [onclick]`)) {
            if (el.tabIndex >= 0 || el.matches(':disabled, [aria-disabled="true"]') || hiddenFromAT(el)) continue;
            if (el.closest('[inert]') || !el.checkVisibility({ checkVisibilityCSS: true })) continue;
            // Native controls inside, e.g. <li onclick><a href>, are reachable already.
            if (el.querySelector(FOCUSABLE)) continue;
            const role = el.getAttribute('role');
            add(el, 'warning', role
                ? [`role="${role}" isn't keyboard focusable`, 'Add tabindex="0" and key handling, or use a native element.']
                : ['Click handler on a non-focusable element', 'Keyboard users can\'t trigger it. Use a <button> or <a href>.']);
        }

        const order = { error: 0, warning: 1 };
        issues.sort((a, b) => order[a.severity] - order[b.severity]);
        stops.forEach((stop) => { stop.issue = flagged.has(stop.el); });
        return { stops, issues };
    }

    // ---- Scanning ----

    function scan() {
        scanTimer = 0;
        if (!panel) return;

        styleCache = new Map();
        backgroundCache = new Map();
        opacityCache = new Map();
        const start = performance.now();
        try {
            results = {
                contrast: scanContrast(),
                images: scanImages(),
                headings: scanHeadings(),
                keyboard: scanKeyboard()
            };
            results.ms = Math.round(performance.now() - start);
        } catch (err) {
            console.warn('Develobar accessibility: scan failed.', err);
            results = null;
            panel.querySelector('.a11y-body').innerHTML = '<div class="a11y-empty">Couldn\'t scan this page. See the console for details.</div>';
            return;
        } finally {
            styleCache = backgroundCache = opacityCache = null;
        }

        buildBadges();
        renderPanel();
        schedule();
    }

    function startScan() {
        if (!panel) return;
        results = null;
        highlighted = null;
        panel.querySelector('.a11y-body').innerHTML = '<div class="a11y-empty">Scanning…</div>';
        panel.querySelector('.a11y-foot span').textContent = '';
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, 30); // let "Scanning…" paint first
        schedule();
    }

    // ---- Panel ----

    function buildPanel() {
        panel = Develobar.getPanel('accessibility');
        if (!panel) return;

        panel.innerHTML = `
            <div class="a11y-tabs">
                ${TABS.map((t) => `<button data-a11y-tab="${t.id}">${t.label} <span class="a11y-count"></span></button>`).join('')}
            </div>
            <div class="a11y-body"></div>
            <div class="a11y-foot">
                <span></span>
                <button data-a11y-action="rescan">Re-scan</button>
            </div>
        `;
        panel.onclick = onPanelClick;
        panel.oninput = onPanelInput;
        panel.onchange = onPanelChange;
        // Keep typing in the checker from triggering the page's keyboard shortcuts.
        panel.onkeydown = (e) => e.stopPropagation();

        Develobar.openPanel('accessibility');
        fitPanel();
    }

    // The panel hangs from its button; slide it left if it would run off the right of the screen.
    function fitPanel() {
        if (!panel) return;
        panel.style.left = '';
        const r = panel.getBoundingClientRect();
        const overflow = r.right - (window.innerWidth - 10);
        if (overflow > 0) panel.style.left = `${-Math.min(overflow, r.left - 10)}px`;
    }

    function ref(elements, extra = {}) {
        refs.push({ els: elements, pos: 0, ...extra });
        return refs.length - 1;
    }

    function failingGroups() {
        return results.contrast.groups.filter((g) => !g.image && g.ratio < required(g.large));
    }

    function tabCounts() {
        const contrastFails = failingGroups().reduce((n, g) => n + g.els.length, 0);
        const imageIssues = results.images.issues;
        const keyboardIssues = results.keyboard.issues;
        const severity = (issues) => (issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : 'ok');
        return {
            contrast: { count: contrastFails, severity: contrastFails ? 'error' : 'ok' },
            images: { count: imageIssues.length, severity: severity(imageIssues) },
            headings: {
                count: results.headings.issueCount,
                severity: severity([...results.headings.pageIssues, ...results.headings.headings.flatMap((h) => h.issues)])
            },
            keyboard: { count: keyboardIssues.length, severity: severity(keyboardIssues) }
        };
    }

    function renderPanel() {
        if (!panel || !results) return;
        refs = [];

        const counts = tabCounts();
        panel.querySelectorAll('[data-a11y-tab]').forEach((button) => {
            const { count, severity } = counts[button.dataset.a11yTab];
            button.classList.toggle('active', button.dataset.a11yTab === tab);
            const badge = button.querySelector('.a11y-count');
            badge.textContent = count || '✓';
            badge.className = `a11y-count ${severity}`;
        });

        const render = { contrast: renderContrast, images: renderImages, headings: renderHeadings, keyboard: renderKeyboard }[tab];
        const body = panel.querySelector('.a11y-body');
        body.innerHTML = render();
        body.scrollTop = 0;
        if (tab === 'contrast') updateChecker();

        panel.querySelector('.a11y-foot span').textContent = `Scanned in ${results.ms} ms`;
    }

    function issueRow(issue, elements = [issue.el]) {
        return `
            <button class="a11y-row" data-ref="${ref(elements)}">
                <span class="a11y-sev ${issue.severity}"></span>
                <span class="a11y-main">
                    <span class="a11y-msg">${esc(issue.message)}</span>
                    ${issue.detail ? `<span class="a11y-detail">${esc(issue.detail)}</span>` : ''}
                    ${elements[0] ? `<code class="a11y-el">${esc(describe(elements[0]))}</code>` : ''}
                </span>
                <span class="a11y-pos"></span>
            </button>
        `;
    }

    function moreNote(total) {
        return total > MAX_ROWS ? `<div class="a11y-note">…and ${total - MAX_ROWS} more.</div>` : '';
    }

    function renderContrast() {
        const failing = failingGroups();
        const review = results.contrast.groups.filter((g) => g.image);
        const elementCount = failing.reduce((n, g) => n + g.els.length, 0);

        const groupRow = (g) => {
            const need = required(g.large);
            const pass = g.ratio >= need;
            return `
                <button class="a11y-row" data-ref="${ref(g.els, { colours: { fg: g.fg, bg: g.bg } })}">
                    <span class="a11y-preview" style="color: ${g.fg}; background: ${g.bg};">Aa</span>
                    <span class="a11y-main">
                        <span class="a11y-msg">
                            ${g.image ? '~' : ''}${formatRatio(g.ratio)}
                            <span class="a11y-need ${pass ? 'pass' : 'fail'}">needs ${need}${g.large ? ' · large text' : ''}</span>
                        </span>
                        <span class="a11y-detail">${g.fg} on ${g.bg}${g.image ? ' + image/gradient' : ''} · ${g.els.length} element${g.els.length === 1 ? '' : 's'}</span>
                        <span class="a11y-detail a11y-sample">${esc(sampleText(g.els[0]))}</span>
                    </span>
                    <span class="a11y-pos"></span>
                </button>
            `;
        };

        return `
            <div class="a11y-checker">
                <label class="a11y-colour" title="Text colour">
                    <input type="color" data-a11y-colour="fg">
                    <input type="text" data-a11y-hex="fg" spellcheck="false" maxlength="7">
                </label>
                <span class="a11y-on">on</span>
                <label class="a11y-colour" title="Background colour">
                    <input type="color" data-a11y-colour="bg">
                    <input type="text" data-a11y-hex="bg" spellcheck="false" maxlength="7">
                </label>
                <button class="a11y-swap" data-a11y-action="swap" title="Swap colours">⇄</button>
                <div class="a11y-result">
                    <span class="a11y-preview a11y-checker-preview">Aa</span>
                    <strong class="a11y-ratio"></strong>
                    <div class="a11y-grades">
                        ${['AA', 'AAA'].flatMap((lvl) => ['normal', 'large'].map((size) => `
                            <span class="a11y-grade" data-level="${lvl}" data-size="${size}">${lvl} ${size}</span>
                        `)).join('')}
                    </div>
                </div>
            </div>

            <div class="a11y-levels">
                Check page text against
                ${['AA', 'AAA'].map((lvl) => `<button data-a11y-level="${lvl}" class="${lvl === level ? 'active' : ''}">${lvl}</button>`).join('')}
            </div>

            ${failing.length ? `
                <div class="a11y-section">${elementCount} element${elementCount === 1 ? '' : 's'} fail ${level}, in ${failing.length} colour pair${failing.length === 1 ? '' : 's'}</div>
                ${failing.slice(0, MAX_ROWS).map(groupRow).join('')}
                ${moreNote(failing.length)}
            ` : `<div class="a11y-empty">✓ All text passes ${level}.</div>`}

            ${review.length ? `
                <div class="a11y-section">Over images or gradients: check by eye (${review.length})</div>
                ${review.slice(0, MAX_ROWS).map(groupRow).join('')}
                ${moreNote(review.length)}
            ` : ''}

            ${results.contrast.truncated ? `<div class="a11y-note">Very long page: only the first ${MAX_TEXT_ELEMENTS} text elements were checked.</div>` : ''}
            <div class="a11y-note">Text placed over other elements (not its ancestors) may be scored against the wrong background.</div>
        `;
    }

    function renderImages() {
        const { issues, total, decorative } = results.images;
        const row = (issue) => {
            const src = issue.el.localName === 'img' ? issue.el.currentSrc || issue.el.src : '';
            return issueRow(issue).replace('<span class="a11y-main">',
                `${src ? `<img class="a11y-thumb" src="${esc(src)}" alt="">` : ''}<span class="a11y-main">`);
        };

        return `
            <div class="a11y-note">${total} image${total === 1 ? '' : 's'} · ${decorative} marked decorative (alt="")</div>
            ${issues.length ? `
                ${issues.slice(0, MAX_ROWS).map(row).join('')}
                ${moreNote(issues.length)}
            ` : '<div class="a11y-empty">✓ No image problems found.</div>'}
            <div class="a11y-note">CSS background images aren't checked. Decorative images should have alt="".</div>
        `;
    }

    function renderHeadings() {
        const { headings, pageIssues } = results.headings;

        const headingRow = (h) => `
            <button class="a11y-row a11y-heading" style="padding-left: ${8 + (Math.min(h.level, 6) - 1) * 14}px;" data-ref="${ref([h.el])}">
                <span class="a11y-level">H${h.level}</span>
                <span class="a11y-main">
                    <span class="a11y-msg">${h.text ? esc(truncate(h.text, 90)) : '<em>(empty)</em>'}</span>
                    ${h.issues.map((i) => `<span class="a11y-issue ${i.severity}">${esc(i.message)}</span>`).join('')}
                </span>
                <span class="a11y-pos"></span>
            </button>
        `;

        return `
            ${pageIssues.map((issue) => issueRow(issue, issue.els || [])).join('')}
            ${headings.length ? `
                <div class="a11y-section">Outline (${headings.length} heading${headings.length === 1 ? '' : 's'})</div>
                ${headings.slice(0, MAX_ROWS).map(headingRow).join('')}
                ${moreNote(headings.length)}
            ` : '<div class="a11y-empty">No headings on this page.</div>'}
        `;
    }

    function renderKeyboard() {
        const { stops, issues } = results.keyboard;

        const stopRow = (stop, i) => {
            const name = accessibleName(stop.el);
            return `
                <button class="a11y-row" data-ref="${ref([stop.el])}">
                    <span class="a11y-num ${stop.issue ? 'issue' : ''}">${i + 1}</span>
                    <span class="a11y-main">
                        <span class="a11y-msg">${name ? esc(truncate(name, 80)) : '<em>(no name)</em>'}</span>
                        <code class="a11y-el">${esc(describe(stop.el))}${stop.tabIndex > 0 ? ` · tabindex=${stop.tabIndex}` : ''}</code>
                    </span>
                    <span class="a11y-pos"></span>
                </button>
            `;
        };

        return `
            <label class="a11y-toggle">
                <input type="checkbox" data-a11y-action="order" ${showOrder ? 'checked' : ''}>
                Show tab order on the page
            </label>
            <div class="a11y-note">Then press Tab through the page and check each stop has a clearly visible focus style.</div>

            ${issues.length ? `
                <div class="a11y-section">Issues (${issues.length})</div>
                ${issues.slice(0, MAX_ROWS).map((issue) => issueRow(issue)).join('')}
                ${moreNote(issues.length)}
            ` : '<div class="a11y-empty">✓ No keyboard problems found.</div>'}

            <div class="a11y-section">Tab order (${stops.length} stop${stops.length === 1 ? '' : 's'})</div>
            ${stops.slice(0, MAX_ROWS).map(stopRow).join('')}
            ${moreNote(stops.length)}
        `;
    }

    // Manual checker: sync inputs (except the one being typed in) and results.
    function updateChecker(editing) {
        if (!panel) return;
        const box = panel.querySelector('.a11y-checker');
        if (!box) return;

        for (const which of ['fg', 'bg']) {
            for (const input of box.querySelectorAll(`[data-a11y-colour="${which}"], [data-a11y-hex="${which}"]`)) {
                if (input !== editing) input.value = input.type === 'color' ? checker[which].toLowerCase() : checker[which];
            }
        }

        const ratio = contrast(fromHex(checker.fg), fromHex(checker.bg));
        const preview = box.querySelector('.a11y-checker-preview');
        preview.style.color = checker.fg;
        preview.style.background = checker.bg;
        box.querySelector('.a11y-ratio').textContent = formatRatio(ratio);
        box.querySelectorAll('.a11y-grade').forEach((grade) => {
            const pass = ratio >= required(grade.dataset.size === 'large', grade.dataset.level);
            grade.classList.toggle('pass', pass);
            grade.classList.toggle('fail', !pass);
        });
    }

    function onPanelClick(e) {
        const button = e.target.closest('button');
        if (!button || !results) {
            if (button?.dataset.a11yAction === 'rescan') startScan();
            return;
        }

        if (button.dataset.a11yTab) {
            tab = button.dataset.a11yTab;
            renderPanel();
            return;
        }
        if (button.dataset.a11yLevel) {
            level = button.dataset.a11yLevel;
            renderPanel();
            return;
        }

        const action = button.dataset.a11yAction;
        if (action === 'rescan') {
            startScan();
            return;
        }
        if (action === 'swap') {
            [checker.fg, checker.bg] = [checker.bg, checker.fg];
            updateChecker();
            return;
        }

        const entry = refs[Number(button.dataset.ref)];
        if (!entry) return;

        if (entry.colours) {
            Object.assign(checker, entry.colours);
            updateChecker();
        }

        const live = entry.els.filter((el) => el.isConnected);
        const pos = button.querySelector('.a11y-pos');
        if (!live.length) {
            if (pos) pos.textContent = entry.els.length ? 'Gone, re-scan' : '';
            return;
        }

        const index = entry.pos % live.length;
        entry.pos = index + 1;
        if (pos && live.length > 1) pos.textContent = `${index + 1} / ${live.length}`;
        highlight(live[index]);
    }

    function onPanelInput(e) {
        const input = e.target;
        const which = input.dataset.a11yColour || input.dataset.a11yHex;
        if (!which) return;
        const colour = fromHex(input.value);
        if (!colour) return; // part-typed hex
        checker[which] = toHex(colour);
        updateChecker(input);
    }

    function onPanelChange(e) {
        if (e.target.dataset.a11yAction === 'order') {
            showOrder = e.target.checked;
            schedule();
        } else if (e.target.dataset.a11yHex) {
            updateChecker(); // tidy up an invalid or shorthand hex once the user leaves the field
        }
    }

    // ---- Overlay ----

    function highlight(el) {
        highlighted = el;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        // Restart the pulse.
        els.highlight.style.animation = 'none';
        void els.highlight.offsetWidth;
        els.highlight.style.animation = '';
        schedule();
    }

    function buildBadges() {
        if (!els) return;
        els.badges.replaceChildren();
        badges = (results?.keyboard.stops || []).map((stop, i) => {
            const node = document.createElement('div');
            node.className = `badge${stop.issue ? ' issue' : ''}`;
            node.textContent = i + 1;
            els.badges.append(node);
            return { el: stop.el, node };
        });
    }

    function schedule() {
        if (!frame) frame = requestAnimationFrame(draw);
    }

    function draw() {
        frame = 0;
        if (!els) return;

        const show = !!highlighted?.isConnected;
        els.highlight.hidden = els.tag.hidden = !show;
        if (show) {
            const r = highlighted.getBoundingClientRect();
            Object.assign(els.highlight.style, {
                left: `${r.left}px`,
                top: `${r.top}px`,
                width: `${r.width}px`,
                height: `${r.height}px`
            });
            els.tag.textContent = describe(highlighted);
            const top = r.top - 30 >= Develobar.BAR_HEIGHT ? r.top - 30 : r.bottom + 8;
            els.tag.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - els.tag.offsetWidth - 4))}px`;
            els.tag.style.top = `${top}px`;
        }

        els.svg.toggleAttribute('hidden', !showOrder);
        els.badges.hidden = !showOrder;
        if (!showOrder) return;

        // Badges sit on each stop's top-left corner, joined in tab order.
        const points = [];
        const focused = document.activeElement;
        for (const { el, node } of badges) {
            const r = el.isConnected ? el.getBoundingClientRect() : null;
            const hasBox = r && (r.width || r.height);
            const onScreen = hasBox && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
            node.hidden = !onScreen;
            node.classList.toggle('current', el === focused);
            if (!hasBox) continue;
            points.push(`${Math.round(r.left)},${Math.round(r.top)}`);
            if (onScreen) {
                node.style.left = `${Math.max(10, r.left)}px`;
                node.style.top = `${Math.max(Develobar.BAR_HEIGHT + 10, r.top)}px`;
            }
        }
        els.line.setAttribute('points', points.join(' '));
    }

    function onResize() {
        fitPanel();
        schedule();
    }

    Develobar.registerTool({
        id: 'accessibility',

        activate() {
            host = document.createElement('div');
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<style>${OVERLAY_CSS}</style>${OVERLAY_HTML}`;
            els = {
                svg: shadow.querySelector('svg'),
                line: shadow.querySelector('polyline'),
                badges: shadow.querySelector('.badges'),
                highlight: shadow.querySelector('.highlight'),
                tag: shadow.querySelector('.tag')
            };

            // Capture, so scrolling inside page containers moves the overlay too.
            window.addEventListener('scroll', schedule, { capture: true, passive: true });
            window.addEventListener('resize', onResize);
            document.addEventListener('focusin', schedule, true);

            document.documentElement.appendChild(host);
            buildPanel();
            startScan();
        },

        deactivate() {
            window.removeEventListener('scroll', schedule, { capture: true });
            window.removeEventListener('resize', onResize);
            document.removeEventListener('focusin', schedule, true);
            clearTimeout(scanTimer);
            cancelAnimationFrame(frame);
            host?.remove();
            panel?.closest('.dropdown')?.classList.remove('open');
            host = els = panel = results = highlighted = null;
            refs = [];
            badges = [];
            frame = scanTimer = 0;
        }
    });
})();
