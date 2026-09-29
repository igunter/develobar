// Screenshot tool. Options come from the toolbar dropdown: visible | fullpage | select.

(() => {
    const { Develobar } = window;

    let fullPageCapture = null; // AbortController while a full page capture is running

    // Wait until the browser has actually painted the latest DOM changes.
    function nextPaint() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)));
        });
    }

    function download(url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `develobar-${Date.now()}.png`;
        link.click();
    }

    // Full page PNGs can be large, so download them via a blob URL rather than a data URL.
    function downloadBlob(blob) {
        const url = URL.createObjectURL(blob);
        download(url);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    // captureVisibleTab only grabs the page viewport, so the browser's tab strip,
    // address bar and bookmarks bar are never included.
    async function captureTab() {
        const res = await chrome.runtime.sendMessage({ type: 'develobar:capture' });
        if (!res?.ok) throw new Error(res?.error || 'Capture failed');
        return res.dataUrl;
    }

    // The develobar is hidden for the duration of the capture.
    async function captureVisible() {
        Develobar.setHidden(true);
        try {
            await nextPaint();
            return await captureTab();
        } finally {
            Develobar.setHidden(false);
        }
    }

    // Crop a full-viewport capture to a rect given in viewport CSS pixels.
    async function crop(dataUrl, rect) {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();

        // Captured image is in device pixels; this also accounts for page zoom.
        const scale = img.naturalWidth / window.innerWidth;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rect.width * scale);
        canvas.height = Math.round(rect.height * scale);
        canvas.getContext('2d').drawImage(
            img,
            Math.round(rect.x * scale), Math.round(rect.y * scale), canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height
        );
        return canvas.toDataURL('image/png');
    }

    const modes = {
        async visible() {
            download(await captureVisible());
        },

        async fullpage() {
            fullPageCapture = new AbortController();
            const startY = window.scrollY; // measured with the bar's page offset in place
            Develobar.setHidden(true);
            try {
                await nextPaint();
                const blob = await window.DevelobarCaptureFullPage(captureTab, fullPageCapture.signal);
                if (blob) downloadBlob(blob);
            } finally {
                fullPageCapture = null;
                Develobar.setHidden(false);
                window.scrollTo({ top: startY, behavior: 'instant' });
            }
        },

        async select() {
            // Hide the bar up front so the user selects over the page exactly as it will be captured.
            Develobar.setHidden(true);
            try {
                await nextPaint();
                const rect = await window.DevelobarSelectRegion();
                if (!rect) return;

                await nextPaint(); // let the selection overlay disappear
                download(await crop(await captureTab(), rect));
            } finally {
                Develobar.setHidden(false);
            }
        }
    };

    Develobar.registerTool({
        id: 'screenshot',

        async activate(option = 'visible') {
            try {
                await modes[option]?.();
            } catch (err) {
                console.warn('Develobar screenshot failed:', err);
            } finally {
                Develobar.setActiveTool(null);
            }
        },

        // e.g. the bar is closed from another tab mid-capture.
        deactivate() {
            fullPageCapture?.abort();
        }
    });
})();
