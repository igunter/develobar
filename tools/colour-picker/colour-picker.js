// Colour picker tool. While active, the panel under the Colour button shows the HEX, RGB, HSL
// and CMYK of the pixel under the mouse, updating as it moves, with a magnifier by the cursor.
// Click to pick (copies HEX and keeps the panel open), Esc to cancel. Click a value to copy it.
//
// The native EyeDropper API only reports a colour once clicked, so instead we screenshot the
// visible tab and read pixels from that, re-capturing after the page scrolls or resizes.

(() => {
    const { Develobar } = window;

    const PALETTE_URL = 'https://iangunter.co.uk/color-palette-generator';
    const LOUPE_PIXELS = 15; // odd, so there's a centre pixel
    const LOUPE_ZOOM = 8;
    const RECAPTURE_DELAY = 250; // ms after scrolling/resizing stops

    const CSS = `
        :host { all: initial; }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483646; /* just below the toolbar, so the panel stays visible */
            cursor: crosshair;
        }

        .loupe {
            position: fixed;
            width: ${LOUPE_PIXELS * LOUPE_ZOOM}px;
            height: ${LOUPE_PIXELS * LOUPE_ZOOM}px;
            border: 2px solid #18181b;
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            pointer-events: none;
            background: #fff;
        }

        .loupe canvas {
            display: block;
            width: 100%;
            height: 100%;
            image-rendering: pixelated;
        }

        /* Outline the centre pixel: the one being read. */
        .loupe::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: ${LOUPE_ZOOM}px;
            height: ${LOUPE_ZOOM}px;
            transform: translate(-50%, -50%);
            outline: 1px solid #fff;
            box-shadow: 0 0 0 2px #18181b;
        }

        [hidden] {
            display: none;
        }
    `;

    const HTML = `
        <div class="overlay">
            <div class="loupe" hidden><canvas width="${LOUPE_PIXELS}" height="${LOUPE_PIXELS}"></canvas></div>
        </div>
    `;

    let host = null;
    let loupe = null;
    let loupeContext = null;
    let panel = null;
    let shot = null;       // screenshot of the visible tab: { context, scale, width, height }
    let pointer = null;    // last pointer position, viewport coordinates
    let current = null;    // hex under the pointer
    let recaptureTimer = null;
    let capturing = false;

    function toHex(r, g, b) {
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    }

    function toRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function toHsl({ r, g, b }) {
        const [rn, gn, bn] = [r / 255, g / 255, b / 255];
        const max = Math.max(rn, gn, bn);
        const min = Math.min(rn, gn, bn);
        const d = max - min;
        const l = (max + min) / 2;
        if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };

        const s = d / (1 - Math.abs(2 * l - 1));
        let h;
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h = Math.round(h * 60 + 360) % 360;

        return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function toCmyk({ r, g, b }) {
        const k = 1 - Math.max(r, g, b) / 255;
        if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
        const channel = (v) => Math.round(((1 - v / 255 - k) / (1 - k)) * 100);
        return { c: channel(r), m: channel(g), y: channel(b), k: Math.round(k * 100) };
    }

    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false; // e.g. the page doesn't have focus
        }
    }

    // ---- Panel ----

    function buildPanel() {
        panel = Develobar.getPanel('colour-picker');
        if (!panel) return;

        panel.innerHTML = `
            <div class="swatch"></div>
            ${['HEX', 'RGB', 'HSL', 'CMYK'].map((format) => `
                <button class="value" data-format="${format}" title="Copy ${format}">
                    <span class="format">${format}</span>
                    <code>–</code>
                    <span class="copied"></span>
                </button>
            `).join('')}
            <a class="palette-link" target="_blank" rel="noopener">View Palettes →</a>
            <div class="picker-hint">Click the page to pick · Esc to cancel</div>
        `;

        panel.onclick = (e) => {
            const button = e.target.closest('button[data-copy]');
            if (button) copyValue(button);
        };

        Develobar.openPanel('colour-picker');
    }

    function updatePanel(hex) {
        if (!panel?.isConnected) return;

        const rgb = toRgb(hex);
        const hsl = toHsl(rgb);
        const cmyk = toCmyk(rgb);
        const values = {
            HEX: hex,
            RGB: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
            HSL: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
            CMYK: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`
        };

        panel.querySelector('.swatch').style.background = hex;
        panel.querySelectorAll('button[data-format]').forEach((button) => {
            const value = values[button.dataset.format];
            button.dataset.copy = value;
            button.querySelector('code').textContent = value;
            button.querySelector('.copied').textContent = '';
        });
        panel.querySelector('.palette-link').href = `${PALETTE_URL}?hex=${encodeURIComponent(hex.slice(1))}`;
    }

    async function copyValue(button) {
        panel.querySelectorAll('.copied').forEach((el) => { el.textContent = ''; });
        button.querySelector('.copied').textContent = (await copy(button.dataset.copy)) ? 'Copied' : 'Copy failed';
    }

    // ---- Screen capture ----

    async function capture() {
        if (capturing || !host) return;
        capturing = true;
        loupe.hidden = true; // keep the magnifier out of the screenshot
        try {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const res = await chrome.runtime.sendMessage({ type: 'develobar:capture' });
            if (!res?.ok) throw new Error(res?.error || 'Capture failed');

            const img = new Image();
            img.src = res.dataUrl;
            await img.decode();

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(img, 0, 0);

            // Captured image is in device pixels; this also accounts for page zoom.
            shot = { context, scale: img.naturalWidth / window.innerWidth, width: canvas.width, height: canvas.height };
        } catch (err) {
            console.warn('Develobar colour picker: capture failed.', err);
        } finally {
            capturing = false;
            render();
        }
    }

    function scheduleCapture() {
        shot = null; // stale until re-captured
        render();
        clearTimeout(recaptureTimer);
        recaptureTimer = setTimeout(capture, RECAPTURE_DELAY);
    }

    // ---- Pointer ----

    function render() {
        if (!loupe) return;
        if (!pointer || !shot || capturing) {
            loupe.hidden = true;
            return;
        }

        const x = Math.min(shot.width - 1, Math.floor(pointer.x * shot.scale));
        const y = Math.min(shot.height - 1, Math.floor(pointer.y * shot.scale));
        const [r, g, b] = shot.context.getImageData(x, y, 1, 1).data;
        const hex = toHex(r, g, b);
        if (hex !== current) {
            current = hex;
            updatePanel(hex);
        }

        // Magnifier: the pixels around the pointer, drawn beside it (flipped near screen edges).
        const half = (LOUPE_PIXELS - 1) / 2;
        loupeContext.imageSmoothingEnabled = false;
        loupeContext.fillStyle = '#fff';
        loupeContext.fillRect(0, 0, LOUPE_PIXELS, LOUPE_PIXELS);
        loupeContext.drawImage(shot.context.canvas, x - half, y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, LOUPE_PIXELS, LOUPE_PIXELS);

        const size = LOUPE_PIXELS * LOUPE_ZOOM;
        const gap = 20;
        const left = pointer.x + gap + size > window.innerWidth ? pointer.x - gap - size : pointer.x + gap;
        const top = pointer.y + gap + size > window.innerHeight ? pointer.y - gap - size : pointer.y + gap;
        loupe.style.left = `${left}px`;
        loupe.style.top = `${top}px`;
        loupe.hidden = false;
    }

    function onPointerMove(e) {
        pointer = { x: e.clientX, y: e.clientY };
        render();
    }

    function onPointerLeave() {
        pointer = null;
        render();
    }

    function onClick(e) {
        // Swallow the click so it never reaches the page (or the toolbar's close-menus listener).
        e.preventDefault();
        e.stopPropagation();
        if (!current) return;

        panel?.querySelector('.picker-hint')?.remove();
        Develobar.setActiveTool(null); // the panel stays open showing the picked colour
        const hexButton = panel?.querySelector('button[data-format="HEX"]');
        if (hexButton) copyValue(hexButton);
    }

    function onKeyDown(e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        Develobar.setActiveTool(null);
        panel?.closest('.dropdown')?.classList.remove('open');
    }

    Develobar.registerTool({
        id: 'colour-picker',

        activate() {
            host = document.createElement('div');
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<style>${CSS}</style>${HTML}`;

            const overlay = shadow.querySelector('.overlay');
            loupe = shadow.querySelector('.loupe');
            loupeContext = loupe.querySelector('canvas').getContext('2d');

            overlay.addEventListener('pointermove', onPointerMove);
            overlay.addEventListener('pointerleave', onPointerLeave);
            overlay.addEventListener('pointerdown', (e) => e.preventDefault()); // don't move focus or select text
            overlay.addEventListener('click', onClick);
            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('scroll', scheduleCapture, { passive: true });
            window.addEventListener('resize', scheduleCapture);

            document.documentElement.appendChild(host);
            current = null;
            buildPanel();
            capture();
        },

        deactivate() {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('scroll', scheduleCapture);
            window.removeEventListener('resize', scheduleCapture);
            clearTimeout(recaptureTimer);
            host?.remove();
            host = loupe = loupeContext = shot = pointer = null;
        }
    });
})();
