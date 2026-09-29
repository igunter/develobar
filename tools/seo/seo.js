// SEO tool. Opens a modal with five tabs:
//  - Overview: a search result preview and a checklist (title, description, canonical, indexing,
//    headings, alt text, links, language, viewport, social tags, structured data).
//  - Meta: every <title>, <meta> and <link> in the head.
//  - Social: Open Graph and Twitter card tags, with a share card preview.
//  - Structured data: JSON-LD and microdata, as a collapsible tree with the schema types found.
//  - Indexing: robots meta, the page's HTTP status and X-Robots-Tag header, whether robots.txt
//    blocks the page for Googlebot, sitemaps, canonical and hreflang.
// The status/header and robots.txt lookups are same-origin requests made from the page; nothing
// is sent anywhere else unless the user clicks one of the external checker links.

(() => {
    const { Develobar } = window;

    const TITLE_MAX_PX = 580;  // roughly where Google truncates a desktop title (20px Arial)
    const TITLE_MIN_CHARS = 30;
    const DESC_MIN_CHARS = 70;
    const DESC_MAX_CHARS = 160;

    const TABS = [
        { id: 'overview', label: 'Overview' },
        { id: 'meta', label: 'Meta tags' },
        { id: 'social', label: 'Social' },
        { id: 'schema', label: 'Structured data' },
        { id: 'indexing', label: 'Indexing' }
    ];

    const LOOKUPS = [
        { label: 'Rich Results Test', url: (u) => `https://search.google.com/test/rich-results?url=${encodeURIComponent(u)}` },
        { label: 'Schema Validator', url: (u) => `https://validator.schema.org/#url=${encodeURIComponent(u)}` },
        { label: 'PageSpeed Insights', url: (u) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(u)}` }
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
            width: min(920px, calc(100vw - 32px));
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

        header .url {
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

        nav {
            display: flex;
            gap: 2px;
            padding: 6px 12px 0;
            border-bottom: 1px solid #3f3f46;
        }

        nav button {
            height: 32px;
            border-radius: 5px 5px 0 0;
            background: transparent;
            color: #a1a1aa;
        }

        nav button.active {
            background: #27272a;
            color: #fff;
            box-shadow: inset 0 -2px 0 #2563eb;
        }

        .count {
            margin-left: 4px;
            padding: 0 6px;
            border-radius: 8px;
            background: #3f3f46;
            color: #e4e4e7;
            font-size: 11px;
        }

        .count.fail { background: #dc2626; color: #fff; }
        .count.warn { background: #d97706; color: #fff; }

        main {
            flex: 1;
            min-height: 200px;
            padding: 12px;
            overflow: auto;
        }

        footer {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px 14px;
            padding: 8px 12px;
            border-top: 1px solid #3f3f46;
            color: #71717a;
            font-size: 12px;
        }

        a {
            color: #60a5fa;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        h3 {
            margin: 18px 0 6px;
            color: #a1a1aa;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        h3:first-child {
            margin-top: 0;
        }

        .muted {
            color: #71717a;
        }

        .empty {
            padding: 20px;
            color: #a1a1aa;
            text-align: center;
        }

        code, .mono {
            font-family: Consolas, Menlo, monospace;
            font-size: 12px;
        }

        /* Checklist */

        .summary {
            display: flex;
            gap: 14px;
            margin: 12px 0 4px;
            color: #a1a1aa;
        }

        .check {
            display: grid;
            grid-template-columns: 20px 170px 1fr;
            gap: 10px;
            padding: 7px 4px;
            border-bottom: 1px solid #27272a;
        }

        .check .label {
            color: #fff;
        }

        .check .value {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .check .detail {
            display: block;
            margin-top: 2px;
            color: #a1a1aa;
            font-size: 12px;
        }

        .icon {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            line-height: 18px;
            text-align: center;
        }

        .icon.pass { background: #16a34a; }
        .icon.warn { background: #d97706; }
        .icon.fail { background: #dc2626; }
        .icon.info { background: #3f3f46; }
        .icon.pending { background: transparent; border: 2px solid #3f3f46; }

        /* Search result preview */

        .serp {
            padding: 14px 16px;
            border-radius: 8px;
            background: #fff;
            font-family: Arial, sans-serif;
        }

        .serp .site {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
        }

        .serp .favicon {
            width: 26px;
            height: 26px;
            padding: 4px;
            border-radius: 50%;
            background: #f1f3f4;
            object-fit: contain;
        }

        .serp .name {
            color: #202124;
            font-size: 14px;
        }

        .serp .crumbs {
            color: #4d5156;
            font-size: 12px;
        }

        .serp .title {
            max-width: 600px;
            overflow: hidden;
            color: #1a0dab;
            font-size: 20px;
            line-height: 1.3;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .serp .desc {
            display: -webkit-box;
            max-width: 600px;
            margin-top: 3px;
            overflow: hidden;
            color: #4d5156;
            font-size: 14px;
            line-height: 1.58;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        /* Tables */

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 6px 8px;
            border-bottom: 1px solid #27272a;
            text-align: left;
            vertical-align: top;
        }

        th {
            color: #a1a1aa;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
        }

        td:first-child {
            width: 30%;
            color: #fff;
        }

        td {
            overflow-wrap: anywhere;
        }

        .missing td {
            color: #fbbf24;
        }

        .toolbar-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
        }

        /* Social card */

        .cards {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
        }

        .card {
            width: 420px;
            max-width: 100%;
            overflow: hidden;
            border: 1px solid #3f3f46;
            border-radius: 10px;
            background: #fff;
            color: #0f1419;
        }

        .card .image {
            display: block;
            width: 100%;
            aspect-ratio: 1.91 / 1;
            object-fit: cover;
            background: #e4e4e7;
        }

        .card .noimage {
            display: flex;
            align-items: center;
            justify-content: center;
            aspect-ratio: 1.91 / 1;
            background: #e4e4e7;
            color: #71717a;
        }

        .card .text {
            padding: 10px 12px;
            background: #f0f2f5;
        }

        .card .domain {
            color: #65676b;
            font-size: 12px;
            text-transform: uppercase;
        }

        .card .ctitle {
            margin-top: 2px;
            overflow: hidden;
            font-size: 16px;
            font-weight: 700;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .card .cdesc {
            display: -webkit-box;
            overflow: hidden;
            color: #65676b;
            font-size: 14px;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
        }

        .card-label {
            margin-bottom: 6px;
            color: #a1a1aa;
            font-size: 12px;
        }

        /* Structured data */

        .block {
            margin-bottom: 12px;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            overflow: hidden;
        }

        .block-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            background: #27272a;
        }

        .block-head .types {
            flex: 1;
            min-width: 0;
        }

        .type {
            display: inline-block;
            margin: 1px 4px 1px 0;
            padding: 1px 7px;
            border-radius: 10px;
            background: #1e3a8a;
            color: #fff;
            font-size: 12px;
        }

        .error {
            color: #f87171;
        }

        .tree {
            padding: 8px 10px;
            background: #09090b;
            font-family: Consolas, Menlo, monospace;
            font-size: 12px;
            user-select: text;
        }

        .tree details > .kids {
            margin-left: 7px;
            padding-left: 12px;
            border-left: 1px solid #27272a;
        }

        .tree summary {
            cursor: pointer;
        }

        .tree .k { color: #93c5fd; }
        .tree .s { color: #86efac; }
        .tree .n { color: #fca5a5; }
        .tree .b { color: #71717a; }
        .tree .t { color: #fbbf24; }

        pre {
            max-height: 240px;
            margin: 0;
            padding: 8px 10px;
            overflow: auto;
            background: #09090b;
            font-family: Consolas, Menlo, monospace;
            font-size: 12px;
            white-space: pre-wrap;
        }

        [hidden] {
            display: none !important;
        }
    `;

    const HTML = `
        <div class="backdrop"></div>
        <div class="dialog" role="dialog" aria-modal="true" aria-label="SEO" tabindex="-1">
            <header>
                <div class="heading">
                    <strong>SEO</strong>
                    <span class="url"></span>
                </div>
                <button data-action="refresh" title="Read the page again">Refresh</button>
                <button class="close" data-action="close" title="Close (Esc)" aria-label="Close">×</button>
            </header>
            <nav>
                ${TABS.map((t) => `<button data-tab="${t.id}">${t.label}<span class="count" hidden></span></button>`).join('')}
            </nav>
            <main></main>
            <footer>
                Check with:
                ${LOOKUPS.map((l, i) => `<a data-lookup="${i}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('')}
            </footer>
        </div>
    `;

    let host = null;
    let root = null;
    let data = null;
    let tab = 'overview';
    let generation = 0; // ignores lookups that finish after a refresh or close
    let copies = [];    // text for data-copy buttons in the current render

    // ---- Helpers ----

    function esc(text) {
        return String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    }

    function plural(n, word, many = `${word}s`) {
        return `${n} ${n === 1 ? word : many}`;
    }

    function metaContent(key) {
        const el = document.querySelector(`meta[name="${key}" i], meta[property="${key}" i]`);
        return el ? (el.getAttribute('content') ?? '').trim() : null;
    }

    function absolute(url) {
        try {
            return new URL(url, document.baseURI).href;
        } catch {
            return url;
        }
    }

    function withoutHash(url) {
        return url.replace(/#.*$/, '');
    }

    let measureContext = null;
    function textWidth(text, font) {
        if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
        measureContext.font = font;
        return Math.round(measureContext.measureText(text).width);
    }

    function isWebPage() {
        return location.protocol === 'http:' || location.protocol === 'https:';
    }

    // ---- Reading the page ----

    function readJsonLd() {
        return [...document.querySelectorAll('script[type="application/ld+json" i]')].map((script) => {
            const text = script.textContent.trim();
            try {
                return { json: JSON.parse(text), text };
            } catch (err) {
                return { error: err.message, text };
            }
        });
    }

    function collectTypes(value, found = new Set()) {
        if (Array.isArray(value)) {
            value.forEach((v) => collectTypes(v, found));
        } else if (value && typeof value === 'object') {
            // Microdata itemtypes are full URLs; show them like JSON-LD types.
            [].concat(value['@type'] || []).forEach((t) => found.add(String(t).replace(/^https?:\/\/schema\.org\//i, '')));
            Object.values(value).forEach((v) => collectTypes(v, found));
        }
        return found;
    }

    function microdataValue(el) {
        const tag = el.localName;
        if (tag === 'meta') return el.getAttribute('content') ?? '';
        if (['audio', 'embed', 'iframe', 'img', 'source', 'track', 'video'].includes(tag)) return el.src || el.getAttribute('src') || '';
        if (['a', 'area', 'link'].includes(tag)) return el.href || el.getAttribute('href') || '';
        if (tag === 'object') return el.data || '';
        if (tag === 'data' || tag === 'meter') return el.getAttribute('value') ?? '';
        if (tag === 'time') return el.getAttribute('datetime') || el.textContent.trim();
        return el.textContent.replace(/\s+/g, ' ').trim();
    }

    // A microdata item as a JSON-LD-like object, so it can use the same tree view.
    function microdataItem(scope) {
        const item = { '@type': scope.getAttribute('itemtype') || '(no itemtype)' };
        for (const el of scope.querySelectorAll('[itemprop]')) {
            if (el.parentElement.closest('[itemscope]') !== scope) continue; // belongs to a nested item
            const value = el.hasAttribute('itemscope') ? microdataItem(el) : microdataValue(el);
            for (const name of el.getAttribute('itemprop').trim().split(/\s+/)) {
                item[name] = name in item ? [].concat(item[name], value) : value;
            }
        }
        return item;
    }

    function readLinks() {
        const counts = { internal: 0, external: 0, nofollow: 0 };
        for (const a of document.body.querySelectorAll('a[href]')) {
            let url;
            try {
                url = new URL(a.href);
            } catch {
                continue;
            }
            if (!/^https?:$/.test(url.protocol)) continue;
            if (url.hostname === location.hostname) counts.internal++;
            else counts.external++;
            if (/\b(nofollow|ugc|sponsored)\b/i.test(a.rel)) counts.nofollow++;
        }
        return counts;
    }

    function read() {
        const titles = [...document.querySelectorAll('title')].filter((t) => !t.closest('svg'));
        const title = document.title.trim();
        const descriptions = document.querySelectorAll('meta[name="description" i]');
        const images = [...document.body.querySelectorAll('img')];

        return {
            url: withoutHash(location.href),
            title,
            titleCount: titles.length,
            titlePx: textWidth(title, '20px Arial'),
            description: metaContent('description'),
            descriptionCount: descriptions.length,
            robots: metaContent('robots'),
            googlebot: metaContent('googlebot'),
            canonicals: [...document.querySelectorAll('link[rel~="canonical" i]')].map((l) => ({
                raw: l.getAttribute('href') || '',
                href: l.href
            })),
            hreflang: [...document.querySelectorAll('link[rel~="alternate" i][hreflang]')].map((l) => ({
                lang: l.getAttribute('hreflang'),
                href: l.href
            })),
            lang: document.documentElement.getAttribute('lang'),
            viewport: metaContent('viewport'),
            charset: document.querySelector('meta[charset], meta[http-equiv="content-type" i]') ? document.characterSet : null,
            favicon: document.querySelector('link[rel~="icon" i]')?.href || null,
            h1s: [...document.body.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
            words: (document.body.innerText.match(/\S+/g) || []).length,
            images: images.length,
            imagesNoAlt: images.filter((img) => !img.hasAttribute('alt')).length,
            links: readLinks(),
            og: [...document.querySelectorAll('meta[property^="og:" i], meta[name^="og:" i]')].map((m) => ({
                key: (m.getAttribute('property') || m.getAttribute('name')).toLowerCase(),
                value: m.getAttribute('content') ?? ''
            })),
            twitter: [...document.querySelectorAll('meta[name^="twitter:" i], meta[property^="twitter:" i]')].map((m) => ({
                key: (m.getAttribute('name') || m.getAttribute('property')).toLowerCase(),
                value: m.getAttribute('content') ?? ''
            })),
            jsonLd: readJsonLd(),
            microdata: [...document.querySelectorAll('[itemscope]:not([itemprop])')].map(microdataItem),
            head: [...document.head.querySelectorAll('title, meta, link, base')],
            http: { state: 'pending' },
            robotsTxt: { state: 'pending' }
        };
    }

    // ---- Lookups (same-origin) ----

    async function lookUpHeaders() {
        if (!isWebPage()) return { state: 'skipped' };
        try {
            let res = await fetch(location.href, { method: 'HEAD', credentials: 'include', cache: 'no-store' });
            if (res.status === 405 || res.status === 501) {
                res = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
            }
            const link = res.headers.get('link') || '';
            const canonical = link.match(/<([^>]+)>\s*;[^,]*rel="?canonical"?/i)?.[1] || null;
            return {
                state: 'done',
                status: res.status,
                redirected: res.redirected,
                finalUrl: res.url,
                robotsTag: res.headers.get('x-robots-tag'),
                canonical: canonical && absolute(canonical),
                contentType: res.headers.get('content-type')
            };
        } catch (err) {
            return { state: 'error', error: err.message };
        }
    }

    function parseRobots(text) {
        const groups = [];
        const sitemaps = [];
        let current = null;
        let lastWasAgent = false;

        for (const raw of text.split(/\r?\n/)) {
            const line = raw.replace(/#.*/, '').trim();
            const colon = line.indexOf(':');
            if (colon < 1) continue;
            const field = line.slice(0, colon).trim().toLowerCase();
            const value = line.slice(colon + 1).trim();

            if (field === 'sitemap') {
                if (value) sitemaps.push(value);
            } else if (field === 'user-agent') {
                // Consecutive user-agent lines share one group of rules.
                if (!lastWasAgent) {
                    current = { agents: [], rules: [] };
                    groups.push(current);
                }
                current.agents.push(value.toLowerCase());
                lastWasAgent = true;
                continue;
            } else if ((field === 'allow' || field === 'disallow') && current) {
                current.rules.push({ allow: field === 'allow', path: value });
            }
            lastWasAgent = false;
        }
        return { groups, sitemaps };
    }

    // Supports * wildcards and a trailing $ anchor, as Google does.
    function robotsPatternMatches(pattern, path) {
        const anchored = pattern.endsWith('$');
        const body = (anchored ? pattern.slice(0, -1) : pattern)
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
    }

    // Googlebot's own group if there is one, otherwise *. The longest matching rule wins,
    // with Allow winning a tie.
    function robotsVerdict(parsed, path) {
        let agent = 'Googlebot';
        let groups = parsed.groups.filter((g) => g.agents.includes('googlebot'));
        if (!groups.length) {
            agent = '*';
            groups = parsed.groups.filter((g) => g.agents.includes('*'));
        }
        if (!groups.length) return { allowed: true, agent: null, rule: null };

        let best = null;
        for (const rule of groups.flatMap((g) => g.rules)) {
            if (!rule.path || !robotsPatternMatches(rule.path, path)) continue; // empty Disallow allows everything
            if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
                best = rule;
            }
        }
        return { allowed: !best || best.allow, agent, rule: best };
    }

    async function lookUpRobotsTxt() {
        if (!isWebPage()) return { state: 'skipped' };
        const url = `${location.origin}/robots.txt`;
        try {
            const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
            if (res.status === 404 || res.status === 410) return { state: 'missing', url };
            if (!res.ok) return { state: 'error', url, error: `HTTP ${res.status}` };
            const text = await res.text();
            const parsed = parseRobots(text);
            return {
                state: 'done',
                url,
                sitemaps: parsed.sitemaps,
                verdict: robotsVerdict(parsed, location.pathname + location.search)
            };
        } catch (err) {
            return { state: 'error', url, error: err.message };
        }
    }

    // ---- Checks ----

    function directives(value) {
        return (value || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
    }

    function checks(d) {
        const groups = [];
        const group = (name) => {
            const items = [];
            groups.push({ name, items });
            return (status, label, value, detail) => items.push({ status, label, value, detail });
        };

        // Title & description
        let add = group('Title & description');
        if (!d.title) {
            add('fail', 'Title', 'Missing', 'Every page needs a unique <title>.');
        } else {
            const value = `${d.title} (${plural(d.title.length, 'character')}, ${d.titlePx}px)`;
            if (d.titlePx > TITLE_MAX_PX) add('warn', 'Title', value, `Likely to be cut off in search results (about ${TITLE_MAX_PX}px fits).`);
            else if (d.title.length < TITLE_MIN_CHARS) add('warn', 'Title', value, 'Quite short. Room to add descriptive keywords.');
            else add('pass', 'Title', value);
        }
        if (d.titleCount > 1) add('warn', 'Title tags', `${d.titleCount} <title> elements`, 'Only the first one is used.');

        if (d.description === null) {
            add('warn', 'Meta description', 'Missing', 'Search engines will pick a snippet from the page text instead.');
        } else {
            const len = d.description.length;
            const value = `${d.description || '(empty)'} (${plural(len, 'character')})`;
            if (len < DESC_MIN_CHARS) add('warn', 'Meta description', value, `Short. Aim for ${DESC_MIN_CHARS}–${DESC_MAX_CHARS} characters.`);
            else if (len > DESC_MAX_CHARS) add('warn', 'Meta description', value, `Likely to be cut off after about ${DESC_MAX_CHARS} characters.`);
            else add('pass', 'Meta description', value);
        }
        if (d.descriptionCount > 1) add('warn', 'Description tags', `${d.descriptionCount} meta descriptions`, 'Keep just one.');

        // Indexing
        add = group('Indexing');
        const robots = [...directives(d.robots), ...directives(d.googlebot)];
        if (robots.includes('noindex') || robots.includes('none')) {
            add('fail', 'Robots meta', d.googlebot ? `robots: ${d.robots ?? '–'} · googlebot: ${d.googlebot}` : d.robots, 'noindex: this page won\'t appear in search results.');
        } else if (robots.includes('nofollow')) {
            add('warn', 'Robots meta', d.robots || d.googlebot, 'nofollow: links on this page won\'t pass signals.');
        } else {
            add('pass', 'Robots meta', d.robots || 'Not set (index, follow)');
        }

        if (d.http.state === 'pending') {
            add('pending', 'HTTP response', 'Checking…');
        } else if (d.http.state === 'done') {
            const tag = directives(d.http.robotsTag);
            if (tag.includes('noindex') || tag.includes('none')) add('fail', 'X-Robots-Tag', d.http.robotsTag, 'The server tells search engines not to index this page.');
            else if (d.http.robotsTag) add('info', 'X-Robots-Tag', d.http.robotsTag);

            if (d.http.status >= 400) add('fail', 'HTTP status', String(d.http.status), 'Error pages aren\'t indexed.');
            else if (d.http.redirected) add('warn', 'HTTP status', `Redirects to ${d.http.finalUrl}`, 'Link to the final URL directly.');
            else add('pass', 'HTTP status', String(d.http.status));
        } else if (d.http.state === 'error') {
            add('info', 'HTTP response', 'Couldn\'t check', d.http.error);
        }

        const r = d.robotsTxt;
        if (r.state === 'pending') add('pending', 'robots.txt', 'Checking…');
        else if (r.state === 'missing') add('info', 'robots.txt', 'Not found', 'Everything may be crawled.');
        else if (r.state === 'error') add('info', 'robots.txt', 'Couldn\'t check', r.error);
        else if (r.state === 'done') {
            if (r.verdict.allowed) add('pass', 'robots.txt', r.verdict.rule ? `Allowed by "Allow: ${r.verdict.rule.path}"` : 'Crawling allowed');
            else add('fail', 'robots.txt', `Blocked by "Disallow: ${r.verdict.rule.path}" (${r.verdict.agent})`, 'Search engines can\'t crawl this page.');
        }

        if (!d.canonicals.length && !d.http.canonical) {
            add('warn', 'Canonical', 'Missing', 'Add <link rel="canonical"> so duplicate URLs point to one version.');
        } else if (d.canonicals.length > 1) {
            add('fail', 'Canonical', `${d.canonicals.length} canonical tags`, 'Conflicting canonicals are ignored. Keep one.');
        } else {
            const c = d.canonicals[0];
            const href = c ? c.href : d.http.canonical;
            if (withoutHash(href) === d.url) add('pass', 'Canonical', `${href} (this page)`);
            else add('warn', 'Canonical', href, 'Points to a different URL, so this page may not be indexed itself.');
            if (c && !/^https?:\/\//i.test(c.raw)) add('warn', 'Canonical URL', c.raw, 'Use an absolute URL.');
        }

        // Content
        add = group('Content');
        if (!d.h1s.length) add('fail', 'H1', 'Missing', 'Give the page one h1 describing its topic.');
        else if (d.h1s.length > 1) add('warn', 'H1', `${d.h1s.length} h1 headings: ${d.h1s.map((h) => `"${h}"`).join(', ')}`, 'One h1 is clearest.');
        else add(d.h1s[0] ? 'pass' : 'fail', 'H1', d.h1s[0] || '(empty)');

        add(d.words < 300 ? 'warn' : 'info', 'Word count', plural(d.words, 'word'), d.words < 300 ? 'Thin content can struggle to rank.' : '');

        if (!d.images) add('info', 'Image alt text', 'No images');
        else if (d.imagesNoAlt) add('warn', 'Image alt text', `${d.imagesNoAlt} of ${plural(d.images, 'image')} missing alt`);
        else add('pass', 'Image alt text', `All ${plural(d.images, 'image')} have alt`);

        add('info', 'Links', `${d.links.internal} internal · ${d.links.external} external · ${d.links.nofollow} nofollow/ugc/sponsored`);

        // Social & structured data
        add = group('Social & structured data');
        const og = Object.fromEntries(d.og.map((t) => [t.key, t.value]));
        const missingOg = ['og:title', 'og:description', 'og:image'].filter((k) => !og[k]);
        if (!missingOg.length) add('pass', 'Open Graph', 'Title, description and image set');
        else add('warn', 'Open Graph', `Missing ${missingOg.join(', ')}`, 'Shared links will look plain on social sites.');

        const card = d.twitter.find((t) => t.key === 'twitter:card');
        add(card ? 'pass' : 'info', 'Twitter card', card ? card.value : 'Not set', card ? '' : 'X falls back to Open Graph tags.');

        const invalid = d.jsonLd.filter((b) => b.error).length;
        const types = [...collectTypes([...d.jsonLd.map((b) => b.json), ...d.microdata])];
        if (invalid) add('fail', 'Structured data', `${plural(invalid, 'JSON-LD block')} with invalid JSON`, 'Search engines ignore blocks they can\'t parse.');
        if (types.length) add('pass', 'Structured data', types.join(', '));
        else if (!invalid) add('info', 'Structured data', 'None', 'Schema.org markup can earn rich results.');

        // Technical
        add = group('Technical');
        add(location.protocol === 'https:' ? 'pass' : 'fail', 'HTTPS', location.protocol === 'https:' ? 'Secure' : location.protocol.replace(':', ''));
        add(d.lang ? 'pass' : 'warn', 'Language', d.lang || 'No lang attribute on <html>');
        add(d.viewport ? 'pass' : 'warn', 'Viewport', d.viewport || 'Missing', d.viewport ? '' : 'Needed for mobile-friendly pages.');
        add(d.charset ? 'pass' : 'warn', 'Charset', d.charset || 'Not declared');
        add(d.favicon ? 'pass' : 'warn', 'Favicon', d.favicon || 'No <link rel="icon">');
        if (d.hreflang.length) {
            const hasDefault = d.hreflang.some((h) => h.lang.toLowerCase() === 'x-default');
            add(hasDefault ? 'pass' : 'info', 'hreflang', plural(d.hreflang.length, 'alternate'), hasDefault ? '' : 'No x-default alternate.');
        }

        return groups;
    }

    // ---- Rendering ----

    function copyButton(text, label = 'Copy') {
        copies.push(text);
        return `<button data-copy="${copies.length - 1}">${label}</button>`;
    }

    function tree(value, key, depth = 0) {
        const label = key !== undefined ? `<span class="k">${esc(key)}</span>: ` : '';
        if (value && typeof value === 'object') {
            const isArray = Array.isArray(value);
            const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
            const type = !isArray && value['@type'] ? ` <span class="t">${esc([].concat(value['@type']).join(', '))}</span>` : '';
            const size = isArray ? `[${entries.length}]` : `{${entries.length}}`;
            return `
                <details ${depth < 3 ? 'open' : ''}>
                    <summary>${label}<span class="b">${size}</span>${type}</summary>
                    <div class="kids">${entries.map(([k, v]) => tree(v, k, depth + 1)).join('')}</div>
                </details>
            `;
        }
        const shown = typeof value === 'string' ? `<span class="s">"${esc(value)}"</span>` : `<span class="n">${esc(String(value))}</span>`;
        return `<div>${label}${shown}</div>`;
    }

    function renderOverview(d) {
        const groups = checks(d);
        const all = groups.flatMap((g) => g.items);
        const count = (s) => all.filter((c) => c.status === s).length;

        let crumbs = location.hostname;
        const segments = location.pathname.split('/').filter(Boolean);
        if (segments.length) crumbs += ` › ${segments.map(decodeURIComponent).join(' › ')}`;
        const siteName = d.og.find((t) => t.key === 'og:site_name')?.value || location.hostname.replace(/^www\./, '');
        const favicon = d.favicon || (isWebPage() ? `${location.origin}/favicon.ico` : '');

        const icon = { pass: '✓', warn: '!', fail: '✗', info: 'i', pending: '' };

        return `
            <h3>Search result preview</h3>
            <div class="serp">
                <div class="site">
                    ${favicon ? `<img class="favicon" src="${esc(favicon)}" alt="" data-hide-on-error>` : ''}
                    <div>
                        <div class="name">${esc(siteName)}</div>
                        <div class="crumbs">${esc(crumbs)}</div>
                    </div>
                </div>
                <div class="title">${esc(d.title || location.hostname)}</div>
                <div class="desc">${esc(d.description || 'No meta description: the search engine will choose text from the page.')}</div>
            </div>

            <div class="summary">
                <span>${plural(count('pass'), 'passed', 'passed')}</span>
                <span>${plural(count('warn'), 'warning')}</span>
                <span>${plural(count('fail'), 'issue')}</span>
            </div>

            ${groups.map((g) => `
                <h3>${esc(g.name)}</h3>
                ${g.items.map((c) => `
                    <div class="check">
                        <div class="icon ${c.status}">${icon[c.status]}</div>
                        <div class="label">${esc(c.label)}</div>
                        <div class="value">${esc(c.value)}${c.detail ? `<span class="detail">${esc(c.detail)}</span>` : ''}</div>
                    </div>
                `).join('')}
            `).join('')}
        `;
    }

    function renderMeta(d) {
        const describeKey = (el) => {
            if (el.localName === 'title') return 'title';
            if (el.localName === 'base') return 'base';
            if (el.localName === 'link') return `link rel="${el.getAttribute('rel') || ''}"${el.hasAttribute('hreflang') ? ` hreflang="${el.getAttribute('hreflang')}"` : ''}${el.hasAttribute('sizes') ? ` sizes="${el.getAttribute('sizes')}"` : ''}`;
            for (const attr of ['name', 'property', 'http-equiv', 'itemprop']) {
                if (el.hasAttribute(attr)) return el.getAttribute(attr);
            }
            if (el.hasAttribute('charset')) return 'charset';
            return el.localName;
        };
        const valueOf = (el) => {
            if (el.localName === 'title') return el.textContent;
            if (el.localName === 'link' || el.localName === 'base') return el.getAttribute('href') || '';
            if (el.hasAttribute('charset')) return el.getAttribute('charset');
            return el.getAttribute('content') ?? '';
        };

        const metas = d.head.filter((el) => el.localName !== 'link');
        const links = d.head.filter((el) => el.localName === 'link');
        const html = d.head.map((el) => el.outerHTML).join('\n');

        const table = (rows) => `
            <table>
                <tr><th>Name</th><th>Value</th></tr>
                ${rows.map((el) => `<tr><td class="mono">${esc(describeKey(el))}</td><td>${esc(valueOf(el))}</td></tr>`).join('')}
            </table>
        `;

        return `
            <div class="toolbar-row">
                <span class="muted">${plural(d.head.length, 'tag')} in &lt;head&gt;</span>
                ${copyButton(html, 'Copy as HTML')}
            </div>
            <h3>Title &amp; meta</h3>
            ${metas.length ? table(metas) : '<div class="empty">None</div>'}
            <h3>Links</h3>
            ${links.length ? table(links) : '<div class="empty">None</div>'}
        `;
    }

    function renderSocial(d) {
        const og = Object.fromEntries(d.og.map((t) => [t.key, t.value]));
        const tw = Object.fromEntries(d.twitter.map((t) => [t.key, t.value]));
        let domain = location.hostname;
        try {
            if (og['og:url']) domain = new URL(absolute(og['og:url'])).hostname;
        } catch {
            // keep the page's own hostname
        }

        const card = (label, image, title, description) => `
            <div>
                <div class="card-label">${label}</div>
                <div class="card">
                    ${image ? `<img class="image" src="${esc(absolute(image))}" alt="" data-hide-on-error>` : '<div class="noimage">No image</div>'}
                    <div class="text">
                        <div class="domain">${esc(domain)}</div>
                        <div class="ctitle">${esc(title || '(no title)')}</div>
                        <div class="cdesc">${esc(description || '')}</div>
                    </div>
                </div>
            </div>
        `;

        const table = (tags, expected) => {
            const present = new Set(tags.map((t) => t.key));
            const missing = expected.filter((k) => !present.has(k));
            return `
                <table>
                    <tr><th>Property</th><th>Value</th></tr>
                    ${tags.map((t) => `<tr><td class="mono">${esc(t.key)}</td><td>${esc(t.value)}</td></tr>`).join('')}
                    ${missing.map((k) => `<tr class="missing"><td class="mono">${esc(k)}</td><td>Missing</td></tr>`).join('')}
                </table>
            `;
        };

        return `
            <div class="cards">
                ${card('Facebook / LinkedIn', og['og:image'], og['og:title'] || d.title, og['og:description'] || d.description)}
                ${card('X / Twitter', tw['twitter:image'] || og['og:image'], tw['twitter:title'] || og['og:title'] || d.title, tw['twitter:description'] || og['og:description'] || d.description)}
            </div>
            <h3>Open Graph</h3>
            ${table(d.og, ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'])}
            <h3>Twitter / X</h3>
            ${table(d.twitter, ['twitter:card'])}
        `;
    }

    function renderSchema(d) {
        if (!d.jsonLd.length && !d.microdata.length) {
            return '<div class="empty">No JSON-LD or microdata on this page.</div>';
        }

        const block = (heading, json, text, error) => {
            const types = error ? [] : [...collectTypes(json)];
            return `
                <div class="block">
                    <div class="block-head">
                        <strong>${heading}</strong>
                        <div class="types">
                            ${error ? `<span class="error">Invalid JSON: ${esc(error)}</span>` : types.map((t) => `<span class="type">${esc(t)}</span>`).join('') || '<span class="muted">No @type</span>'}
                        </div>
                        ${copyButton(text)}
                    </div>
                    ${error ? `<pre>${esc(text)}</pre>` : `<div class="tree">${tree(json)}</div>`}
                </div>
            `;
        };

        return `
            ${d.jsonLd.length ? `<h3>JSON-LD (${d.jsonLd.length})</h3>` : ''}
            ${d.jsonLd.map((b, i) => block(`#${i + 1}`, b.json, b.text, b.error)).join('')}
            ${d.microdata.length ? `<h3>Microdata (${d.microdata.length})</h3>` : ''}
            ${d.microdata.map((item, i) => block(`#${i + 1}`, item, JSON.stringify(item, null, 2))).join('')}
        `;
    }

    function renderIndexing(d) {
        const row = (key, value) => `<tr><td>${esc(key)}</td><td>${value}</td></tr>`;
        const link = (url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
        const pending = '<span class="muted">Checking…</span>';

        const http = d.http;
        const httpRows = http.state === 'pending' ? row('Status', pending)
            : http.state === 'skipped' ? row('Status', '<span class="muted">Not a web page</span>')
            : http.state === 'error' ? row('Status', `<span class="muted">Couldn't check: ${esc(http.error)}</span>`)
            : [
                row('Status', esc(http.status)),
                http.redirected ? row('Redirected to', link(http.finalUrl)) : '',
                row('Content-Type', esc(http.contentType || '–')),
                row('X-Robots-Tag', esc(http.robotsTag || 'Not set')),
                http.canonical ? row('Link header canonical', link(http.canonical)) : ''
            ].join('');

        const r = d.robotsTxt;
        let robotsRows;
        if (r.state === 'pending') robotsRows = row('robots.txt', pending);
        else if (r.state === 'skipped') robotsRows = row('robots.txt', '<span class="muted">Not a web page</span>');
        else if (r.state === 'missing') robotsRows = row('robots.txt', `Not found (${link(r.url)})`);
        else if (r.state === 'error') robotsRows = row('robots.txt', `<span class="muted">Couldn't check: ${esc(r.error)}</span>`);
        else {
            const v = r.verdict;
            robotsRows = [
                row('File', link(r.url)),
                row('This page', v.allowed ? 'Allowed' : `<span class="error">Blocked</span>`),
                row('Matching rule', v.rule ? esc(`${v.rule.allow ? 'Allow' : 'Disallow'}: ${v.rule.path}`) : 'None'),
                row('Rules used', esc(v.agent ? `User-agent: ${v.agent}` : 'No group for Googlebot or *')),
                row('Sitemaps', r.sitemaps.length ? r.sitemaps.map(link).join('<br>') : 'None listed')
            ].join('');
        }

        return `
            <h3>Robots meta</h3>
            <table>
                ${row('robots', esc(d.robots ?? 'Not set'))}
                ${d.googlebot !== null ? row('googlebot', esc(d.googlebot)) : ''}
            </table>

            <h3>HTTP response</h3>
            <table>${httpRows}</table>

            <h3>robots.txt</h3>
            <table>${robotsRows}</table>

            <h3>Canonical</h3>
            <table>
                ${d.canonicals.length ? d.canonicals.map((c) => row(withoutHash(c.href) === d.url ? 'This page' : 'Other URL', link(c.href))).join('') : row('Canonical', 'Not set')}
            </table>

            <h3>hreflang (${d.hreflang.length})</h3>
            ${d.hreflang.length ? `
                <table>
                    <tr><th>Language</th><th>URL</th></tr>
                    ${d.hreflang.map((h) => row(h.lang, link(h.href))).join('')}
                </table>
            ` : '<div class="empty">No hreflang alternates.</div>'}
        `;
    }

    function tabCounts(d) {
        const statuses = checks(d).flatMap((g) => g.items.map((c) => c.status));
        const fails = statuses.filter((s) => s === 'fail').length;
        const warns = statuses.filter((s) => s === 'warn').length;
        return {
            overview: fails ? { n: fails, cls: 'fail' } : warns ? { n: warns, cls: 'warn' } : null,
            meta: { n: d.head.length },
            social: { n: d.og.length + d.twitter.length },
            schema: { n: d.jsonLd.length + d.microdata.length, cls: d.jsonLd.some((b) => b.error) ? 'fail' : '' },
            indexing: null
        };
    }

    function render() {
        if (!root || !data) return;
        copies = [];

        const counts = tabCounts(data);
        root.querySelectorAll('nav button').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tab);
            const badge = button.querySelector('.count');
            const c = counts[button.dataset.tab];
            badge.hidden = !c;
            if (c) {
                badge.textContent = c.n;
                badge.className = `count ${c.cls || ''}`;
            }
        });

        const main = root.querySelector('main');
        const scroll = main.scrollTop;
        main.innerHTML = { overview: renderOverview, meta: renderMeta, social: renderSocial, schema: renderSchema, indexing: renderIndexing }[tab](data);
        main.scrollTop = scroll;
        main.querySelectorAll('img[data-hide-on-error]').forEach((img) => {
            img.addEventListener('error', () => { img.hidden = true; }, { once: true });
        });
    }

    async function load() {
        const run = ++generation;
        data = read();
        root.querySelector('.url').textContent = data.url;
        root.querySelectorAll('[data-lookup]').forEach((a) => {
            a.href = LOOKUPS[a.dataset.lookup].url(data.url);
        });
        render();

        const [http, robotsTxt] = await Promise.all([lookUpHeaders(), lookUpRobotsTxt()]);
        if (run !== generation || !data) return;
        Object.assign(data, { http, robotsTxt });
        render();
    }

    // ---- Events ----

    async function onClick(e) {
        const button = e.target.closest('button');
        if (!button) return;

        if (button.dataset.tab) {
            tab = button.dataset.tab;
            render();
            root.querySelector('main').scrollTop = 0;
        } else if (button.dataset.action === 'close') {
            Develobar.setActiveTool(null);
        } else if (button.dataset.action === 'refresh') {
            load();
        } else if (button.dataset.copy) {
            let ok = true;
            try {
                await navigator.clipboard.writeText(copies[button.dataset.copy]);
            } catch {
                ok = false;
            }
            const label = button.textContent;
            button.textContent = ok ? 'Copied' : 'Copy failed';
            setTimeout(() => { button.textContent = label; }, 1500);
        }
    }

    function onKeyDown(e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        Develobar.setActiveTool(null);
    }

    Develobar.registerTool({
        id: 'seo',

        activate() {
            host = document.createElement('div');
            root = host.attachShadow({ mode: 'open' });
            root.innerHTML = `<style>${CSS}</style>${HTML}`;

            root.querySelector('.backdrop').addEventListener('click', () => Develobar.setActiveTool(null));
            root.querySelector('.dialog').addEventListener('click', onClick);
            // Keep keys pressed in the dialog away from the page's shortcuts.
            root.querySelector('.dialog').addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') e.stopPropagation();
            });
            window.addEventListener('keydown', onKeyDown, true);

            document.documentElement.appendChild(host);
            root.querySelector('.dialog').focus();
            load();
        },

        deactivate() {
            generation++;
            window.removeEventListener('keydown', onKeyDown, true);
            host?.remove();
            host = root = data = null;
            copies = [];
        }
    });
})();
