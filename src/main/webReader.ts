/**
 * Generates the self-contained HTML page for the web reader.
 * This is served to online visitors by the Express server.
 * Contains all CSS and JS inline — no external dependencies except Google Fonts.
 *
 * This page mirrors the Electron app's reader mode as closely as possible,
 * including the toolbar, zoom/pan system, and chapter-complete screen.
 */

export function generateWebReaderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>Cinematic Manga Reader</title>
    <meta name="description" content="Cinematic manga reader with immersive panel-by-panel experience and original soundtrack" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        /* ═══════════════════════════════════════════════════════════════════
           CSS VARIABLES — matches variables.css
           ═══════════════════════════════════════════════════════════════════ */
        :root {
            --bg-primary: #0a0a0f;
            --bg-secondary: #12121a;
            --bg-surface: #1a1a28;
            --bg-surface-hover: #222236;
            --bg-elevated: #252538;

            --accent: #E50914;
            --accent-hover: #FF2A35;
            --accent-glow: rgba(229, 9, 20, 0.35);
            --accent-subtle: rgba(229, 9, 20, 0.08);
            --accent-gold: #c8a84e;
            --accent-gold-glow: rgba(200, 168, 78, 0.25);

            --text-primary: #e8e6e3;
            --text-secondary: #888899;
            --text-muted: #555566;

            --border-color: rgba(255, 255, 255, 0.06);
            --border-hover: rgba(255, 255, 255, 0.12);
            --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            --glass-blur: blur(20px);

            --font-family: 'Inter', system-ui, -apple-system, sans-serif;
            --font-display: 'Outfit', 'Inter', sans-serif;
        }

        /* ═══════════════════════════════════════════════════════════════════
           BASE RESET — matches base.css
           ═══════════════════════════════════════════════════════════════════ */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
            height: 100%;
            overflow: hidden;
            font-family: var(--font-family);
            background-color: var(--bg-primary);
            color: var(--text-primary);
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

        button {
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: var(--font-family);
            font-size: 13px;
            font-weight: 500;
        }
        button:hover {
            background: var(--bg-surface-hover);
            border-color: var(--border-hover);
            transform: translateY(-1px);
        }
        button:active { transform: translateY(0); }

        input, select {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 7px 10px;
            border-radius: 4px;
            font-family: var(--font-family);
            font-size: 13px;
            transition: all 0.2s ease;
        }
        input:focus, select:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 2px var(--accent-glow);
            background: rgba(0, 0, 0, 0.5);
        }

        /* ═══════════════════════════════════════════════════════════════════
           APP CONTAINER
           ═══════════════════════════════════════════════════════════════════ */
        #app {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
        }

        /* ═══════════════════════════════════════════════════════════════════
           LOADING SCREEN
           ═══════════════════════════════════════════════════════════════════ */
        .loading-screen {
            position: fixed;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
            z-index: 100;
        }
        .loading-spinner {
            width: 36px;
            height: 36px;
            border: 3px solid rgba(229,9,20,0.3);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        .loading-text {
            margin-top: 16px;
            color: var(--text-secondary);
            font-size: 0.95rem;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ═══════════════════════════════════════════════════════════════════
           LIBRARY VIEW — matches library.ts renderHome
           ═══════════════════════════════════════════════════════════════════ */
        .library-view {
            width: 100%;
            height: 100%;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 60px 20px 80px;
            position: relative;
        }
        .library-bg-orb {
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
        }
        .library-bg-orb.orb-1 {
            top: -20%; left: -10%;
            width: 50vw; height: 50vw;
            background: radial-gradient(circle, rgba(229,9,20,0.1) 0%, transparent 70%);
        }
        .library-bg-orb.orb-2 {
            bottom: -20%; right: -10%;
            width: 60vw; height: 60vw;
            background: radial-gradient(circle, rgba(0,200,255,0.05) 0%, transparent 70%);
        }
        .library-title {
            font-family: var(--font-display);
            font-size: 3.5rem;
            font-weight: 700;
            letter-spacing: -1px;
            margin-bottom: 8px;
            text-shadow: 0 4px 20px rgba(0,0,0,0.5);
            z-index: 1;
        }
        .library-subtitle {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.35);
            margin-bottom: 24px;
            z-index: 1;
            font-family: monospace;
            letter-spacing: 0.5px;
        }
        .chapter-grid {
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 1200px;
            width: 100%;
            padding: 20px;
            z-index: 1;
        }

        /* ═══════════════════════════════════════════════════════════════════
           CHAPTER CARDS — matches library.ts updateChapterList
           ═══════════════════════════════════════════════════════════════════ */
        .chapter-card {
            position: relative;
            width: 220px;
            height: 330px;
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
            text-align: center;
        }
        .chapter-card:hover {
            border-color: var(--accent);
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(229,9,20,0.3);
        }
        .chapter-card-bg {
            position: absolute;
            inset: 0;
            background-size: cover;
            background-position: center;
            background-color: #222;
        }
        .chapter-card-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
            opacity: 0.8;
            transition: opacity 0.3s;
        }
        .chapter-card:hover .chapter-card-overlay {
            opacity: 1;
        }
        .chapter-card-info {
            position: absolute;
            bottom: 0;
            width: 100%;
            padding: 25px 20px;
        }
        .chapter-card-name {
            margin: 0;
            font-size: 1.3rem;
            font-family: var(--font-display);
            font-weight: 600;
            text-shadow: 0 2px 10px rgba(0,0,0,0.8);
            color: white;
            letter-spacing: 0;
            line-height: 1.3;
        }

        /* ═══════════════════════════════════════════════════════════════════
           READER — matches reader.css
           ═══════════════════════════════════════════════════════════════════ */
        .reader-shell {
            background: #000;
            color: white;
            height: 100vh;
            width: 100%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .reader-toolbar {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 24px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 100;
            background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
            pointer-events: none;
            transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            box-sizing: border-box;
        }

        .reader-toolbar-title {
            margin: 0;
            font-size: 1.4rem;
            font-family: var(--font-display);
            font-weight: 500;
            pointer-events: auto;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
            letter-spacing: 0.5px;
            color: rgba(255, 255, 255, 0.9);
        }

        .reader-toolbar-actions {
            display: flex;
            align-items: center;
            gap: 12px;
            pointer-events: auto;
        }

        .toolbar-volume {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .toolbar-volume label {
            cursor: pointer;
            font-size: 1.1rem;
            user-select: none;
        }
        .toolbar-volume input[type="range"] {
            width: 80px;
            cursor: pointer;
            -webkit-appearance: none;
            appearance: none;
            height: 4px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            outline: none;
            border: none;
            padding: 0;
        }
        .toolbar-volume input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--accent);
            cursor: pointer;
            box-shadow: 0 0 6px var(--accent-glow);
        }

        .reader-toolbar-zoom {
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 999px;
            padding: 4px;
            gap: 4px;
            display: flex;
            align-items: center;
            backdrop-filter: blur(10px);
        }
        .reader-toolbar-zoom button {
            min-width: 32px;
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 13px;
            background: transparent;
            border: none;
            color: var(--text-primary);
        }
        .reader-toolbar-zoom button:hover {
            background: rgba(255,255,255,0.1);
        }
        .reader-toolbar-zoom span {
            font-size: 12px;
            color: var(--text-secondary);
            min-width: 40px;
            text-align: center;
            user-select: none;
        }

        .reader-toolbar-btn {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(8px);
            border-radius: 20px;
            padding: 8px 20px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            font-weight: 500;
            font-size: 13px;
            color: var(--text-primary);
        }
        .reader-toolbar-btn:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.3);
        }

        .reader-view {
            flex: 1;
            position: relative;
            background: #000;
            overflow: hidden;
            cursor: default;
        }
        .reader-view.is-zoomed { cursor: grab; }
        .reader-view.is-panning { cursor: grabbing; }

        .reader-zoom-stage {
            position: absolute;
            inset: 0;
            transform-origin: center center;
            will-change: transform;
        }

        .reader-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .reader-standard-layer {
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .reader-cinematic-layer {
            opacity: 0;
            transition: opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .reader-mode-a-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            display: block;
            pointer-events: none;
            user-select: none;
        }

        /* ═══════════════════════════════════════════════════════════════════
           CHAPTER COMPLETE — matches reader.css chapter-complete
           ═══════════════════════════════════════════════════════════════════ */
        .chapter-complete-screen {
            min-height: 100vh;
            width: 100%;
            background:
                radial-gradient(ellipse 70% 45% at 50% 35%, rgba(229, 9, 20, 0.12), transparent 72%),
                linear-gradient(180deg, #101018 0%, #050507 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 28px;
            box-sizing: border-box;
            color: var(--text-primary);
        }

        .chapter-complete-panel {
            width: min(520px, 100%);
            text-align: center;
        }

        .chapter-complete-kicker {
            font-family: var(--font-display);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: var(--accent-gold);
            margin-bottom: 14px;
        }

        .chapter-complete-panel h1 {
            margin: 0;
            font-family: var(--font-display);
            font-size: 46px;
            line-height: 1.05;
            font-weight: 700;
            letter-spacing: 0;
            color: #fff;
            text-shadow: 0 0 36px rgba(229, 9, 20, 0.28);
        }

        .chapter-complete-panel p {
            margin: 14px auto 30px;
            max-width: 440px;
            color: var(--text-secondary);
            font-size: 15px;
            line-height: 1.5;
            overflow-wrap: anywhere;
        }

        .chapter-complete-actions {
            display: flex;
            justify-content: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .chapter-complete-actions button {
            min-width: 150px;
            padding: 11px 18px;
            font-family: var(--font-display);
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .chapter-complete-primary {
            background: var(--accent) !important;
            border-color: var(--accent) !important;
            color: #fff !important;
            box-shadow: 0 8px 24px var(--accent-glow);
        }
        .chapter-complete-primary:hover {
            background: var(--accent-hover) !important;
        }

        /* ═══════════════════════════════════════════════════════════════════
           ANIMATIONS
           ═══════════════════════════════════════════════════════════════════ */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fadeIn 0.5s ease-out both; }

        /* ═══════════════════════════════════════════════════════════════════
           RESPONSIVE
           ═══════════════════════════════════════════════════════════════════ */
        @media (max-width: 768px) {
            .reader-toolbar {
                padding: 16px 16px;
                flex-wrap: wrap;
                gap: 8px;
            }
            .reader-toolbar-title { font-size: 1rem; }
            .reader-toolbar-actions { gap: 6px; }
            .reader-toolbar-btn { padding: 6px 12px; font-size: 12px; }
            .reader-toolbar-zoom button { min-width: 28px; padding: 4px 6px; }
            .toolbar-volume input[type="range"] { width: 50px; }
            .library-title { font-size: 2.2rem; }
            .chapter-card { width: 160px; height: 240px; }
            .chapter-card-name { font-size: 1rem; }
            .chapter-complete-panel h1 { font-size: 32px; }
        }
    </style>
</head>
<body>
    <div id="app">
        <div class="loading-screen" id="loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading library…</div>
        </div>
    </div>

    <script>
    (function() {
        'use strict';

        // ─── State ────────────────────────────────────────────────────────
        var S = {
            chapters: [],
            currentChapter: null,
            images: [],
            audioFiles: [],
            audioLinks: {},
            sortedRegions: [],
            currentRegionIndex: 0,
            currentImageIndex: 0,
            bState: 'IDLE',
            activeAudioTrack: null,
            globalVolume: 1,
            isLayerFgActive: true,
            visitedBlurRegions: [],
            currentBlurGroupId: null,
            blurClipId: '',
            currentFolder: '',

            // Zoom & Pan state — ported from viewer.ts state
            ZOOM_MAX: 4.0,
            ZOOM_STEP_FACTOR: 1.15,
            DRAG_THRESHOLD: 6,
            zoom: 1,
            fitZoom: 1,
            panX: 0,
            panY: 0,
            isPanning: false,
            pointerStartX: 0,
            pointerStartY: 0,
            panStartX: 0,
            panStartY: 0,
            didDrag: false,
            suppressNextClick: false,
            _scrollAccum: 0,

            hideTimer: null,
            _prevVolume: 1,
            detachEvents: null
        };

        var app = document.getElementById('app');
        var currentNavHandler = null;

        // ─── Zoom / Pan Helpers — ported from viewer.ts ──────────────────

        function getReaderView() {
            return document.getElementById('reader-view');
        }

        function getReaderStage() {
            return document.getElementById('reader-zoom-stage');
        }

        function getReaderZoomLabel() {
            return document.getElementById('reader-zoom-label');
        }

        function clampReaderPan(nextPanX, nextPanY, nextZoom) {
            if (typeof nextZoom === 'undefined') nextZoom = S.zoom;
            var view = getReaderView();
            if (!view || nextZoom <= S.fitZoom + 0.001) {
                return { x: 0, y: 0 };
            }
            var maxPanX = Math.max(0, (view.clientWidth * nextZoom - view.clientWidth) / 2);
            var maxPanY = Math.max(0, (view.clientHeight * nextZoom - view.clientHeight) / 2);
            return {
                x: Math.max(-maxPanX, Math.min(maxPanX, nextPanX)),
                y: Math.max(-maxPanY, Math.min(maxPanY, nextPanY))
            };
        }

        function syncReaderViewport() {
            var stage = getReaderStage();
            var label = getReaderZoomLabel();
            var view = getReaderView();
            if (!stage || !view) return;

            var clampedPan = clampReaderPan(S.panX, S.panY);
            S.panX = clampedPan.x;
            S.panY = clampedPan.y;

            stage.style.transform = 'translate(' + S.panX + 'px, ' + S.panY + 'px) scale(' + S.zoom + ')';
            if (label) {
                label.textContent = Math.round(S.zoom * 100) + '%';
            }

            if (S.zoom > S.fitZoom + 0.001) {
                view.classList.add('is-zoomed');
            } else {
                view.classList.remove('is-zoomed');
            }
            if (S.isPanning) {
                view.classList.add('is-panning');
            } else {
                view.classList.remove('is-panning');
            }
        }

        function getReaderViewportCenter() {
            var view = getReaderView();
            var rect = view ? view.getBoundingClientRect() : null;
            return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
        }

        function setReaderZoom(nextZoom, anchorClientX, anchorClientY) {
            var stage = getReaderStage();
            if (!stage) return;

            var clampedZoom = Math.min(S.ZOOM_MAX, Math.max(S.fitZoom, parseFloat(nextZoom.toFixed(4))));
            if (Math.abs(clampedZoom - S.zoom) < 0.0001) return;

            var previousZoom = S.zoom;
            var previousRect = stage.getBoundingClientRect();
            var naturalX = (anchorClientX - previousRect.left) / previousZoom;
            var naturalY = (anchorClientY - previousRect.top) / previousZoom;

            S.zoom = clampedZoom;
            syncReaderViewport();

            requestAnimationFrame(function() {
                var nextRect = stage.getBoundingClientRect();
                var renderedX = nextRect.left + naturalX * S.zoom;
                var renderedY = nextRect.top + naturalY * S.zoom;
                S.panX += anchorClientX - renderedX;
                S.panY += anchorClientY - renderedY;
                syncReaderViewport();
            });
        }

        function stepReaderZoom(direction) {
            var anchor = getReaderViewportCenter();
            var nextZoom = direction === 'in'
                ? S.zoom * S.ZOOM_STEP_FACTOR
                : S.zoom / S.ZOOM_STEP_FACTOR;
            setReaderZoom(nextZoom, anchor.x, anchor.y);
        }

        function resetReaderZoomToFit() {
            S.fitZoom = 1;
            S.zoom = S.fitZoom;
            S.panX = 0;
            S.panY = 0;
            syncReaderViewport();
        }

        function animateReaderTo(targetZoom, targetPanX, targetPanY, durationMs) {
            if (typeof durationMs === 'undefined') durationMs = 600;
            var stage = getReaderStage();
            var label = getReaderZoomLabel();
            var view = getReaderView();
            if (!stage || !view) return;

            stage.style.transition = 'transform ' + durationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)';

            S.zoom = targetZoom;
            S.panX = targetPanX;
            S.panY = targetPanY;

            stage.style.transform = 'translate(' + S.panX + 'px, ' + S.panY + 'px) scale(' + S.zoom + ')';
            if (label) {
                label.textContent = Math.round(S.zoom * 100) + '%';
            }

            if (S.zoom > S.fitZoom + 0.001) {
                view.classList.add('is-zoomed');
            } else {
                view.classList.remove('is-zoomed');
            }

            setTimeout(function() {
                if (stage) stage.style.transition = '';
            }, durationMs + 50);
        }

        // ─── Toolbar chrome helpers ──────────────────────────────────────

        function isToolbarTarget(target) {
            return target && target.closest && !!target.closest('#reader-toolbar');
        }

        function scheduleToolbarHide() {
            if (S.hideTimer) clearTimeout(S.hideTimer);
            S.hideTimer = setTimeout(function() {
                var toolbar = document.getElementById('reader-toolbar');
                if (toolbar) toolbar.style.opacity = '0';
                var view = getReaderView();
                if (view && !S.isPanning) view.style.cursor = 'none';
            }, 3000);
        }

        function revealToolbarChrome() {
            var toolbar = document.getElementById('reader-toolbar');
            if (toolbar) toolbar.style.opacity = '1';
            var view = getReaderView();
            if (view) {
                if (S.isPanning) {
                    view.style.cursor = 'grabbing';
                } else if (S.zoom > S.fitZoom + 0.001) {
                    view.style.cursor = 'grab';
                } else {
                    view.style.cursor = 'default';
                }
            }
            if (!S.isPanning) scheduleToolbarHide();
        }

        // ─── Teardown ────────────────────────────────────────────────────

        function teardownReaderInteractions() {
            if (S.detachEvents) {
                S.detachEvents();
                S.detachEvents = null;
            }
            document.removeEventListener('keydown', handleReaderKey);
            if (S.hideTimer) {
                clearTimeout(S.hideTimer);
                S.hideTimer = null;
            }
            S.isPanning = false;
            S.didDrag = false;
            S.suppressNextClick = false;
        }

        // ─── Library ──────────────────────────────────────────────────────

        async function loadLibrary() {
            teardownReaderInteractions();
            stopAllAudio();
            try {
                var res = await fetch('/api/library');
                S.chapters = await res.json();
                renderLibrary();
            } catch (e) {
                app.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-secondary);">Failed to load library. Is the server running?</div>';
            }
        }

        function renderLibrary() {
            app.innerHTML = '';
            var view = document.createElement('div');
            view.className = 'library-view';
            view.innerHTML =
                '<div class="library-bg-orb orb-1"></div>' +
                '<div class="library-bg-orb orb-2"></div>' +
                '<h1 class="library-title">Cinematic Library</h1>' +
                '<p class="library-subtitle">Select a chapter to begin reading</p>' +
                '<div class="chapter-grid" id="chapter-grid"></div>';
            app.appendChild(view);

            var grid = document.getElementById('chapter-grid');
            S.chapters.forEach(function(ch, idx) {
                var card = document.createElement('div');
                card.className = 'chapter-card fade-in';
                card.style.animationDelay = (idx * 0.05) + 's';
                card.innerHTML =
                    '<div class="chapter-card-bg" style="background-image:url(/api/covers/' + encodeURIComponent(ch.folder) + ')"></div>' +
                    '<div class="chapter-card-overlay"></div>' +
                    '<div class="chapter-card-info">' +
                        '<h3 class="chapter-card-name">' + escapeHtml(ch.name) + '</h3>' +
                    '</div>';
                card.addEventListener('click', function() { loadChapter(ch.folder); });
                grid.appendChild(card);
            });
        }

        // ─── Load Chapter ─────────────────────────────────────────────────

        async function loadChapter(folder) {
            app.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading chapter…</div></div>';

            try {
                var res = await fetch('/api/chapter/' + encodeURIComponent(folder));
                var data = await res.json();

                S.currentChapter = data.chapter;
                S.images = data.images;
                S.audioFiles = data.audioFiles;
                S.audioLinks = data.audioLinks || {};
                S.currentFolder = folder;

                if (S.currentChapter && S.currentChapter.regions && S.currentChapter.regions.length > 0) {
                    startModeB();
                } else {
                    startModeA();
                }
            } catch (e) {
                app.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-secondary);">Failed to load chapter.</div>';
            }
        }

        // ─── Get Chapter Title ────────────────────────────────────────────

        function getCurrentChapterTitle() {
            if (S.currentChapter && S.currentChapter.imagesFolder) {
                return S.currentChapter.imagesFolder;
            }
            return S.currentFolder || 'Chapter';
        }

        // ─── Reader UI — matches viewer.ts renderReaderUI ─────────────────

        function renderReaderUI(modeTitle) {
            teardownReaderInteractions();
            app.innerHTML = '';

            var shell = document.createElement('div');
            shell.className = 'reader-shell';
            shell.innerHTML =
                '<div class="reader-toolbar" id="reader-toolbar">' +
                    '<h2 class="reader-toolbar-title">' + escapeHtml(modeTitle) + '</h2>' +
                    '<div class="reader-toolbar-actions">' +
                        '<div class="toolbar-volume">' +
                            '<label for="reader-volume" title="Volume" id="volume-label">🔊</label>' +
                            '<input type="range" id="reader-volume" min="0" max="1" step="0.01" value="' + S.globalVolume + '">' +
                        '</div>' +
                        '<div class="reader-toolbar-zoom">' +
                            '<button id="reader-zoom-out" title="Zoom Out">−</button>' +
                            '<span id="reader-zoom-label">100%</span>' +
                            '<button id="reader-zoom-in" title="Zoom In">+</button>' +
                            '<button id="reader-zoom-fit" title="Fit to View">Fit</button>' +
                        '</div>' +
                        '<button id="btn-toggle-mode" class="reader-toolbar-btn" style="border-color: var(--accent); color: var(--accent);">' +
                            (S.sortedRegions.length > 0 ? 'Standard Mode' : 'Cinematic Mode') +
                        '</button>' +
                        '<button id="btn-close-reader" class="reader-toolbar-btn">Exit Chapter</button>' +
                    '</div>' +
                '</div>' +
                '<div id="reader-view" class="reader-view">' +
                    '<div id="reader-zoom-stage" class="reader-zoom-stage">' +
                        '<div id="reader-standard-layer" class="reader-layer reader-standard-layer"></div>' +
                        '<div id="layer-bg" class="reader-layer reader-cinematic-layer"></div>' +
                        '<div id="layer-fg" class="reader-layer reader-cinematic-layer"></div>' +
                    '</div>' +
                '</div>';

            app.appendChild(shell);

            // Reset zoom/pan state
            S.fitZoom = 1;
            S.zoom = 1;
            S.panX = 0;
            S.panY = 0;
            S.isPanning = false;
            S.didDrag = false;
            S.suppressNextClick = false;
            S._scrollAccum = 0;
            syncReaderViewport();
            revealToolbarChrome();

            var readerView = getReaderView();
            if (!readerView) return;

            // ─── Event bindings (matches viewer.ts) ──────────────────────

            var onShellMouseMove = function() {
                revealToolbarChrome();
            };

            var onReaderMouseDown = function(e) {
                if (e.button !== 0 || S.zoom <= S.fitZoom + 0.001 || isToolbarTarget(e.target)) return;
                S.isPanning = true;
                S.didDrag = false;
                S.pointerStartX = e.clientX;
                S.pointerStartY = e.clientY;
                S.panStartX = S.panX;
                S.panStartY = S.panY;
                syncReaderViewport();
                revealToolbarChrome();
                e.preventDefault();
            };

            var onReaderMouseMove = function(e) {
                revealToolbarChrome();
                if (!S.isPanning) return;

                var deltaX = e.clientX - S.pointerStartX;
                var deltaY = e.clientY - S.pointerStartY;
                if (Math.abs(deltaX) > S.DRAG_THRESHOLD || Math.abs(deltaY) > S.DRAG_THRESHOLD) {
                    S.didDrag = true;
                }

                S.panX = S.panStartX + deltaX;
                S.panY = S.panStartY + deltaY;
                syncReaderViewport();
            };

            var onReaderMouseUp = function() {
                if (!S.isPanning) return;
                S.isPanning = false;
                if (S.didDrag) {
                    S.suppressNextClick = true;
                }
                syncReaderViewport();
                revealToolbarChrome();
            };

            var onReaderClick = function(e) {
                if (isToolbarTarget(e.target)) return;
                if (S.suppressNextClick) {
                    S.suppressNextClick = false;
                    return;
                }
                handleReaderClick(e);
            };

            var onReaderWheel = function(e) {
                e.preventDefault();
                revealToolbarChrome();

                if (e.ctrlKey) {
                    // Pinch zoom
                    var PINCH_SENSITIVITY = 0.008;
                    var delta = -e.deltaY * PINCH_SENSITIVITY;
                    var scale = Math.exp(delta);
                    var nextZoom = S.zoom * scale;
                    setReaderZoom(nextZoom, e.clientX, e.clientY);
                } else {
                    if (S.zoom > S.fitZoom + 0.001) {
                        // Pan when zoomed
                        var PAN_SENSITIVITY = 1.0;
                        var dx = e.deltaX * PAN_SENSITIVITY;
                        var dy = e.deltaY * PAN_SENSITIVITY;
                        S.panX -= dx;
                        S.panY -= dy;
                        syncReaderViewport();
                    } else {
                        // Scroll to navigate at fit zoom
                        S._scrollAccum = (S._scrollAccum || 0) + e.deltaY;
                        if (Math.abs(S._scrollAccum) >= 80) {
                            var dir = S._scrollAccum > 0 ? 'next' : 'prev';
                            S._scrollAccum = 0;
                            if (dir === 'next') {
                                handleReaderClick();
                            } else {
                                handleReaderClick({ clientX: 0, clientY: 0 });
                            }
                        }
                    }
                }
            };

            shell.addEventListener('mousemove', onShellMouseMove);
            readerView.addEventListener('mousedown', onReaderMouseDown);
            readerView.addEventListener('click', onReaderClick);
            readerView.addEventListener('wheel', onReaderWheel, { passive: false });
            window.addEventListener('mousemove', onReaderMouseMove);
            window.addEventListener('mouseup', onReaderMouseUp);
            document.removeEventListener('keydown', handleReaderKey);
            document.addEventListener('keydown', handleReaderKey);

            // Volume
            document.getElementById('reader-volume').addEventListener('input', function(e) {
                S.globalVolume = parseFloat(e.target.value);
                if (S.activeAudioTrack) {
                    S.activeAudioTrack.volume = S.activeAudioTrack._baseVolume * S.globalVolume;
                }
                document.getElementById('volume-label').textContent = S.globalVolume === 0 ? '🔇' : S.globalVolume < 0.5 ? '🔉' : '🔊';
            });

            document.getElementById('volume-label').addEventListener('click', function(e) {
                e.stopPropagation();
                var slider = document.getElementById('reader-volume');
                if (S.globalVolume > 0) {
                    S._prevVolume = S.globalVolume;
                    S.globalVolume = 0;
                    slider.value = 0;
                } else {
                    S.globalVolume = S._prevVolume || 1;
                    slider.value = S.globalVolume;
                }
                if (S.activeAudioTrack) {
                    S.activeAudioTrack.volume = S.activeAudioTrack._baseVolume * S.globalVolume;
                }
                this.textContent = S.globalVolume === 0 ? '🔇' : S.globalVolume < 0.5 ? '🔉' : '🔊';
            });

            // Zoom buttons
            document.getElementById('reader-zoom-in').addEventListener('click', function(e) {
                e.stopPropagation();
                revealToolbarChrome();
                stepReaderZoom('in');
            });
            document.getElementById('reader-zoom-out').addEventListener('click', function(e) {
                e.stopPropagation();
                revealToolbarChrome();
                stepReaderZoom('out');
            });
            document.getElementById('reader-zoom-fit').addEventListener('click', function(e) {
                e.stopPropagation();
                revealToolbarChrome();
                resetReaderZoomToFit();
            });

            // Mode toggle
            document.getElementById('btn-toggle-mode').addEventListener('click', function(e) {
                e.stopPropagation();
                if (S.sortedRegions.length > 0) {
                    startModeA();
                } else {
                    if (S.currentChapter && S.currentChapter.regions && S.currentChapter.regions.length > 0) {
                        startModeB();
                    }
                }
            });

            // Exit button
            document.getElementById('btn-close-reader').addEventListener('click', function(e) {
                e.stopPropagation();
                stopAllAudio();
                loadLibrary();
            });

            // Touch support
            readerView.addEventListener('touchstart', function() {
                revealToolbarChrome();
            });

            S.detachEvents = function() {
                shell.removeEventListener('mousemove', onShellMouseMove);
                readerView.removeEventListener('mousedown', onReaderMouseDown);
                readerView.removeEventListener('click', onReaderClick);
                readerView.removeEventListener('wheel', onReaderWheel);
                window.removeEventListener('mousemove', onReaderMouseMove);
                window.removeEventListener('mouseup', onReaderMouseUp);
            };
        }

        // ─── Reader Click Handler — matches viewer.ts handleReaderClick ──

        function handleReaderClick(e) {
            var dir = 1; // default: forward
            if (e) {
                var view = getReaderView();
                if (view) {
                    var rect = view.getBoundingClientRect();
                    // Right half = backward, Left half = forward (manga style)
                    if (e.clientX > rect.left + rect.width * 0.5) {
                        dir = -1;
                    }
                }
            }

            if (S.sortedRegions.length > 0) {
                navigateB(dir);
            } else {
                navigateA(dir);
            }
        }

        // ─── Keyboard handler — matches viewer.ts handleKey ──────────────

        function handleReaderKey(e) {
            if (isToolbarTarget(e.target)) return;

            if (e.key === 'ArrowLeft' || e.key === ' ') {
                e.preventDefault();
                if (S.sortedRegions.length > 0) navigateB(1);
                else navigateA(1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (S.sortedRegions.length > 0) navigateB(-1);
                else navigateA(-1);
            } else if (e.key === '+' || (e.key === '=' && e.shiftKey)) {
                e.preventDefault();
                revealToolbarChrome();
                stepReaderZoom('in');
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                revealToolbarChrome();
                stepReaderZoom('out');
            } else if (e.key === '0') {
                e.preventDefault();
                revealToolbarChrome();
                resetReaderZoomToFit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                stopAllAudio();
                loadLibrary();
            }
        }

        // ─── Mode A (Standard) ────────────────────────────────────────────

        function startModeA() {
            S.sortedRegions = [];
            S.currentImageIndex = 0;
            renderReaderUI('Standard Mode');
            renderImageA();
        }

        function renderImageA() {
            if (S.currentImageIndex >= S.images.length) {
                renderComplete('standard');
                return;
            }

            var imgSrc = '/api/images/' + encodeURIComponent(S.currentFolder) + '/' + encodeURIComponent(S.images[S.currentImageIndex]);
            var stdLayer = document.getElementById('reader-standard-layer');
            if (stdLayer) {
                stdLayer.style.opacity = '1';
                stdLayer.innerHTML = '<img class="reader-mode-a-image" src="' + imgSrc + '" />';
            }
            var bg = document.getElementById('layer-bg');
            var fg = document.getElementById('layer-fg');
            if (bg) { bg.innerHTML = ''; bg.style.opacity = '0'; }
            if (fg) { fg.innerHTML = ''; fg.style.opacity = '0'; }

            var img = stdLayer ? stdLayer.querySelector('img') : null;
            if (img) {
                if (img.complete && img.naturalWidth > 0) {
                    resetReaderZoomToFit();
                } else {
                    img.onload = function() {
                        resetReaderZoomToFit();
                    };
                }
            }
        }

        function navigateA(direction) {
            S.currentImageIndex += direction;
            if (S.currentImageIndex < 0) { S.currentImageIndex = 0; return; }
            renderImageA();
        }

        // ─── Mode B (Cinematic) ───────────────────────────────────────────

        function startModeB() {
            if (!S.currentChapter || !S.currentChapter.regions || S.currentChapter.regions.length === 0) {
                startModeA();
                return;
            }

            S.sortedRegions = S.currentChapter.regions.slice().sort(function(a, b) { return a.order - b.order; });
            S.currentRegionIndex = 0;
            S.bState = 'IDLE';
            S.isLayerFgActive = true;
            stopAllAudio();
            renderReaderUI('Cinematic Mode');
            advanceRegionB();
        }

        function navigateB(direction) {
            if (S.bState !== 'WAIT_INPUT') return;
            var next = S.currentRegionIndex + direction;
            if (next < 0) return;
            S.currentRegionIndex = next;
            advanceRegionB();
        }

        function advanceRegionB() {
            if (S.currentRegionIndex >= S.sortedRegions.length) {
                renderComplete('cinematic');
                return;
            }

            var region = S.sortedRegions[S.currentRegionIndex];
            S.bState = 'PLAYING';

            var imgName = region.imageId;
            var imgSrc = '/api/images/' + encodeURIComponent(S.currentFolder) + '/' + encodeURIComponent(imgName);

            handleAudio(region);

            var imgConfig = (S.currentChapter.imagesConfig || {})[imgName] || {};
            var isBlurMode = imgConfig.blurMode;
            var keepPrevious = (typeof region.keepPrevious === 'boolean') ? region.keepPrevious : (imgConfig.keepPreviousVisible || false);
            var transitionType = region.transitionType ? region.transitionType : (isBlurMode ? 'blur' : 'sharp');

            var isFirstBlurEntry = false;
            if (transitionType === 'blur' && S.currentRegionIndex > 0) {
                var prevRegion = S.sortedRegions[S.currentRegionIndex - 1];
                var prevImgConfig = (S.currentChapter.imagesConfig || {})[prevRegion.imageId] || {};
                var prevIsBlur = prevImgConfig.blurMode;
                var prevTransType = prevRegion.transitionType ? prevRegion.transitionType : (prevIsBlur ? 'blur' : 'sharp');
                if (prevTransType !== 'blur') isFirstBlurEntry = true;
            }

            var blurSharp = (isBlurMode && region.transitionType === 'sharp') || isFirstBlurEntry;
            S.currentBlurGroupId = region.blurGroupId || null;

            var stdLayer = document.getElementById('reader-standard-layer');
            if (stdLayer) { stdLayer.innerHTML = ''; stdLayer.style.opacity = '0'; }

            renderRegionFrame(imgSrc, region.rect, transitionType, { sharp: blurSharp, keepPrevious: keepPrevious }, region);
            S.bState = 'WAIT_INPUT';
        }

        function autoFocusOnBlurRegions(blurRegions, imgScale, imgW, imgH) {
            var view = getReaderView();
            if (!view || blurRegions.length === 0) return;

            var viewW = view.clientWidth;
            var viewH = view.clientHeight;

            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (var i = 0; i < blurRegions.length; i++) {
                var r = blurRegions[i];
                minX = Math.min(minX, r.rect.x);
                minY = Math.min(minY, r.rect.y);
                maxX = Math.max(maxX, r.rect.x + r.rect.w);
                maxY = Math.max(maxY, r.rect.y + r.rect.h);
            }

            var boxCenterX = viewW / 2 - (imgW * imgScale) / 2 + ((minX + maxX) / 2) * imgScale;
            var boxCenterY = viewH / 2 - (imgH * imgScale) / 2 + ((minY + maxY) / 2) * imgScale;
            var boxW = (maxX - minX) * imgScale;
            var boxH = (maxY - minY) * imgScale;

            var focusPadding = 80;
            var targetZoom = Math.min(
                (viewW - focusPadding * 2) / boxW,
                (viewH - focusPadding * 2) / boxH,
                S.ZOOM_MAX
            );
            var clampedZoom = Math.max(S.fitZoom, targetZoom);

            var targetPanX = (viewW / 2 - boxCenterX) * clampedZoom;
            var targetPanY = (viewH / 2 - boxCenterY) * clampedZoom;

            animateReaderTo(clampedZoom, targetPanX, targetPanY);
        }

        function renderRegionFrame(imgUrl, rect, transitionType, blurOpts, region) {
            var layerFg = document.getElementById('layer-fg');
            var layerBg = document.getElementById('layer-bg');
            if (!layerFg || !layerBg) return;

            var activeLayer = S.isLayerFgActive ? layerFg : layerBg;
            var inactiveLayer = S.isLayerFgActive ? layerBg : layerFg;

            var view = getReaderView();
            var viewRect = view ? view.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };

            var html = '';

            if (transitionType === 'blur') {
                S.visitedBlurRegions = [];
                var tempMasked = null;
                var tempGroupId = null;

                for (var i = 0; i <= S.currentRegionIndex; i++) {
                    var r = S.sortedRegions[i];
                    var rImgSrc = '/api/images/' + encodeURIComponent(S.currentFolder) + '/' + encodeURIComponent(r.imageId);
                    var rGroupId = r.blurGroupId || null;

                    if (tempMasked !== rImgSrc || tempGroupId !== rGroupId) {
                        tempMasked = rImgSrc;
                        S.visitedBlurRegions = [];
                        tempGroupId = rGroupId;
                    }

                    var rImgConfig = (S.currentChapter.imagesConfig || {})[r.imageId] || {};
                    var rKeep = (typeof r.keepPrevious === 'boolean') ? r.keepPrevious : (rImgConfig.keepPreviousVisible || false);

                    if (rKeep) {
                        S.visitedBlurRegions.push(r);
                    } else {
                        S.visitedBlurRegions = [r];
                    }
                }

                S.blurClipId = 'blur-clip-' + Date.now();
                var renderFullBg = !S.currentBlurGroupId;

                if (blurOpts.keepPrevious) {
                    html =
                        '<div style="position:relative;width:100%;height:100%;display:flex;justify-content:center;align-items:center;overflow:hidden;">' +
                        '<div id="blur-wrap" style="position:absolute;transform:translate(-50%,-50%);top:50%;left:50%;">' +
                        '<svg width="0" height="0" style="position:absolute"><defs><clipPath id="' + S.blurClipId + '"></clipPath></defs></svg>' +
                        (renderFullBg ? '<img class="anim-img-bg" src="' + imgUrl + '" style="display:block;position:absolute;top:0;left:0;width:100%;height:100%;filter:blur(12px) brightness(0.45);" />' : '') +
                        '<img class="anim-img-fg" src="' + imgUrl + '" style="position:absolute;top:0;left:0;width:100%;height:100%;clip-path:url(#' + S.blurClipId + ');" />' +
                        '</div></div>';
                } else {
                    html =
                        '<div style="position:relative;width:100%;height:100%;display:flex;justify-content:center;align-items:center;overflow:hidden;">' +
                        '<div id="blur-wrap" style="position:absolute;transform:translate(-50%,-50%);top:50%;left:50%;">' +
                        (renderFullBg ? '<img class="anim-img-bg" src="' + imgUrl + '" style="display:block;position:absolute;top:0;left:0;width:100%;height:100%;filter:blur(12px) brightness(0.45);" />' : '') +
                        '<img class="anim-img-fg" src="' + imgUrl + '" style="position:absolute;top:0;left:0;width:100%;height:100%;" />' +
                        '</div></div>';
                }
            } else {
                var scaleW = viewRect.width / (rect.w || 1);
                var scaleH = viewRect.height / (rect.h || 1);
                var scale = Math.min(scaleW, scaleH);

                var clipPathStyle = '';
                if (region && region.shapeType === 'polygon' && region.polygon) {
                    var points = region.polygon.map(function(p) { return (p.x - rect.x) * scale + 'px ' + (p.y - rect.y) * scale + 'px'; }).join(', ');
                    clipPathStyle = 'clip-path: polygon(' + points + ');';
                }

                html =
                    '<div style="position:relative;overflow:hidden;width:' + (rect.w * scale) + 'px;height:' + (rect.h * scale) + 'px;box-shadow:0 0 50px rgba(0,0,0,0.8);border:2px solid #222;' + clipPathStyle + '">' +
                    '<img class="anim-img-fg" src="' + imgUrl + '" style="position:absolute;transform-origin:top left;width:100%;transform:translate(-' + (rect.x * scale) + 'px,-' + (rect.y * scale) + 'px);transition:transform 0.8s ease-in-out;" />' +
                    '</div>';
            }

            inactiveLayer.innerHTML = html;
            var imgFg = inactiveLayer.querySelector('.anim-img-fg');

            var finalizeFrame = function() {
                var targetVisibleLayer = inactiveLayer;
                var targetHiddenLayer = activeLayer;

                S.isLayerFgActive = !S.isLayerFgActive;
                var imgW = imgFg.naturalWidth;
                var imgH = imgFg.naturalHeight;

                if (transitionType === 'blur') {
                    var bScaleW = viewRect.width / (imgW || 1);
                    var bScaleH = viewRect.height / (imgH || 1);
                    var bScale = Math.min(bScaleW, bScaleH);

                    var wrap = targetVisibleLayer.querySelector('#blur-wrap') || targetVisibleLayer.querySelector('div[id^="blur-wrap"]');
                    if (wrap) {
                        wrap.style.width = (imgW * bScale) + 'px';
                        wrap.style.height = (imgH * bScale) + 'px';
                    }

                    if (blurOpts.keepPrevious) {
                        var clipEl = document.getElementById(S.blurClipId);
                        if (clipEl) {
                            S.visitedBlurRegions.forEach(function(r) {
                                if (r.shapeType === 'polygon' && r.polygon) {
                                    var svgPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                                    var pts = r.polygon.map(function(p) { return (p.x * bScale) + ',' + (p.y * bScale); }).join(' ');
                                    svgPoly.setAttribute('points', pts);
                                    clipEl.appendChild(svgPoly);
                                } else {
                                    var svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                                    svgRect.setAttribute('x', String(r.rect.x * bScale));
                                    svgRect.setAttribute('y', String(r.rect.y * bScale));
                                    svgRect.setAttribute('width', String(r.rect.w * bScale));
                                    svgRect.setAttribute('height', String(r.rect.h * bScale));
                                    svgRect.setAttribute('rx', '6');
                                    svgRect.setAttribute('ry', '6');
                                    clipEl.appendChild(svgRect);
                                }
                            });
                        }
                        imgFg.style.transform = 'none';
                    } else {
                        imgFg.style.transition = 'none';
                        if (region && region.shapeType === 'polygon' && region.polygon) {
                            var polyPts = region.polygon.map(function(p) { return (p.x * bScale) + 'px ' + (p.y * bScale) + 'px'; }).join(', ');
                            imgFg.style.clipPath = 'polygon(' + polyPts + ')';
                        } else {
                            var top = rect.y * bScale;
                            var left = rect.x * bScale;
                            var right = (imgW - (rect.x + rect.w)) * bScale;
                            var bottom = (imgH - (rect.y + rect.h)) * bScale;
                            imgFg.style.clipPath = 'inset(' + top + 'px ' + right + 'px ' + bottom + 'px ' + left + 'px round 6px)';
                        }
                        imgFg.style.transform = 'none';
                    }
                } else {
                    var sScaleW = viewRect.width / (rect.w || 1);
                    var sScaleH = viewRect.height / (rect.h || 1);
                    var sScale = Math.min(sScaleW, sScaleH);

                    imgFg.style.width = (imgW * sScale) + 'px';
                    imgFg.style.height = (imgH * sScale) + 'px';

                    requestAnimationFrame(function() {
                        imgFg.style.transform = 'translate(-' + (rect.x * sScale) + 'px, -' + (rect.y * sScale) + 'px)';
                    });
                }

                var isSharpTrans = transitionType === 'sharp' || (transitionType === 'blur' && blurOpts.sharp);
                var fadeDur = transitionType === 'blur' ? '0.8s' : '1.5s';

                if (isSharpTrans) {
                    targetVisibleLayer.style.transition = 'none';
                    targetHiddenLayer.style.transition = 'none';
                    targetVisibleLayer.style.opacity = '1';
                    targetHiddenLayer.style.opacity = '0';
                    setTimeout(function() {
                        targetVisibleLayer.style.transition = 'opacity ' + fadeDur + ' ease-in-out';
                        targetHiddenLayer.style.transition = 'opacity ' + fadeDur + ' ease-in-out';
                    }, 50);
                } else {
                    targetVisibleLayer.style.transition = 'opacity ' + fadeDur + ' ease-in-out';
                    targetHiddenLayer.style.transition = 'opacity ' + fadeDur + ' ease-in-out';
                    targetVisibleLayer.style.opacity = '1';
                    targetHiddenLayer.style.opacity = '0';
                }

                if (transitionType === 'blur' && blurOpts.keepPrevious && S.currentBlurGroupId && S.visitedBlurRegions.length > 0) {
                    var focusPad = 50;
                    var focusScaleW = (viewRect.width - focusPad * 2) / (imgW || 1);
                    var focusScaleH = (viewRect.height - focusPad * 2) / (imgH || 1);
                    var focusScale = Math.min(focusScaleW, focusScaleH);
                    autoFocusOnBlurRegions(S.visitedBlurRegions, focusScale, imgW, imgH);
                } else {
                    resetReaderZoomToFit();
                }
            };

            if (imgFg.complete && imgFg.naturalWidth > 0) finalizeFrame();
            else imgFg.onload = finalizeFrame;
        }

        // ─── Audio Handling ───────────────────────────────────────────────

        function handleAudio(region) {
            var spans = (S.currentChapter && S.currentChapter.audioSpans) || [];
            var activeSpan = null;
            for (var i = 0; i < spans.length; i++) {
                if (region.order >= spans[i].startRegionOrder && region.order <= spans[i].endRegionOrder) {
                    activeSpan = spans[i];
                    break;
                }
            }

            if (activeSpan) {
                if (activeSpan.trackId === 'silence') {
                    fadeOutAudio();
                } else if (!S.activeAudioTrack || S.activeAudioTrack.trackId !== activeSpan.trackId) {
                    var oldTrack = S.activeAudioTrack;

                    var audioUrl = null;
                    var localMatch = S.audioFiles.find(function(a) { return a === activeSpan.trackId || a === activeSpan.trackId + '.mp3'; });
                    if (localMatch) {
                        audioUrl = '/api/audio/' + encodeURIComponent(localMatch);
                    } else if (S.audioLinks[activeSpan.trackId]) {
                        audioUrl = S.audioLinks[activeSpan.trackId];
                    }

                    if (audioUrl) {
                        var audio = new Audio(audioUrl);
                        audio.loop = activeSpan.loop;
                        if (activeSpan.startTime > 0) audio.currentTime = activeSpan.startTime;

                        audio.addEventListener('timeupdate', function() {
                            if (activeSpan.endTime > 0 && audio.currentTime >= activeSpan.endTime) {
                                if (activeSpan.loop) {
                                    audio.currentTime = activeSpan.startTime || 0;
                                } else {
                                    audio.pause();
                                }
                            }
                        });

                        var newTrack = {
                            element: audio,
                            trackId: activeSpan.trackId,
                            _baseVolume: 0,
                            get volume() { return this.element.volume; },
                            set volume(v) { this.element.volume = v; }
                        };

                        newTrack.volume = 0;
                        audio.play().catch(function() {});
                        S.activeAudioTrack = newTrack;

                        var v = 0;
                        var fadeInt = setInterval(function() {
                            v += 0.05;
                            if (oldTrack && oldTrack.element && oldTrack.element.volume > 0.05) {
                                oldTrack.element.volume -= 0.05;
                            }
                            if (v >= 1) {
                                newTrack._baseVolume = 1;
                                newTrack.volume = S.globalVolume;
                                if (oldTrack && oldTrack.element) { oldTrack.element.pause(); }
                                clearInterval(fadeInt);
                            } else {
                                newTrack._baseVolume = v;
                                newTrack.volume = v * S.globalVolume;
                            }
                        }, 50);
                    }
                }
            } else {
                fadeOutAudio();
            }
        }

        function fadeOutAudio() {
            if (S.activeAudioTrack) {
                var track = S.activeAudioTrack;
                S.activeAudioTrack = null;
                var fadeInt = setInterval(function() {
                    if (track.element.volume > 0.05) {
                        track.element.volume -= 0.05;
                    } else {
                        track.element.pause();
                        clearInterval(fadeInt);
                    }
                }, 50);
            }
        }

        function stopAllAudio() {
            if (S.activeAudioTrack && S.activeAudioTrack.element) {
                S.activeAudioTrack.element.pause();
                S.activeAudioTrack = null;
            }
        }

        // ─── Chapter Complete — matches viewer.ts renderChapterCompleteScreen ──

        function renderComplete(mode) {
            teardownReaderInteractions();
            stopAllAudio();
            S.bState = 'IDLE';

            var modeName = mode === 'cinematic' ? 'Cinematic Mode' : 'Standard Mode';
            var chapterTitle = getCurrentChapterTitle();

            app.innerHTML =
                '<div class="chapter-complete-screen">' +
                    '<div class="chapter-complete-panel">' +
                        '<div class="chapter-complete-kicker">' + escapeHtml(modeName) + '</div>' +
                        '<h1>Chapter Complete</h1>' +
                        '<p>' + escapeHtml(chapterTitle) + '</p>' +
                        '<div class="chapter-complete-actions">' +
                            '<button id="btn-read-again" class="chapter-complete-primary">Read Again</button>' +
                            '<button id="btn-complete-library">Back to Library</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            document.getElementById('btn-read-again').addEventListener('click', function() {
                if (mode === 'cinematic') {
                    startModeB();
                } else {
                    startModeA();
                }
            });
            document.getElementById('btn-complete-library').addEventListener('click', loadLibrary);
        }

        // ─── Touch support for mobile ─────────────────────────────────────

        var touchStartX = 0;
        document.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        document.addEventListener('touchend', function(e) {
            var diff = e.changedTouches[0].screenX - touchStartX;
            if (Math.abs(diff) > 50) {
                // Swipe left = forward, swipe right = back (manga style)
                if (S.sortedRegions.length > 0) {
                    navigateB(diff < 0 ? 1 : -1);
                } else {
                    navigateA(diff < 0 ? 1 : -1);
                }
            }
        }, { passive: true });

        // ─── Utilities ───────────────────────────────────────────────────

        function escapeHtml(s) {
            var d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        }

        // ─── Init ─────────────────────────────────────────────────────────
        loadLibrary();
    })();
    </script>
</body>
</html>`;
}
