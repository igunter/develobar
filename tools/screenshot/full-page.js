// Full page capture: scrolls through the page, grabs each viewport and stitches the frames
// into one PNG at the current viewport width. Resolves with a PNG Blob, or null if cancelled
// (Cancel button, Esc, or the optional AbortSignal). captureFrame() must resolve with a
// PNG data URL of the visible tab.

window.DevelobarCaptureFullPage = window.DevelobarCaptureFullPage || (() => {
    const MAX_HEIGHT = 60000; // CSS pixels
    const MAX_FRAMES = 100;
    const FRAME_INTERVAL = 650; // captureVisibleTab is rate limited to about 2 calls per second

    const CSS = `
        :host { all: initial; }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: grid;
            place-items: center;
            background: rgba(0, 0, 0, 0.6);
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #e4e4e7;
            user-select: none;
        }

        .panel {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            padding: 20px 28px;
            border-radius: 8px;
            background: #18181b;
            text-align: center;
        }

        .spinner {
            width: 36px;
            height: 36px;
            border: 4px solid #3f3f46;
            border-top-color: #2563eb;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        button {
            height: 28px;
            padding: 0 14px;
            border: 0;
            border-radius: 4px;
            background: #27272a;
            color: #e4e4e7;
            font: inherit;
            font-size: 12px;
            cursor: pointer;
        }

        button:hover {
            background: #3f3f46;
            color: #fff;
        }
    `;

    const HTML = `
        <div class="overlay">
            <div class="panel">
                <div class="spinner"></div>
                <div class="label">Loading page content…</div>
                <button data-action="cancel">Cancel (Esc)</button>
            </div>
        </div>
    `;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pageHeight = () => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const maxScroll = () => Math.max(0, pageHeight() - window.innerHeight);

    async function scrollToY(y) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await nextFrame();
    }

    async function decode(dataUrl) {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        return img;
    }

    function isPinned(el) {
        const { position } = getComputedStyle(el);
        return position === 'fixed' || position === 'sticky';
    }

    // Fixed/sticky elements would repeat in every frame. Wide top bars and sidebars
    // belong to the first frame; other floating controls (chat buttons etc.) to the last.
    function placementOf(el) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const bounds = el.getBoundingClientRect();
        const attachedToSide = bounds.left <= 4 || bounds.right >= vw - 4;
        const isSidebar = attachedToSide && bounds.height >= vh * 0.5;
        const isStickySidebar = getComputedStyle(el).position === 'sticky'
            && bounds.width <= vw * 0.4
            && bounds.height >= vh * 0.15
            && (bounds.left <= vw * 0.4 || bounds.right >= vw * 0.6);
        const marker = `${el.id} ${el.className}`;
        const isNavigation = !!el.closest('nav, aside, [role="navigation"]')
            || /\b(sidebar|sidenav|navigation|nav-menu)\b/i.test(marker);
        const isTopBar = bounds.top <= 4 && bounds.width >= vw * 0.5;
        return isTopBar || isSidebar || isStickySidebar || isNavigation ? 'first' : 'last';
    }

    return async function captureFullPage(captureFrame, signal) {
        const root = document.documentElement;
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${CSS}</style>${HTML}`;
        const label = shadow.querySelector('.label');

        let cancelled = false;
        const cancel = () => {
            cancelled = true;
            label.textContent = 'Cancelling…';
        };
        const check = () => {
            if (cancelled) throw new Error('Capture cancelled.');
        };
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            cancel();
        };

        shadow.querySelector('button').addEventListener('click', cancel);
        window.addEventListener('keydown', onKeyDown, true);
        signal?.addEventListener('abort', cancel);

        const startY = window.scrollY;
        const saved = {
            scrollBehavior: root.style.scrollBehavior,
            scrollSnapType: root.style.scrollSnapType,
            overflowAnchor: root.style.overflowAnchor
        };
        const originalVisibility = new Map(); // element -> its original inline visibility
        const hideScrollbars = document.createElement('style');
        hideScrollbars.textContent = `
            html, body, * { scrollbar-width: none !important; }
            html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
        `;

        root.appendChild(host);

        try {
            if (window.innerWidth < 1 || window.innerHeight < 1) throw new Error('Invalid viewport size.');

            root.style.scrollBehavior = 'auto';
            root.style.scrollSnapType = 'none';
            root.style.overflowAnchor = 'none';
            root.appendChild(hideScrollbars);
            await nextFrame();

            // Scroll through once to trigger lazy-loaded content. The height is rechecked
            // each step because infinite-scroll pages keep growing.
            await scrollToY(0);
            let y = 0;
            for (let i = 0; i < MAX_FRAMES && y < Math.min(maxScroll(), MAX_HEIGHT); i++) {
                check();
                const target = Math.min(maxScroll(), MAX_HEIGHT);
                y = Math.min(y + window.innerHeight, target);
                label.textContent = `Loading page content… ${Math.round(100 * y / Math.max(1, target))}%`;
                await scrollToY(y);
                await sleep(250);
            }
            await scrollToY(0);
            await sleep(350);
            check();

            const initialPlacement = new Map();
            for (const el of document.querySelectorAll('body *')) {
                if (isPinned(el)) initialPlacement.set(el, placementOf(el));
            }

            const width = window.innerWidth;
            const height = pageHeight();
            if (height > MAX_HEIGHT) {
                throw new Error(`This page is over ${MAX_HEIGHT.toLocaleString()} CSS pixels tall. Capture a shorter page.`);
            }

            const positions = [];
            const finalY = Math.max(0, height - window.innerHeight);
            for (let pos = 0; pos < Math.max(1, finalY); pos += window.innerHeight) positions.push(pos);
            if (positions.at(-1) !== finalY) positions.push(finalY);
            if (positions.length > MAX_FRAMES) throw new Error(`This page needs more than ${MAX_FRAMES} frames. Capture a shorter page.`);

            let canvas = null;
            let context = null;
            let scale = 1;
            let covered = 0; // CSS pixels of the page already drawn
            let lastCapture = 0;

            for (let i = 0; i < positions.length; i++) {
                check();
                await scrollToY(positions[i]);
                await sleep(300);
                check();

                if (window.innerWidth !== width || pageHeight() !== height) {
                    throw new Error('Page size changed during capture. Try again once it has finished loading.');
                }
                label.textContent = `Capturing page… ${i + 1} of ${positions.length}`;

                // Re-evaluate every frame: some sites only make their header sticky after scrolling.
                // Restore original visibility first so hidden elements measure correctly.
                for (const [el, visibility] of originalVisibility) el.style.visibility = visibility;
                for (const el of document.querySelectorAll('body *')) {
                    if (!isPinned(el)) continue;
                    if (!originalVisibility.has(el)) originalVisibility.set(el, el.style.visibility);
                    const placement = initialPlacement.get(el) || placementOf(el);
                    const show = placement === 'last' ? i === positions.length - 1 : i === 0;
                    if (!show) el.style.visibility = 'hidden';
                }

                const wait = FRAME_INTERVAL - (Date.now() - lastCapture);
                if (wait > 0) await sleep(wait);

                // Take the overlay out of view for the capture itself.
                host.remove();
                await nextFrame();
                await sleep(150);
                const top = window.scrollY;
                const visibleHeight = window.innerHeight;
                let dataUrl;
                try {
                    dataUrl = await captureFrame();
                    lastCapture = Date.now();
                } finally {
                    await sleep(100);
                    root.appendChild(host);
                }

                const image = await decode(dataUrl);

                if (!canvas) {
                    // Captures are in device pixels; this also accounts for page zoom.
                    scale = image.naturalWidth / width;
                    canvas = document.createElement('canvas');
                    canvas.width = image.naturalWidth;
                    canvas.height = Math.round(height * scale);
                    context = canvas.getContext('2d', { alpha: false });
                    if (!context) throw new Error('Screenshot too large for this browser.');
                }

                // Only draw the part of this frame not already covered by earlier ones.
                const from = Math.max(covered, top);
                const to = Math.min(height, top + visibleHeight);
                if (to > from) {
                    const srcY = Math.round((from - top) * scale);
                    const srcH = Math.min(image.naturalHeight - srcY, Math.round((to - from) * scale));
                    const destY = Math.round(from * scale);
                    const destH = Math.round(to * scale) - destY;
                    context.drawImage(image, 0, srcY, image.naturalWidth, srcH, 0, destY, canvas.width, destH);
                    covered = to;
                }
            }

            if (covered < height - 1) throw new Error('Capture is incomplete.');

            label.textContent = 'Preparing PNG…';
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            canvas.width = canvas.height = 0; // release the bitmap memory
            if (!blob) throw new Error('Could not create the PNG. The page may be too large.');
            return blob;
        } catch (err) {
            if (cancelled) return null;
            label.textContent = err.message;
            shadow.querySelector('.spinner').hidden = true;
            await sleep(3000);
            throw err;
        } finally {
            for (const [el, visibility] of originalVisibility) el.style.visibility = visibility;
            hideScrollbars.remove();
            Object.assign(root.style, saved);
            await scrollToY(startY);
            host.remove();
            window.removeEventListener('keydown', onKeyDown, true);
            signal?.removeEventListener('abort', cancel);
        }
    };
})();
