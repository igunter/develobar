// Ruler / measure tool. Click to set the start point, click again to set the end point;
// a further click starts a new measurement. Hold Shift to snap the line to horizontal,
// vertical or 45° diagonals. Esc clears the current line, or closes the tool if there is none.
// Points are stored in page coordinates so a measurement stays put when the page scrolls.

(() => {
    const { Develobar } = window;

    const CSS = `
        :host { all: initial; }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483646; /* just below the toolbar, so its buttons and menus stay usable */
            cursor: crosshair;
            font-family: Arial, sans-serif;
            font-size: 12px;
            user-select: none;
        }

        svg {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
        }

        .line {
            stroke: #2563eb;
            stroke-width: 2;
        }

        .line-outline {
            stroke: #fff;
            stroke-width: 4;
            stroke-opacity: 0.8;
        }

        .leg {
            stroke: #2563eb;
            stroke-width: 1;
            stroke-dasharray: 4 3;
            opacity: 0.7;
        }

        .point {
            fill: #fff;
            stroke: #2563eb;
            stroke-width: 2;
        }

        .label {
            position: absolute;
            padding: 4px 8px;
            border-radius: 5px;
            background: #18181b;
            color: #fff;
            white-space: nowrap;
            pointer-events: none;
            transform: translate(12px, 12px);
        }

        .label .detail {
            color: #a1a1aa;
            margin-left: 6px;
        }

        .hint {
            position: fixed;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            padding: 6px 12px;
            border-radius: 5px;
            background: #18181b;
            color: #e4e4e7;
            pointer-events: none;
        }

        [hidden] {
            display: none;
        }
    `;

    const HTML = `
        <div class="overlay">
            <svg>
                <line class="leg leg-x" />
                <line class="leg leg-y" />
                <line class="line-outline" />
                <line class="line" />
                <circle class="point start" r="4" />
                <circle class="point end" r="4" />
            </svg>
            <div class="label" hidden></div>
            <div class="hint">Click to start measuring · Shift to snap · Esc to clear</div>
        </div>
    `;

    let host = null;
    let els = null;
    let start = null;   // { x, y } page coordinates
    let end = null;     // set once the second click lands
    let pointer = null; // last known pointer position, viewport coordinates (follows the mouse while scrolling)
    let shift = false;

    // Snap `to` onto the nearest horizontal, vertical or 45° diagonal line through `from`.
    function snap(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx);
        const step = Math.PI / 4;
        const snapped = Math.round(angle / step) * step;
        const ux = Math.round(Math.cos(snapped)); // -1, 0 or 1
        const uy = Math.round(Math.sin(snapped));

        // Project the pointer onto the snapped direction so the end follows the mouse.
        const length = (dx * ux + dy * uy) / (ux * ux + uy * uy);
        return { x: from.x + ux * length, y: from.y + uy * length };
    }

    function currentEnd() {
        const target = end || (pointer && toPage(pointer));
        if (!start || !target) return null;
        return shift && !end ? snap(start, target) : target;
    }

    function setLine(el, a, b) {
        el.setAttribute('x1', a.x);
        el.setAttribute('y1', a.y);
        el.setAttribute('x2', b.x);
        el.setAttribute('y2', b.y);
    }

    function toViewport(p) {
        return { x: p.x - window.scrollX, y: p.y - window.scrollY };
    }

    function render() {
        if (!els) return;

        const b = currentEnd();
        const visible = !!(start && b);
        els.svg.querySelectorAll('line, circle').forEach((el) => {
            el.style.display = visible ? '' : 'none';
        });
        els.label.hidden = !visible;
        els.hint.hidden = !!start;
        if (!visible) return;

        const a = toViewport(start);
        const c = toViewport(b);

        setLine(els.line, a, c);
        setLine(els.outline, a, c);

        // Dashed width/height legs, only when the line is at an angle.
        const angled = a.x !== c.x && a.y !== c.y;
        els.legX.style.display = angled ? '' : 'none';
        els.legY.style.display = angled ? '' : 'none';
        setLine(els.legX, a, { x: c.x, y: a.y });
        setLine(els.legY, { x: c.x, y: a.y }, c);

        els.start.setAttribute('cx', a.x);
        els.start.setAttribute('cy', a.y);
        els.end.setAttribute('cx', c.x);
        els.end.setAttribute('cy', c.y);

        const dx = b.x - start.x;
        const dy = b.y - start.y;
        const length = Math.hypot(dx, dy);
        const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // screen y points down; show maths-style angle

        els.label.innerHTML = `${Math.round(length)} px<span class="detail">`
            + `${Math.round(Math.abs(dx))} × ${Math.round(Math.abs(dy))} · ${Math.round(angle)}°</span>`;

        // Keep the label on screen near the end point.
        const labelWidth = els.label.offsetWidth + 24;
        const labelHeight = els.label.offsetHeight + 24;
        els.label.style.left = `${Math.min(c.x, window.innerWidth - labelWidth)}px`;
        els.label.style.top = `${Math.min(c.y, window.innerHeight - labelHeight)}px`;
    }

    function toPage(p) {
        return { x: p.x + window.scrollX, y: p.y + window.scrollY };
    }

    function onPointerMove(e) {
        pointer = { x: e.clientX, y: e.clientY };
        shift = e.shiftKey;
        render();
    }

    function onPointerDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        shift = e.shiftKey;
        pointer = { x: e.clientX, y: e.clientY };

        if (!start || end) {
            // First click, or a new measurement after a finished one.
            start = toPage(pointer);
            end = null;
        } else {
            end = currentEnd();
        }
        render();
    }

    function onKey(e) {
        if (e.key === 'Shift') {
            shift = e.type === 'keydown';
            render();
            return;
        }
        if (e.type !== 'keydown' || e.key !== 'Escape') return;

        e.preventDefault();
        e.stopPropagation();
        if (start) {
            start = end = null;
            render();
        } else {
            Develobar.setActiveTool(null);
        }
    }

    Develobar.registerTool({
        id: 'ruler',

        activate() {
            host = document.createElement('div');
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<style>${CSS}</style>${HTML}`;

            const overlay = shadow.querySelector('.overlay');
            els = {
                svg: shadow.querySelector('svg'),
                line: shadow.querySelector('.line'),
                outline: shadow.querySelector('.line-outline'),
                legX: shadow.querySelector('.leg-x'),
                legY: shadow.querySelector('.leg-y'),
                start: shadow.querySelector('.start'),
                end: shadow.querySelector('.end'),
                label: shadow.querySelector('.label'),
                hint: shadow.querySelector('.hint')
            };

            overlay.addEventListener('pointerdown', onPointerDown);
            overlay.addEventListener('pointermove', onPointerMove);
            window.addEventListener('keydown', onKey, true);
            window.addEventListener('keyup', onKey, true);
            window.addEventListener('scroll', render, { passive: true });

            document.documentElement.appendChild(host);
            render();
        },

        deactivate() {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKey, true);
            window.removeEventListener('scroll', render);
            host?.remove();
            host = els = start = end = pointer = null;
            shift = false;
        }
    });
})();
