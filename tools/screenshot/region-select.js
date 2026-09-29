// Region selector: drag out a box, then move / resize it. Resolves with the selected
// rectangle in viewport CSS pixels ({ x, y, width, height }), or null if cancelled.
// Enter, double-click or the Capture button confirm; Esc or Cancel abort.

window.DevelobarSelectRegion = window.DevelobarSelectRegion || (() => {
    const MIN_SIZE = 4;
    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    const CSS = `
        :host { all: initial; }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            cursor: crosshair;
            background: rgba(0, 0, 0, 0.35);
            font-family: Arial, sans-serif;
            font-size: 12px;
            user-select: none;
        }

        .overlay.has-box {
            background: transparent;
        }

        .hint {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            padding: 6px 12px;
            border-radius: 5px;
            background: #18181b;
            color: #e4e4e7;
            pointer-events: none;
        }

        .box {
            position: absolute;
            box-sizing: border-box;
            outline: 1px solid #fff;
            box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
            cursor: move;
        }

        .box[hidden] {
            display: none;
        }

        .handle {
            position: absolute;
            width: 10px;
            height: 10px;
            margin: -5px 0 0 -5px;
            background: #fff;
            border: 1px solid #18181b;
            box-sizing: border-box;
        }

        .handle[data-dir="nw"] { left: 0;    top: 0;    cursor: nwse-resize; }
        .handle[data-dir="n"]  { left: 50%;  top: 0;    cursor: ns-resize; }
        .handle[data-dir="ne"] { left: 100%; top: 0;    cursor: nesw-resize; }
        .handle[data-dir="e"]  { left: 100%; top: 50%;  cursor: ew-resize; }
        .handle[data-dir="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
        .handle[data-dir="s"]  { left: 50%;  top: 100%; cursor: ns-resize; }
        .handle[data-dir="sw"] { left: 0;    top: 100%; cursor: nesw-resize; }
        .handle[data-dir="w"]  { left: 0;    top: 50%;  cursor: ew-resize; }

        .size {
            position: absolute;
            left: 0;
            bottom: calc(100% + 6px);
            padding: 3px 6px;
            border-radius: 4px;
            background: #18181b;
            color: #fff;
            white-space: nowrap;
            pointer-events: none;
        }

        .box.near-top .size {
            bottom: auto;
            top: 6px;
            left: 6px;
        }

        .actions {
            position: absolute;
            right: 0;
            top: calc(100% + 8px);
            display: flex;
            gap: 4px;
            padding: 4px;
            border-radius: 6px;
            background: #18181b;
            cursor: default;
        }

        .box.near-bottom .actions {
            top: auto;
            bottom: 8px;
            right: 8px;
        }

        button {
            height: 28px;
            padding: 0 10px;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: #e4e4e7;
            font: inherit;
            cursor: pointer;
        }

        button:hover {
            background: #27272a;
            color: #fff;
        }

        button.primary {
            background: #2563eb;
            color: #fff;
        }

        button.primary:hover {
            background: #1d4ed8;
        }
    `;

    const HTML = `
        <div class="overlay">
            <div class="hint">Drag to select an area · Esc to cancel</div>
            <div class="box" hidden>
                <div class="size"></div>
                ${HANDLES.map((d) => `<div class="handle" data-dir="${d}"></div>`).join('')}
                <div class="actions">
                    <button data-action="cancel">Cancel</button>
                    <button data-action="capture" class="primary">Capture</button>
                </div>
            </div>
        </div>
    `;

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    return function selectRegion() {
        return new Promise((resolve) => {
            const host = document.createElement('div');
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<style>${CSS}</style>${HTML}`;
            document.documentElement.appendChild(host);

            const overlay = shadow.querySelector('.overlay');
            const hint = shadow.querySelector('.hint');
            const box = shadow.querySelector('.box');
            const sizeLabel = shadow.querySelector('.size');

            // Selection stored as edges; left/right and top/bottom may cross while dragging.
            const edges = { l: 0, t: 0, r: 0, b: 0 };
            let drag = null; // { dir, startX, startY, start: {...edges} }

            function rect() {
                return {
                    x: Math.min(edges.l, edges.r),
                    y: Math.min(edges.t, edges.b),
                    width: Math.abs(edges.r - edges.l),
                    height: Math.abs(edges.b - edges.t)
                };
            }

            function hasSelection() {
                const { width, height } = rect();
                return width >= MIN_SIZE && height >= MIN_SIZE;
            }

            function render() {
                const { x, y, width, height } = rect();
                box.hidden = !hasSelection() && !drag;
                box.style.left = `${x}px`;
                box.style.top = `${y}px`;
                box.style.width = `${width}px`;
                box.style.height = `${height}px`;
                box.classList.toggle('near-top', y < 28);
                box.classList.toggle('near-bottom', y + height > window.innerHeight - 48);
                sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;
                overlay.classList.toggle('has-box', !box.hidden);
                hint.hidden = !box.hidden;
            }

            function onPointerDown(e) {
                if (e.button !== 0 || e.target.closest('button, .actions')) return;
                e.preventDefault();

                const handle = e.target.closest('.handle');
                let dir;

                if (handle) {
                    dir = handle.dataset.dir;
                } else if (e.target.closest('.box')) {
                    dir = 'move';
                } else {
                    // Start a fresh selection: anchor the top-left, drag the bottom-right.
                    edges.l = edges.r = e.clientX;
                    edges.t = edges.b = e.clientY;
                    dir = 'se';
                }

                drag = { dir, startX: e.clientX, startY: e.clientY, start: { ...edges } };
                overlay.setPointerCapture(e.pointerId);
                render();
            }

            function onPointerMove(e) {
                if (!drag) return;

                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const { dir, start } = drag;

                if (dir === 'move') {
                    const w = start.r - start.l;
                    const h = start.b - start.t;
                    const dx = clamp(e.clientX - drag.startX, -Math.min(start.l, start.r), vw - Math.max(start.l, start.r));
                    const dy = clamp(e.clientY - drag.startY, -Math.min(start.t, start.b), vh - Math.max(start.t, start.b));
                    edges.l = start.l + dx;
                    edges.r = edges.l + w;
                    edges.t = start.t + dy;
                    edges.b = edges.t + h;
                } else {
                    const x = clamp(e.clientX, 0, vw);
                    const y = clamp(e.clientY, 0, vh);
                    const [left, right] = start.l <= start.r ? ['l', 'r'] : ['r', 'l'];
                    const [top, bottom] = start.t <= start.b ? ['t', 'b'] : ['b', 't'];
                    if (dir.includes('w')) edges[left] = x;
                    if (dir.includes('e')) edges[right] = x;
                    if (dir.includes('n')) edges[top] = y;
                    if (dir.includes('s')) edges[bottom] = y;
                }

                render();
            }

            function onPointerUp() {
                if (!drag) return;
                drag = null;

                // Normalise so handles map to the right edges next time.
                const r = rect();
                Object.assign(edges, { l: r.x, t: r.y, r: r.x + r.width, b: r.y + r.height });
                render();
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(null);
                } else if (e.key === 'Enter' && hasSelection()) {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(rect());
                }
            }

            function onClick(e) {
                const action = e.target.closest('button')?.dataset.action;
                if (action === 'cancel') finish(null);
                if (action === 'capture' && hasSelection()) finish(rect());
            }

            function onDoubleClick(e) {
                if (e.target.closest('.box') && !e.target.closest('.actions') && hasSelection()) finish(rect());
            }

            function finish(result) {
                window.removeEventListener('keydown', onKeyDown, true);
                host.remove();
                resolve(result);
            }

            overlay.addEventListener('pointerdown', onPointerDown);
            overlay.addEventListener('pointermove', onPointerMove);
            overlay.addEventListener('pointerup', onPointerUp);
            overlay.addEventListener('pointercancel', onPointerUp);
            overlay.addEventListener('click', onClick);
            overlay.addEventListener('dblclick', onDoubleClick);
            overlay.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            window.addEventListener('keydown', onKeyDown, true);

            render();
        });
    };
})();
