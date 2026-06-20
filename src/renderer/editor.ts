import { WorkspaceData, FileData } from '../types/ipc';
import { Region, Rect, Chapter, AudioSpan, Point } from '../types/models';

// ─── Toast Notification System ──────────────────────────────────────────────
interface NotificationEntry {
    message: string;
    type: 'success' | 'error' | 'info';
    time: Date;
}
const notificationLog: NotificationEntry[] = [];
let renderNotificationList = () => {};

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    notificationLog.unshift({ message, type, time: new Date() });
    renderNotificationList();

    let container = document.querySelector('.toast-container') as HTMLElement;
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function initEditor(container: HTMLElement) {
    let workspace: WorkspaceData | null = null;
    let currentImage: FileData | null = null;
    let regions: Region[] = [];
    let audioSpans: AudioSpan[] = [];
    let imagesConfig: Record<string, { blurMode?: boolean; keepPreviousVisible?: boolean }> = {};
    let audioSourceLinks: Record<string, string> = {};

    let isDrawing = false;
    let isDragging = false;
    let isResizing = false;
    let selectedRegionId: string | null = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    let startX = 0, startY = 0;
    let currentRect: Rect | null = null;
    let drawMode: 'rect' | 'polygon' = 'rect';
    let currentPolygonPoints: Point[] = [];
    const RESIZE_HANDLE_SIZE = 10;

    // Zoom state
    let zoom = 0.66;
    let fitZoom = 1;
    const ZOOM_MAX = 4.0;
    const ZOOM_STEP_FACTOR = 1.15;

    // Canvas pan state
    let isSpacePressed = false;
    let isPanningCanvas = false;
    let panStartClientX = 0;
    let panStartClientY = 0;
    let panStartScrollLeft = 0;
    let panStartScrollTop = 0;

    // Audio player state
    let audioPlayerVisible = true;

    // Active tab state
    let activeTab: 'regions' | 'audio' | 'timeline' | 'notifications' = 'regions';

    container.className = 'editor-layout';
    container.innerHTML = `
      <div class="editor-inner">
          <!-- Left Sidebar -->
          <div class="sidebar sidebar-left" id="sidebar-left">
            <div class="sidebar-header">
              <button id="btn-open">Open Dir</button>
              <button id="btn-save" class="primary">Save</button>
              <button id="btn-export">Export</button>
            </div>
            <div class="sidebar-content">
              <h3>Panles</h3>
              <ul id="image-list" class="item-list"></ul>
            </div>
          </div>

          <!-- Left Resize Handle -->
          <div class="resize-handle resize-handle-left" id="resize-left"></div>
    
          <!-- Center -->
          <div class="editor-center" id="editor-center">
            <div class="editor-toolbar">
              <span class="toolbar-tip" id="toolbar-tip">Drag to create region · Right-click to select</span>
              <div class="toolbar-separator"></div>
              <div class="toolbar-group">
                <button id="btn-mode-rect" class="btn-toggle on" title="Rectangle Tool">Rect</button>
                <button id="btn-mode-poly" class="btn-toggle" title="Polygon Tool">Poly</button>
              </div>
              <div class="toolbar-separator"></div>
              <div class="toolbar-zoom">
                <button id="btn-zoom-out" title="Zoom Out">−</button>
                <span id="zoom-label">66%</span>
                <button id="btn-zoom-in" title="Zoom In">+</button>
                <button id="btn-zoom-reset" title="Fit to View">Fit</button>
              </div>
              <div class="toolbar-separator"></div>
              <button id="btn-toggle-audio" class="btn-toolbar-icon" title="Toggle Audio Panel">🎵</button>
              <button id="btn-home" title="Back to Home">⌂ Home</button>
            </div>
            <div class="canvas-area" id="canvas-area">
              <div class="canvas-stage" id="canvas-stage">
                <div class="canvas-wrapper" id="canvas-wrapper">
                   <img id="main-image" />
                   <canvas id="region-canvas"></canvas>
                </div>
              </div>
            </div>
            <!-- Audio Player Panel -->
            <div class="audio-panel" id="audio-panel">
              <div class="audio-panel-inner">
                <select id="player-track-select" class="player-track-select">
                  <option value="">-- Select Track --</option>
                </select>
                <div class="player-controls">
                  <button id="btn-play" class="player-btn" title="Play">▶</button>
                  <button id="btn-pause" class="player-btn" title="Pause">⏸</button>
                  <button id="btn-stop" class="player-btn" title="Stop">⏹</button>
                </div>
                <div class="player-seek-row">
                  <span id="player-time">0:00</span>
                  <input type="range" id="player-seek" class="player-seek" value="0" min="0" max="100" step="0.1" />
                  <span id="player-duration">0:00</span>
                </div>
                <div class="player-vol-row">
                  <span class="vol-label">🔊</span>
                  <input type="range" id="player-volume" class="player-volume" value="80" min="0" max="100" />
                  <label class="loop-label"><input type="checkbox" id="player-loop" /> Loop</label>
                </div>
                <audio id="audio-element"></audio>
              </div>
            </div>
          </div>
    
          <!-- Right Resize Handle -->
          <div class="resize-handle resize-handle-right" id="resize-right"></div>

          <!-- Right Sidebar — Tabbed -->
          <div class="sidebar sidebar-right" id="sidebar-right">
            <div class="sidebar-tabs">
              <button class="sidebar-tab active" data-tab="regions">📐 Regions</button>
              <button class="sidebar-tab" data-tab="audio">🎵 Audio</button>
              <button class="sidebar-tab" data-tab="timeline">📋 Timeline</button>
              <button class="sidebar-tab" data-tab="notifications">🔔 Notifications</button>
            </div>

            <!-- Tab: Regions -->
            <div class="tab-content active" id="tab-regions">
              <h3>Regions</h3>
              <ul id="region-list" class="item-list region-list"></ul>
            </div>

            <!-- Tab: Audio -->
            <div class="tab-content" id="tab-audio">
              <h3>Add Audio Span</h3>
              <div class="audio-span-form">
                 <div class="form-row-full">
                   <select id="audio-select" class="w-full"></select>
                 </div>
                 <div class="form-row">
                   <input type="number" id="audio-start-reg" placeholder="Start Reg" />
                   <input type="number" id="audio-end-reg" placeholder="End Reg" />
                 </div>
                 <div class="form-row">
                   <div style="position: relative; width: 100%;">
                     <input type="text" id="audio-start-time" placeholder="Start Time (s or m:s)" style="width: 100%; padding-right: 35px; box-sizing: border-box;" />
                     <span id="audio-start-time-hint" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); pointer-events: none;">0:00</span>
                   </div>
                   <div style="position: relative; width: 100%;">
                     <input type="text" id="audio-end-time" placeholder="End Time (s or m:s)" style="width: 100%; padding-right: 35px; box-sizing: border-box;" />
                     <span id="audio-end-time-hint" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); pointer-events: none;">0:00</span>
                   </div>
                 </div>
                 <label class="form-checkbox-label">
                   <input type="checkbox" id="audio-loop" /> Loop Audio
                 </label>
                 <button id="btn-add-span" class="btn-add">Add Audio Span</button>
              </div>

              <h3 class="mt-md">Download Audio</h3>
              <div class="web-audio-form">
                 <input type="text" id="dl-audio-url" placeholder="URL (SoundCloud, YouTube, etc)" />
                 <input type="text" id="dl-audio-prefix" placeholder="File Prefix (optional)" />
                 <select id="dl-audio-browser" title="Browser for Cookies (Bot Bypass)">
                   <option value="">No Cookies (Default)</option>
                   <option value="chrome">Chrome</option>
                   <option value="edge">Edge</option>
                   <option value="firefox">Firefox</option>
                   <option value="brave">Brave</option>
                   <option value="opera">Opera</option>
                   <option value="safari">Safari</option>
                   <option value="vivaldi">Vivaldi</option>
                 </select>
                 <button id="btn-dl-audio" class="btn-add btn-add-blue">Download & Add</button>
              </div>

              <h3 class="mt-md">Set Web Link for Local Track</h3>
              <div class="web-audio-form">
                 <select id="link-audio-select" class="w-full"></select>
                 <input type="text" id="link-audio-url" placeholder="Web URL Source" />
                 <button id="btn-set-audio-link" class="btn-add btn-add-blue">Set Link</button>
                 <ul id="audio-link-list" class="item-list mt-md"></ul>
              </div>
            </div>

            <!-- Tab: Timeline -->
            <div class="tab-content" id="tab-timeline">
              <h3>Audio Timeline</h3>
              <ul id="span-list" class="item-list"></ul>
            </div>

            <!-- Tab: Notifications -->
            <div class="tab-content" id="tab-notifications">
              <h3>Notifications</h3>
              <ul id="notification-list" class="item-list"></ul>
            </div>
          </div>
      </div>
  `;

    // ─── Canvas Style (was inline) ──────────────────────────────────────────
    const regionCanvas = document.getElementById('region-canvas') as HTMLCanvasElement;
    regionCanvas.style.position = 'absolute';
    regionCanvas.style.top = '0';
    regionCanvas.style.left = '0';
    regionCanvas.style.width = '100%';
    regionCanvas.style.height = '100%';
    regionCanvas.style.cursor = 'crosshair';
    regionCanvas.style.zIndex = '10';

    // ─── Tab Switching ──────────────────────────────────────────────────────
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab') as typeof activeTab;
            activeTab = tabId;
            document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`)?.classList.add('active');
        });
    });

    // References
    const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
    const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
    const imageList = document.getElementById('image-list') as HTMLUListElement;
    const regionList = document.getElementById('region-list') as HTMLUListElement;
    const spanList = document.getElementById('span-list') as HTMLUListElement;
    const notificationList = document.getElementById('notification-list') as HTMLUListElement;

    renderNotificationList = () => {
        if (!notificationList) return;
        if (notificationLog.length === 0) {
            notificationList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">🔔</span>
                <span class="empty-state-text">No notifications yet.</span>
              </div>`;
            return;
        }
        notificationList.innerHTML = notificationLog.map(n => {
            const timeStr = n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return `
              <li class="list-item" style="display:flex; flex-direction:column; gap:4px; padding:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:bold; color: ${n.type === 'error' ? 'var(--error-color, #e50914)' : n.type === 'success' ? 'var(--success-color, #4caf50)' : 'var(--accent-color, #00c8ff)'};">
                    ${n.type.toUpperCase()}
                  </span>
                  <span style="font-size:0.8em; color:#888;">${timeStr}</span>
                </div>
                <div style="font-size:0.9em; word-break: break-word;">${n.message}</div>
              </li>
            `;
        }).join('');
    };
    renderNotificationList();

    const savedBrowser = localStorage.getItem('yt-dlp-browser') || '';
    const browserSelect = document.getElementById('dl-audio-browser') as HTMLSelectElement;
    if (browserSelect) browserSelect.value = savedBrowser;

    const audioSelect = document.getElementById('audio-select') as HTMLSelectElement;
    const canvas = document.getElementById('region-canvas') as HTMLCanvasElement;
    const mainImage = document.getElementById('main-image') as HTMLImageElement;
    const ctx = canvas.getContext('2d');
    const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLElement;
    const canvasStage = document.getElementById('canvas-stage') as HTMLElement;
    const canvasArea = document.getElementById('canvas-area') as HTMLElement;
    const zoomLabel = document.getElementById('zoom-label') as HTMLSpanElement;
    const toolbarTip = document.getElementById('toolbar-tip') as HTMLSpanElement;
    let isDetecting = false;

    const audioPanel = document.getElementById('audio-panel') as HTMLElement;
    const audioEl = document.getElementById('audio-element') as HTMLAudioElement;
    const playerTrackSel = document.getElementById('player-track-select') as HTMLSelectElement;
    const playerSeek = document.getElementById('player-seek') as HTMLInputElement;
    const playerVolume = document.getElementById('player-volume') as HTMLInputElement;
    const playerTime = document.getElementById('player-time') as HTMLSpanElement;
    const playerDuration = document.getElementById('player-duration') as HTMLSpanElement;
    const playerLoop = document.getElementById('player-loop') as HTMLInputElement;

    function getDefaultToolbarTip() {
        return drawMode === 'polygon'
            ? 'Click to add points - Right-click to close shape - Esc to cancel'
            : 'Drag to create region - Right-click to select';
    }
    // Auto-preview UI removed.

    // ─── Toolbar Draw Mode ───────────────────────────────────────────────────
    document.getElementById('btn-mode-rect')?.addEventListener('click', () => {
        drawMode = 'rect';
        document.getElementById('btn-mode-rect')?.classList.add('on');
        document.getElementById('btn-mode-poly')?.classList.remove('on');
        toolbarTip.textContent = getDefaultToolbarTip();
        if (isDrawing) { isDrawing = false; currentPolygonPoints = []; currentRect = null; drawCanvas(); }
    });
    document.getElementById('btn-mode-poly')?.addEventListener('click', () => {
        drawMode = 'polygon';
        document.getElementById('btn-mode-poly')?.classList.add('on');
        document.getElementById('btn-mode-rect')?.classList.remove('on');
        toolbarTip.textContent = getDefaultToolbarTip();
        if (isDrawing) { isDrawing = false; currentPolygonPoints = []; currentRect = null; drawCanvas(); }
    });

    function isEditableTarget(target: EventTarget | null) {
        const el = target as HTMLElement | null;
        if (!el) return false;
        const tagName = el.tagName;
        return el.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    }

    function getCanvasViewportCenter() {
        const rect = canvasArea.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    function getCanvasSize() {
        return {
            width: mainImage.naturalWidth || canvas.width || 1,
            height: mainImage.naturalHeight || canvas.height || 1
        };
    }

    function getCanvasAreaPadding() {
        const styles = window.getComputedStyle(canvasArea);
        return {
            x: parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight),
            y: parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
        };
    }

    function computeFitZoom() {
        const { width, height } = getCanvasSize();
        const padding = getCanvasAreaPadding();
        const availableWidth = Math.max(1, canvasArea.clientWidth - padding.x);
        const availableHeight = Math.max(1, canvasArea.clientHeight - padding.y);
        return Math.min(ZOOM_MAX, Math.min(availableWidth / width, availableHeight / height, 1));
    }

    function clampZoom(nextZoom: number) {
        const minZoom = Math.min(fitZoom, 0.66);
        return Math.min(ZOOM_MAX, Math.max(minZoom, parseFloat(nextZoom.toFixed(4))));
    }

    function syncCanvasZoomUI() {
        const { width, height } = getCanvasSize();
        canvasStage.style.width = `${width * zoom}px`;
        canvasStage.style.height = `${height * zoom}px`;
        canvasWrapper.style.transform = `scale(${zoom})`;
        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;

        canvasArea.classList.toggle('is-zoomed', zoom > fitZoom + 0.001);
        canvasArea.classList.toggle('is-pan-ready', !!currentImage && isSpacePressed && !isPanningCanvas);
        canvasArea.classList.toggle('is-panning', isPanningCanvas);
    }

    function fitCanvasToView() {
        if (!currentImage) return;
        fitZoom = computeFitZoom();
        zoom = fitZoom;
        syncCanvasZoomUI();
        requestAnimationFrame(() => {
            canvasArea.scrollLeft = 0;
            canvasArea.scrollTop = 0;
        });
    }

    function defaultCanvasZoom() {
        if (!currentImage) return;
        fitZoom = computeFitZoom();
        zoom = 0.66;
        syncCanvasZoomUI();
        requestAnimationFrame(() => {
            canvasArea.scrollLeft = 0;
            canvasArea.scrollTop = 0;
        });
    }

    function setCanvasZoom(nextZoom: number, anchorClientX: number, anchorClientY: number) {
        if (!currentImage) return;
        const clampedZoom = clampZoom(nextZoom);
        if (Math.abs(clampedZoom - zoom) < 0.0001) return;

        const previousZoom = zoom;
        const previousRect = canvasStage.getBoundingClientRect();
        const naturalX = (anchorClientX - previousRect.left) / previousZoom;
        const naturalY = (anchorClientY - previousRect.top) / previousZoom;

        zoom = clampedZoom;
        syncCanvasZoomUI();

        requestAnimationFrame(() => {
            const nextRect = canvasStage.getBoundingClientRect();
            const renderedX = nextRect.left + naturalX * zoom;
            const renderedY = nextRect.top + naturalY * zoom;
            canvasArea.scrollLeft += renderedX - anchorClientX;
            canvasArea.scrollTop += renderedY - anchorClientY;
        });
    }

    function stepCanvasZoom(direction: 'in' | 'out', anchor = getCanvasViewportCenter()) {
        const nextZoom = direction === 'in'
            ? zoom * ZOOM_STEP_FACTOR
            : zoom / ZOOM_STEP_FACTOR;
        setCanvasZoom(nextZoom, anchor.x, anchor.y);
    }

    function refreshCanvasZoom(preserveManualZoom: boolean) {
        if (!currentImage) return;
        const previousFitZoom = fitZoom;
        const wasFitted = Math.abs(zoom - previousFitZoom) < 0.001;
        fitZoom = computeFitZoom();

        if (!preserveManualZoom || wasFitted) {
            zoom = fitZoom;
            syncCanvasZoomUI();
            requestAnimationFrame(() => {
                canvasArea.scrollLeft = 0;
                canvasArea.scrollTop = 0;
            });
            return;
        }

        const minZoom = Math.min(fitZoom, 0.66);
        zoom = Math.max(zoom, minZoom);
        syncCanvasZoomUI();
    }

    function updateCanvasCursor(pos?: Point | null, hoveredRegion?: Region | null) {
        if (isPanningCanvas) {
            canvas.style.cursor = 'grabbing';
            return;
        }

        if (currentImage && isSpacePressed) {
            canvas.style.cursor = 'grab';
            return;
        }

        // Auto-preview removed — no special cursor state.

        if (!pos) {
            canvas.style.cursor = 'default';
            return;
        }

        if (hoveredRegion) {
            canvas.style.cursor = isOverResizeHandle(hoveredRegion, pos.x, pos.y) ? 'nwse-resize' : 'grab';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !isEditableTarget(e.target) && currentImage) {
            isSpacePressed = true;
            syncCanvasZoomUI();
            updateCanvasCursor();
            e.preventDefault();
            return;
        }

        if (isEditableTarget(e.target)) return;

        // Escape key handled for drawing cancellation below.

        if (e.key === 'Escape' && isDrawing && drawMode === 'polygon') {
            isDrawing = false;
            currentPolygonPoints = [];
            drawCanvas();
            return;
        }

        if (!currentImage) return;

        if (e.key === '+' || (e.key === '=' && e.shiftKey)) {
            e.preventDefault();
            stepCanvasZoom('in');
        } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            stepCanvasZoom('out');
        } else if (e.key === '0') {
            e.preventDefault();
            fitCanvasToView();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code !== 'Space') return;
        isSpacePressed = false;
        syncCanvasZoomUI();
        updateCanvasCursor();
    });

    window.addEventListener('blur', () => {
        isSpacePressed = false;
        isPanningCanvas = false;
        syncCanvasZoomUI();
        updateCanvasCursor();
    });

    // ─── Navigation ──────────────────────────────────────────────────────────
    document.getElementById('btn-home')?.addEventListener('click', () => window.location.reload());

    // ─── Open/Save ───────────────────────────────────────────────────────────
    btnOpen.addEventListener('click', async () => {
        const data = await window.electronAPI.selectWorkspace();
        if (data) {
            workspace = data;
            currentImage = null;
            regions = data.chapterData?.regions || [];
            audioSpans = data.chapterData?.audioSpans || [];
            imagesConfig = data.chapterData?.imagesConfig || {};
            audioSourceLinks = data.chapterData?.audioSourceLinks || {};
            // Merge central audio links into local state
            const centralLinks = await window.electronAPI.loadAudioLinks();
            for (const [k, v] of Object.entries(centralLinks)) {
                if (!audioSourceLinks[k]) audioSourceLinks[k] = v;
            }
            renderSidebar();
            renderRegionList();
            renderAudioUI();
            showToast('Workspace loaded', 'success');
        }
    });

    btnSave.addEventListener('click', async () => {
        if (!workspace) return;
        // Extract folder name from workspace path for imagesFolder reference
        const folderName = workspace.workspacePath.split(/[\\/]/).pop() || '';
        const chapter: Chapter = { version: "1.0", imagesFolder: folderName, regions, audioSpans, imagesConfig, audioSourceLinks };
        workspace.chapterData = chapter;
        const success = await window.electronAPI.saveChapter(workspace.workspacePath, chapter, workspace.chapterJsonPath);
        if (success) {
            showToast('Saved to chapters directory!', 'success');
        } else {
            showToast('Save failed', 'error');
        }
    });

    const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
    btnExport.addEventListener('click', async () => {
        if (!workspace) return;

        // Also ensure we save before exporting, to make sure everything is up to date
        const folderName = workspace.workspacePath.split(/[\\/]/).pop() || '';
        const chapter: Chapter = { version: "1.0", imagesFolder: folderName, regions, audioSpans, imagesConfig, audioSourceLinks };
        await window.electronAPI.saveChapter(workspace.workspacePath, chapter, workspace.chapterJsonPath);

        const success = await window.electronAPI.exportChapter(workspace.workspacePath);
        if (success) {
            showToast('Exported successfully!', 'success');
        } else {
            showToast('Export failed', 'error');
        }
    });

    // ─── Zoom ────────────────────────────────────────────────────────────────
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
        stepCanvasZoom('in');
    });
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        stepCanvasZoom('out');
    });
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
        fitCanvasToView();
    });


    canvasArea.addEventListener('wheel', (e: WheelEvent) => {
        if (!currentImage || (!e.ctrlKey && !e.metaKey)) return;
        e.preventDefault();
        const anchor = { x: e.clientX, y: e.clientY };
        stepCanvasZoom(e.deltaY < 0 ? 'in' : 'out', anchor);
    }, { passive: false });

    canvasArea.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !currentImage || !isSpacePressed) return;
        isPanningCanvas = true;
        panStartClientX = e.clientX;
        panStartClientY = e.clientY;
        panStartScrollLeft = canvasArea.scrollLeft;
        panStartScrollTop = canvasArea.scrollTop;
        syncCanvasZoomUI();
        updateCanvasCursor();
        e.preventDefault();
        e.stopPropagation();
    }, true);

    // ─── Audio Player Panel Toggle ────────────────────────────────────────────
    document.getElementById('btn-toggle-audio')?.addEventListener('click', () => {
        audioPlayerVisible = !audioPlayerVisible;
        audioPanel.classList.toggle('collapsed', !audioPlayerVisible);
    });

    // ─── Resizable Sidebars ──────────────────────────────────────────────────
    function makeResizable(handleId: string, sidebarId: string, side: 'left' | 'right') {
        const handle = document.getElementById(handleId) as HTMLElement;
        const sidebar = document.getElementById(sidebarId) as HTMLElement;
        let dragging = false;
        let startMouseX = 0;
        let startWidth = 0;

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            startMouseX = e.clientX;
            startWidth = sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const diff = side === 'left'
                ? e.clientX - startMouseX
                : startMouseX - e.clientX;
            const newWidth = Math.min(550, Math.max(150, startWidth + diff));
            sidebar.style.width = newWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    makeResizable('resize-left', 'sidebar-left', 'left');
    makeResizable('resize-right', 'sidebar-right', 'right');
    const canvasAreaResizeObserver = new ResizeObserver(() => {
        if (!currentImage) return;
        refreshCanvasZoom(true);
    });
    canvasAreaResizeObserver.observe(canvasArea);

    // ─── Image Sidebar ────────────────────────────────────────────────────────
    function renderSidebar() {
        if (!workspace) {
            imageList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">📂</span>
                <span class="empty-state-text">Open a directory to<br/>load manga images</span>
              </div>`;
            return;
        }
        imageList.innerHTML = workspace.images.map(img => {
            const isBlur = imagesConfig[img.name]?.blurMode;
            const isKeepPrev = imagesConfig[img.name]?.keepPreviousVisible;
            return `
      <li class="list-item img-item" data-id="${img.name}" data-url="${img.url}">
        <span class="img-item-name">${img.name}</span>
        <div class="img-item-controls">
          <button class="btn-toggle btn-blur-toggle ${isBlur ? 'on' : ''}" data-id="${img.name}" title="Toggle Blur Mode for Entire Image">${isBlur ? 'Blur: ON' : 'Blur'}</button>
          ${isBlur ? `<button class="btn-toggle btn-keep-prev-toggle ${isKeepPrev ? 'on' : ''}" data-id="${img.name}" title="Keep Previous Regions Visible">${isKeepPrev ? 'Keep: ON' : 'Keep'}</button>` : ''}
        </div>
      </li>
    `}).join('');

        document.querySelectorAll('.btn-blur-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    if (!imagesConfig[id]) imagesConfig[id] = {};
                    imagesConfig[id].blurMode = !imagesConfig[id].blurMode;
                    renderSidebar();
                }
            });
        });

        document.querySelectorAll('.btn-keep-prev-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    if (!imagesConfig[id]) imagesConfig[id] = {};
                    imagesConfig[id].keepPreviousVisible = !imagesConfig[id].keepPreviousVisible;
                    renderSidebar();
                }
            });
        });

        document.querySelectorAll('.img-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.img-item').forEach(el => el.classList.remove('selected'));
                const target = e.currentTarget as HTMLElement;
                target.classList.add('selected');
                const url = target.getAttribute('data-url');
                const id = target.getAttribute('data-id');
                    if (url && id) {
                    currentImage = workspace?.images.find((i: FileData) => i.name === id) || null;
                    mainImage.onload = () => {
                        canvasWrapper.style.width = mainImage.naturalWidth + 'px';
                        canvasWrapper.style.height = mainImage.naturalHeight + 'px';
                        canvas.width = mainImage.naturalWidth;
                        canvas.height = mainImage.naturalHeight;
                        defaultCanvasZoom();
                        drawCanvas();
                    };
                    mainImage.src = url;
                }
            });
        });
    }

    // Show empty state on initial load
    renderSidebar();

    // ─── Audio Span UI (right sidebar) ───────────────────────────────────────
    function renderAudioUI() {
        if (!workspace) return;

        // Right sidebar span select
        audioSelect.innerHTML = `<option value="">-- Select Track --</option><option value="silence">🔇 Silence</option>` +
            workspace.audio.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
        // Link Audio Select
        const linkSelect = document.getElementById('link-audio-select') as HTMLSelectElement;
        linkSelect.innerHTML = `<option value="">-- Select Local Track --</option>` +
            workspace.audio.map(a => {
                const isLinked = !!audioSourceLinks[a.name];
                return `<option value="${a.name}">${a.name} ${isLinked ? '(🔗 Linked)' : '(❌ No Link)'}</option>`;
            }).join('');

        // Bottom player track select
        playerTrackSel.innerHTML = `<option value="">-- Select Track --</option>` +
            workspace.audio.map(a => `<option value="${a.name}" data-url="${a.url}">${a.name}</option>`).join('');

        renderSpanList();
        renderAudioLinkList();
    }

    document.getElementById('btn-dl-audio')?.addEventListener('click', async () => {
        if (!workspace) return;
        const urlInput = document.getElementById('dl-audio-url') as HTMLInputElement;
        const prefixInput = document.getElementById('dl-audio-prefix') as HTMLInputElement;
        const url = urlInput.value.trim();
        const prefix = prefixInput.value.trim();
        const browser = (document.getElementById('dl-audio-browser') as HTMLSelectElement).value;

        if (browser) localStorage.setItem('yt-dlp-browser', browser);
        else localStorage.removeItem('yt-dlp-browser');

        if (!url) { showToast('Please provide a URL', 'error'); return; }

        showToast('Downloading audio... this may take a moment', 'info');
        document.body.style.cursor = 'wait';

        try {
            const res = await window.electronAPI.downloadAudio(url, prefix || undefined, false, browser || undefined);
            if (res.success && res.newTrack) {
                workspace.audio.push(res.newTrack);
                // Automatically save the link source so the end-user has it referenced!
                audioSourceLinks[res.newTrack.name] = url;

                // Also persist to central audio_links.json
                const centralLinks = await window.electronAPI.loadAudioLinks();
                centralLinks[res.newTrack.name] = url;
                await window.electronAPI.saveAudioLinks(centralLinks);

                urlInput.value = '';
                prefixInput.value = '';
                renderAudioUI();
                showToast(`Downloaded successfully: ${res.newTrack.name}`, 'success');
            } else {
                showToast(`Download failed: ${res.error}`, 'error');
            }
        } catch (e: any) {
            showToast(`Error: ${e.message}`, 'error');
        } finally {
            document.body.style.cursor = 'default';
        }
    });

    document.getElementById('btn-set-audio-link')?.addEventListener('click', async () => {
        if (!workspace) return;
        const trackId = (document.getElementById('link-audio-select') as HTMLSelectElement).value;
        const url = (document.getElementById('link-audio-url') as HTMLInputElement).value.trim();
        if (!trackId || !url) { showToast('Please select a track and enter a URL', 'error'); return; }

        audioSourceLinks[trackId] = url;

        // Also persist to central audio_links.json
        const centralLinks = await window.electronAPI.loadAudioLinks();
        centralLinks[trackId] = url;
        await window.electronAPI.saveAudioLinks(centralLinks);

        (document.getElementById('link-audio-url') as HTMLInputElement).value = '';
        renderAudioUI();
        showToast(`Link set for ${trackId}`, 'success');
    });

    function renderAudioLinkList() {
        const list = document.getElementById('audio-link-list');
        if (!list || !workspace) return;

        if (workspace.audio.length === 0) {
            list.innerHTML = `
              <div class="empty-state" style="padding: 12px;">
                <span class="empty-state-text">No audio files in workspace</span>
              </div>`;
            return;
        }

        list.innerHTML = workspace.audio.map(a => {
            const trackId = a.name;
            const linkUrl = audioSourceLinks[trackId];
            if (linkUrl) {
                return `
                <li class="list-item web-track-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" data-id="${trackId}">
                   <div>
                       <span class="web-track-name" style="color:var(--accent-color)">🔗 ${trackId}</span>
                       <br><span style="color:#aaa;font-size:0.85em;word-break:break-all;" title="${linkUrl}">${linkUrl}</span>
                   </div>
                   <button class="btn-delete btn-del-audio-link" data-id="${trackId}">✕</button>
                </li>
                `;
            } else {
                return `
                <li class="list-item web-track-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" data-id="${trackId}">
                   <span class="web-track-name" style="color:#888;">❌ ${trackId} (No Link)</span>
                </li>
                `;
            }
        }).join('');

        // Provide an easy way to click and populate the input field
        document.querySelectorAll('.web-track-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Ignore if clicked on delete button
                if ((e.target as HTMLElement).classList.contains('btn-del-audio-link')) return;

                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    const sel = document.getElementById('link-audio-select') as HTMLSelectElement;
                    const inp = document.getElementById('link-audio-url') as HTMLInputElement;
                    sel.value = id;
                    inp.value = audioSourceLinks[id] || '';
                    inp.focus();
                }
            });
        });

        document.querySelectorAll('.btn-del-audio-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    delete audioSourceLinks[id];
                    renderAudioUI();
                }
            });
        });
    }
    const audioStartTimeInput = document.getElementById('audio-start-time') as HTMLInputElement;
    const audioEndTimeInput = document.getElementById('audio-end-time') as HTMLInputElement;
    const audioStartTimeHint = document.getElementById('audio-start-time-hint') as HTMLSpanElement;
    const audioEndTimeHint = document.getElementById('audio-end-time-hint') as HTMLSpanElement;

    function parseTimeInput(input: string): number {
        const trimmed = input.trim();
        if (!trimmed) return NaN;
        if (trimmed.includes(':')) {
            const parts = trimmed.split(':');
            const m = parseFloat(parts[0]) || 0;
            const s = parseFloat(parts[1]) || 0;
            return m * 60 + s;
        }
        return parseFloat(trimmed);
    }

    audioStartTimeInput?.addEventListener('input', (e) => {
        const val = parseTimeInput((e.target as HTMLInputElement).value);
        if (audioStartTimeHint) audioStartTimeHint.textContent = isNaN(val) ? '0:00' : formatTime(val);
    });

    audioEndTimeInput?.addEventListener('input', (e) => {
        const val = parseTimeInput((e.target as HTMLInputElement).value);
        if (audioEndTimeHint) audioEndTimeHint.textContent = isNaN(val) ? '0:00' : formatTime(val);
    });


    document.getElementById('btn-add-span')?.addEventListener('click', () => {
        const trackId = audioSelect.value;
        const startOrder = parseInt((document.getElementById('audio-start-reg') as HTMLInputElement).value);
        const endOrder = parseInt((document.getElementById('audio-end-reg') as HTMLInputElement).value);
        let startTime = parseTimeInput((document.getElementById('audio-start-time') as HTMLInputElement).value);
        let endTime = parseTimeInput((document.getElementById('audio-end-time') as HTMLInputElement).value);
        const loop = (document.getElementById('audio-loop') as HTMLInputElement).checked;

        if (!trackId || isNaN(startOrder) || isNaN(endOrder)) { showToast('Invalid inputs', 'error'); return; }
        if (isNaN(startTime)) startTime = 0;
        if (isNaN(endTime)) endTime = 0;

        audioSpans.push({
            id: 'span-' + Date.now(),
            trackId,
            startRegionOrder: startOrder,
            endRegionOrder: endOrder,
            startTime,
            endTime,
            loop
        });
        renderSpanList();
        showToast('Audio span added', 'success');
    });

    function renderSpanList() {
        if (audioSpans.length === 0) {
            spanList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">🎵</span>
                <span class="empty-state-text">No audio spans yet.<br/>Add them in the Audio tab.</span>
              </div>`;
            return;
        }
        spanList.innerHTML = audioSpans.map(s => `
      <div class="span-card">
        <div class="span-header">
           <span>🎵 ${s.trackId}</span>
           <button class="btn-delete btn-del-span" data-id="${s.id}">✕</button>
        </div>
        <div class="span-details">
           <span>Regions: ${s.startRegionOrder} → ${s.endRegionOrder} | ${s.startTime}s (${formatTime(s.startTime)}) - ${s.endTime ? `${s.endTime}s (${formatTime(s.endTime)})` : 'end'}</span>
           <span>${s.loop ? '🔁 Loop' : 'Once'}</span>
        </div>
      </div>
    `).join('');

        document.querySelectorAll('.btn-del-span').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                audioSpans = audioSpans.filter(s => s.id !== id);
                renderSpanList();
            });
        });
    }

    // ─── Region List (sorted by image number, then order) ────────────────────
    function imageNumFromId(imageId: string): number {
        // Extract leading digits from filename like "001.jpg" → 1
        const match = imageId.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : Infinity;
    }

    // compareRegionsByImageThenOrder removed; inline sorts used instead.

    // Region order normalization removed (handled inline where needed)

    // Auto-detection helpers removed.

    function addRegionAndReorder(newRegion: Region) {
        // Assign a temporary large order so it sorts to the end of its image group
        newRegion.order = 999999;
        regions.push(newRegion);

        // Sort to place it at the end of its image group but before subsequent images
        regions.sort((a, b) => {
            const numA = imageNumFromId(a.imageId);
            const numB = imageNumFromId(b.imageId);
            if (numA !== numB) return numA - numB;
            return a.order - b.order;
        });

        const newIdx = regions.indexOf(newRegion);
        const assignedOrder = newIdx + 1;

        // Reassign clean sequential orders
        regions.forEach((r, idx) => r.order = idx + 1);

        // Shift audio spans to accommodate the new region
        audioSpans.forEach(span => {
            if (span.startRegionOrder >= assignedOrder) span.startRegionOrder++;
            if (span.endRegionOrder >= assignedOrder) span.endRegionOrder++;
        });
    }

    function renderRegionList() {
        regions.sort((a, b) => {
            const numA = imageNumFromId(a.imageId);
            const numB = imageNumFromId(b.imageId);
            if (numA !== numB) return numA - numB;
            return a.order - b.order;
        });

        if (regions.length === 0) {
            regionList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">📐</span>
                <span class="empty-state-text">No regions yet.<br/>Draw on an image to create regions.</span>
              </div>`;
            return;
        }

        regionList.innerHTML = regions.map((r) => `
      <li class="region-item" data-transition="${r.transitionType || 'sharp'}">
        <div class="region-item-header">
          <div style="display: flex; align-items: center;">
            <span class="region-order">#${r.order}</span>
            <span class="region-image-id">${r.imageId}</span>
          </div>
          <button class="btn-delete btn-del-region" data-id="${r.id}">✕</button>
        </div>
        <div class="region-item-controls">
           <select class="region-transition-select" data-id="${r.id}">
              <option value="fade" ${r.transitionType === 'fade' ? 'selected' : ''}>Fade</option>
              <option value="sharp" ${(!r.transitionType || r.transitionType === 'sharp') ? 'selected' : ''}>Sharp</option>
              <option value="blur" ${r.transitionType === 'blur' ? 'selected' : ''}>Blur</option>
           </select>
           <input type="text" class="region-group-input" data-id="${r.id}" placeholder="Group" value="${r.blurGroupId || ''}" title="Blur Group ID" />
           ${r.transitionType === 'blur' ? `<label class="region-keep-label">
             <input type="checkbox" class="region-keep-prev" data-id="${r.id}" ${r.keepPrevious ? 'checked' : ''} /> Keep
           </label>` : ''}
        </div>
      </li>
    `).join('');

        document.querySelectorAll('.region-transition-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const id = (e.currentTarget as HTMLSelectElement).getAttribute('data-id');
                const val = (e.currentTarget as HTMLSelectElement).value as 'fade' | 'sharp' | 'blur';
                const reg = regions.find(r => r.id === id);
                if (reg) {
                    reg.transitionType = val;
                    // Re-render to show/hide Keep checkbox based on blur selection
                    renderRegionList();
                }
            });
        });

        // Update blur group ID from user input
        document.querySelectorAll('.region-group-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const target = e.currentTarget as HTMLInputElement;
                const id = target.getAttribute('data-id');
                const val = target.value;
                const trimmedVal = val.trim();
                const reg = regions.find(r => r.id === id);
                if (reg) {
                    reg.blurGroupId = trimmedVal !== '' ? trimmedVal : undefined;

                    if (trimmedVal !== '') {
                        let needsRender = false;
                        if (reg.transitionType !== 'blur') {
                            reg.transitionType = 'blur';
                            needsRender = true;
                        }
                        if (!reg.keepPrevious) {
                            reg.keepPrevious = true;
                            needsRender = true;
                        }

                        if (needsRender) {
                            const cursorStart = target.selectionStart;
                            const cursorEnd = target.selectionEnd;

                            renderRegionList();
                            drawCanvas();

                            const newInput = document.querySelector(`.region-group-input[data-id="${id}"]`) as HTMLInputElement;
                            if (newInput) {
                                newInput.focus();
                                newInput.setSelectionRange(cursorStart, cursorEnd);
                            }
                        }
                    }
                }
            });
        });

        // Add listener for keep checkbox (only visible when blur transition selected)
        document.querySelectorAll('.region-keep-prev').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = (e.currentTarget as HTMLInputElement).getAttribute('data-id');
                const reg = regions.find(r => r.id === id);
                if (reg) {
                    reg.keepPrevious = (e.currentTarget as HTMLInputElement).checked;
                    // Re-render the region list and redraw canvas so the UI reflects the change immediately
                    renderRegionList();
                    drawCanvas();
                }
            });
        });

        document.querySelectorAll('.btn-del-region').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                const regToDelete = regions.find(r => r.id === id);
                const deletedOrder = regToDelete ? regToDelete.order : -1;

                regions = regions.filter(r => r.id !== id);
                regions.forEach((r, i) => r.order = i + 1);

                if (deletedOrder !== -1) {
                    audioSpans.forEach(span => {
                        if (span.startRegionOrder > deletedOrder) span.startRegionOrder--;
                        if (span.endRegionOrder >= deletedOrder) span.endRegionOrder--;
                    });
                }

                if (selectedRegionId === id) selectedRegionId = null;
                renderRegionList();
                drawCanvas();
            });
        });
    }

    // ─── Canvas Mouse Logic ───────────────────────────────────────────────────
    function pointInPolygon(point: Point, vs: Point[]) {
        let x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i].x, yi = vs[i].y;
            let xj = vs[j].x, yj = vs[j].y;
            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function isPointInRegion(region: Region, point: Point): boolean {
        if (region.shapeType === 'polygon' && region.polygon) {
            return pointInPolygon(point, region.polygon);
        }

        return (
            point.x >= region.rect.x &&
            point.x <= region.rect.x + region.rect.w &&
            point.y >= region.rect.y &&
            point.y <= region.rect.y + region.rect.h
        );
    }

    function getRegionAtPos(x: number, y: number): Region | null {
        if (!currentImage) return null;
        const imgsRegions = regions.filter(r => r.imageId === currentImage?.name);
        for (let i = imgsRegions.length - 1; i >= 0; i--) {
            const r = imgsRegions[i];
            if (isPointInRegion(r, { x, y })) {
                return r;
            }
        }
        return null;
    }

    function isOverResizeHandle(reg: Region, x: number, y: number): boolean {
        if (reg.shapeType === 'polygon') return false;
        const hx = reg.rect.x + reg.rect.w - RESIZE_HANDLE_SIZE;
        const hy = reg.rect.y + reg.rect.h - RESIZE_HANDLE_SIZE;
        return (x >= hx && x <= hx + RESIZE_HANDLE_SIZE && y >= hy && y <= hy + RESIZE_HANDLE_SIZE);
    }

    function getMousePos(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        // Calculate raw position using standard calculation when zoomLevel is removed
        let rawX = (e.clientX - rect.left) * (canvas.width / rect.width);
        let rawY = (e.clientY - rect.top) * (canvas.height / rect.height);

        // Clamp position firmly within canvas bounds (0 to canvas width/height)
        const x = Math.max(0, Math.min(rawX, canvas.width));
        const y = Math.max(0, Math.min(rawY, canvas.height));
        return { x, y };
    }

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
        if (!currentImage) return;
        if (isSpacePressed || isPanningCanvas) return;
        const pos = getMousePos(e);

        // Auto-preview removed — proceed normally.

        if (e.button === 2) {
            // If drawing polygon, finish it
            if (drawMode === 'polygon' && currentPolygonPoints.length > 0) {
                if (currentPolygonPoints.length > 2) {
                    const minX = Math.min(...currentPolygonPoints.map(p => p.x));
                    const maxX = Math.max(...currentPolygonPoints.map(p => p.x));
                    const minY = Math.min(...currentPolygonPoints.map(p => p.y));
                    const maxY = Math.max(...currentPolygonPoints.map(p => p.y));
                    const rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

                    addRegionAndReorder({
                        id: 'r-' + Date.now().toString(),
                        imageId: currentImage.name,
                        order: 0, // Will be reassigned
                        rect: rect,
                        shapeType: 'polygon',
                        polygon: [...currentPolygonPoints],
                        transitionType: 'sharp'
                    });
                    renderRegionList();
                }
                currentPolygonPoints = [];
                isDrawing = false;
                drawCanvas();
                return;
            }

            // Right click: Select region
            const clickedRegion = getRegionAtPos(pos.x, pos.y);
            if (clickedRegion) {
                if (selectedRegionId === clickedRegion.id) {
                    // Cycle through overlapping regions
                    const allAtPos = regions.filter(r => {
                        if (r.imageId !== currentImage?.name) return false;
                        return isPointInRegion(r, pos);
                    });
                    if (allAtPos.length > 1) {
                        const idx = allAtPos.findIndex(r => r.id === selectedRegionId);
                        const nextIdx = (idx - 1 + allAtPos.length) % allAtPos.length; // cycle backwards for depth
                        selectedRegionId = allAtPos[nextIdx].id;
                    }
                } else {
                    selectedRegionId = clickedRegion.id;
                }
            } else {
                selectedRegionId = null;
            }
            renderRegionList();
            renderAudioUI();
            drawCanvas();
            return;
        }

        // Left Click
        if (drawMode === 'polygon') {
            isDrawing = true;
            selectedRegionId = null;
            currentPolygonPoints.push(pos);
            drawCanvas();
            return;
        }

        // Left Click: Move selected region OR Draw new region
        let clickedActiveHandle = false;
        let clickedActiveBody = false;

        if (selectedRegionId) {
            const activeReg = regions.find(r => r.id === selectedRegionId);
            if (activeReg && activeReg.imageId === currentImage.name) {
                if (isOverResizeHandle(activeReg, pos.x, pos.y)) clickedActiveHandle = true;
                else if (isPointInRegion(activeReg, pos)) {
                    clickedActiveBody = true;
                }
            }
        }

        if (clickedActiveHandle) {
            isResizing = true;
        } else if (clickedActiveBody) {
            isDragging = true;
            const reg = regions.find(r => r.id === selectedRegionId)!;
            dragOffsetX = pos.x - reg.rect.x;
            dragOffsetY = pos.y - reg.rect.y;
        } else {
            // Start drawing a new region
            selectedRegionId = null;
            isDrawing = true;
            startX = pos.x;
            startY = pos.y;
            currentRect = { x: startX, y: startY, w: 0, h: 0 };
        }

        renderRegionList();
        renderAudioUI();
        drawCanvas();
    });

    let currentMousePos: Point | null = null;
    // Bind move and up to window so dragging/drawing works when mouse leaves the canvas area
    window.addEventListener('mousemove', (e) => {
        if (isPanningCanvas) {
            canvasArea.scrollLeft = panStartScrollLeft - (e.clientX - panStartClientX);
            canvasArea.scrollTop = panStartScrollTop - (e.clientY - panStartClientY);
            updateCanvasCursor();
            return;
        }

        if (!currentImage) return;

        const pos = getMousePos(e);
        currentMousePos = pos;

        if (!isDrawing && !isDragging && !isResizing) {
            // Only update cursor if actually hovering over the canvas element
            if (e.target === canvas) {
                const hoverReg = getRegionAtPos(pos.x, pos.y);
                updateCanvasCursor(pos, hoverReg);
            } else {
                updateCanvasCursor();
            }
        }

        if (isDragging && selectedRegionId) {
            const reg = regions.find(r => r.id === selectedRegionId);
            if (reg) {
                const newX = Math.max(0, Math.min(pos.x - dragOffsetX, canvas.width - reg.rect.w));
                const newY = Math.max(0, Math.min(pos.y - dragOffsetY, canvas.height - reg.rect.h));
                const dx = newX - reg.rect.x;
                const dy = newY - reg.rect.y;

                reg.rect.x = newX;
                reg.rect.y = newY;

                if (reg.shapeType === 'polygon' && reg.polygon) {
                    reg.polygon.forEach(p => {
                        p.x += dx;
                        p.y += dy;
                    });
                }
                drawCanvas();
            }
        } else if (isResizing && selectedRegionId) {
            canvas.style.cursor = 'nwse-resize';
            const reg = regions.find(r => r.id === selectedRegionId);
            if (reg && reg.shapeType !== 'polygon') {
                reg.rect.w = Math.max(10, Math.min(pos.x - reg.rect.x, canvas.width - reg.rect.x));
                reg.rect.h = Math.max(10, Math.min(pos.y - reg.rect.y, canvas.height - reg.rect.y));
                drawCanvas();
            }
        } else if (isDrawing) {
            if (drawMode === 'polygon') {
                drawCanvas();
            } else if (currentRect) {
                currentRect.w = pos.x - startX;
                currentRect.h = pos.y - startY;
                drawCanvas();
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanningCanvas) {
            isPanningCanvas = false;
            syncCanvasZoomUI();
            updateCanvasCursor();
        }
        isDragging = false;
        isResizing = false;

        if (isDrawing && drawMode === 'rect' && currentImage && currentRect) {
            isDrawing = false;
            if (currentRect.w < 0) { currentRect.x += currentRect.w; currentRect.w = Math.abs(currentRect.w); }
            if (currentRect.h < 0) { currentRect.y += currentRect.h; currentRect.h = Math.abs(currentRect.h); }

            if (currentRect.w > 20 && currentRect.h > 20) {
                addRegionAndReorder({
                    id: 'r-' + Date.now().toString(),
                    imageId: currentImage.name,
                    order: 0, // Will be reassigned
                    rect: currentRect,
                    shapeType: 'rect',
                    transitionType: 'sharp'
                });
                renderRegionList();
            }
            currentRect = null;
        }
        updateCanvasCursor();
        drawCanvas();
    });

    // Auto-preview drawing removed.

    function drawCanvas() {
        if (!ctx || !currentImage) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const imgsRegions = regions.filter(r => r.imageId === currentImage?.name);
        imgsRegions.forEach(r => {
            const isSelected = r.id === selectedRegionId;

            ctx.strokeStyle = isSelected ? 'rgba(0, 200, 255, 1)' : 'rgba(229, 9, 20, 0.7)';
            ctx.lineWidth = isSelected ? 4 : 2;

            if (r.shapeType === 'polygon' && r.polygon) {
                ctx.beginPath();
                ctx.moveTo(r.polygon[0].x, r.polygon[0].y);
                for (let i = 1; i < r.polygon.length; i++) {
                    ctx.lineTo(r.polygon[i].x, r.polygon[i].y);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.fillStyle = isSelected ? 'rgba(0, 200, 255, 0.15)' : 'rgba(229, 9, 20, 0.06)';
                ctx.fill();
            } else {
                ctx.strokeRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
                ctx.fillStyle = isSelected ? 'rgba(0, 200, 255, 0.15)' : 'rgba(229, 9, 20, 0.06)';
                ctx.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
            }

            // Order number badge
            ctx.fillStyle = isSelected ? '#00c8ff' : '#c8a84e';
            ctx.font = 'bold 24px Outfit, Inter, sans-serif';
            ctx.fillText(r.order.toString(), r.rect.x + 10, r.rect.y + 30);

            if (isSelected && r.shapeType !== 'polygon') {
                ctx.fillStyle = '#00c8ff';
                ctx.fillRect(r.rect.x + r.rect.w - RESIZE_HANDLE_SIZE, r.rect.y + r.rect.h - RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            }
        });

        // Auto-preview drawing removed.

        if (isDrawing) {
            if (drawMode === 'polygon') {
                ctx.strokeStyle = 'rgba(229, 9, 20, 0.8)';
                ctx.lineWidth = 3;
                if (currentPolygonPoints.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
                    for (let i = 1; i < currentPolygonPoints.length; i++) {
                        ctx.lineTo(currentPolygonPoints[i].x, currentPolygonPoints[i].y);
                    }
                    if (currentMousePos) {
                        ctx.lineTo(currentMousePos.x, currentMousePos.y);
                    }
                    ctx.stroke();

                    // Draw dots for points
                    ctx.fillStyle = 'white';
                    currentPolygonPoints.forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                        ctx.fill();
                    });
                }
            } else if (currentRect) {
                ctx.strokeStyle = 'rgba(229, 9, 20, 0.8)';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
                ctx.setLineDash([]);
            }
        }
    }

    // ─── Audio Player (HTML Audio) ─────────────────────
    function formatTime(sec: number): string {
        if (!isFinite(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    playerTrackSel.addEventListener('change', () => {
        const opt = playerTrackSel.selectedOptions[0];
        const url = opt?.getAttribute('data-url');
        if (url) {
            audioEl.src = url;
            audioEl.load();
            playerSeek.value = '0';
            playerTime.textContent = '0:00';
            playerDuration.textContent = '0:00';
        } else {
            audioEl.pause();
            audioEl.src = '';
        }
    });

    document.getElementById('btn-play')?.addEventListener('click', () => {
        if (audioEl.src) {
            audioEl.play();
        }
    });
    document.getElementById('btn-pause')?.addEventListener('click', () => {
        audioEl.pause();
    });
    document.getElementById('btn-stop')?.addEventListener('click', () => {
        audioEl.pause();
        audioEl.currentTime = 0;
        playerSeek.value = '0';
        playerTime.textContent = '0:00';
    });

    audioEl.addEventListener('loadedmetadata', () => {
        playerDuration.textContent = formatTime(audioEl.duration);
        playerSeek.max = String(audioEl.duration);
    });

    audioEl.addEventListener('timeupdate', () => {
        playerTime.textContent = formatTime(audioEl.currentTime);
        if (!isNaN(audioEl.duration)) {
            playerSeek.value = String(audioEl.currentTime);
        }
    });

    playerSeek.addEventListener('input', () => {
        audioEl.currentTime = parseFloat(playerSeek.value);
    });

    playerVolume.addEventListener('input', () => {
        const vol = parseInt(playerVolume.value);
        audioEl.volume = vol / 100;
    });
    audioEl.volume = parseInt(playerVolume.value) / 100;

    playerLoop.addEventListener('change', () => {
        audioEl.loop = playerLoop.checked;
    });
}
