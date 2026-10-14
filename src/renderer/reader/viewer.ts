import { state } from './state';
import { renderHome, updateChapterList } from './library';
import { startModeA, startModeB, navigateRegionB, nextImageA, prevImageA } from './engine';
import { escapeHtml } from '../shared/utils';

export function teardownReaderInteractions() {
    state.detachEvents?.();
    state.detachEvents = null;
    document.removeEventListener('keydown', handleKey);
    if (state.hideTimer) {
        clearTimeout(state.hideTimer);
        state.hideTimer = null;
    }
    state.isPanning = false;
    state.didDrag = false;
    state.suppressNextClick = false;
}

export function getReaderView() {
    return document.getElementById('reader-view') as HTMLElement | null;
}

export function getReaderStage() {
    return document.getElementById('reader-zoom-stage') as HTMLElement | null;
}

export function getReaderZoomLabel() {
    return document.getElementById('reader-zoom-label') as HTMLSpanElement | null;
}

export function getReaderToolbar() {
    return document.getElementById('reader-toolbar') as HTMLElement | null;
}

export function isReaderToolbarTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && !!target.closest('#reader-toolbar');
}

export function clampReaderPan(nextPanX: number, nextPanY: number, nextZoom = state.zoom) {
    const view = getReaderView();
    if (!view || nextZoom <= state.fitZoom + 0.001) {
        return { x: 0, y: 0 };
    }

    const maxPanX = Math.max(0, (view.clientWidth * nextZoom - view.clientWidth) / 2);
    const maxPanY = Math.max(0, (view.clientHeight * nextZoom - view.clientHeight) / 2);
    return {
        x: Math.max(-maxPanX, Math.min(maxPanX, nextPanX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextPanY))
    };
}

export function syncReaderViewport() {
    const stage = getReaderStage();
    const label = getReaderZoomLabel();
    const view = getReaderView();
    if (!stage || !view) return;

    const clampedPan = clampReaderPan(state.panX, state.panY);
    state.panX = clampedPan.x;
    state.panY = clampedPan.y;

    stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    if (label) {
        label.textContent = `${Math.round(state.zoom * 100)}%`;
    }

    view.classList.toggle('is-zoomed', state.zoom > state.fitZoom + 0.001);
    view.classList.toggle('is-panning', state.isPanning);
}

export function getReaderViewportCenter() {
    const view = getReaderView();
    const rect = view?.getBoundingClientRect();
    return rect ? {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    } : { x: 0, y: 0 };
}

export function setReaderZoom(nextZoom: number, anchorClientX: number, anchorClientY: number) {
    const stage = getReaderStage();
    if (!stage) return;

    const clampedZoom = Math.min(state.ZOOM_MAX, Math.max(state.fitZoom, parseFloat(nextZoom.toFixed(4))));
    if (Math.abs(clampedZoom - state.zoom) < 0.0001) return;

    const previousZoom = state.zoom;
    const previousRect = stage.getBoundingClientRect();
    const naturalX = (anchorClientX - previousRect.left) / previousZoom;
    const naturalY = (anchorClientY - previousRect.top) / previousZoom;

    state.zoom = clampedZoom;
    syncReaderViewport();

    requestAnimationFrame(() => {
        const nextRect = stage.getBoundingClientRect();
        const renderedX = nextRect.left + naturalX * state.zoom;
        const renderedY = nextRect.top + naturalY * state.zoom;
        state.panX += anchorClientX - renderedX;
        state.panY += anchorClientY - renderedY;
        syncReaderViewport();
    });
}

export function stepReaderZoom(direction: 'in' | 'out', anchor = getReaderViewportCenter()) {
    const nextZoom = direction === 'in'
        ? state.zoom * state.ZOOM_STEP_FACTOR
        : state.zoom / state.ZOOM_STEP_FACTOR;
    setReaderZoom(nextZoom, anchor.x, anchor.y);
}

export function resetReaderZoomToFit() {
    state.fitZoom = 1;
    state.zoom = state.fitZoom;
    state.panX = 0;
    state.panY = 0;
    syncReaderViewport();
}

export function updateReaderCursor(container: HTMLElement, visible = true) {
    if (!visible) {
        container.style.cursor = 'none';
        return;
    }

    if (state.isPanning) {
        container.style.cursor = 'grabbing';
    } else if (state.zoom > state.fitZoom + 0.001) {
        container.style.cursor = 'grab';
    } else {
        container.style.cursor = 'default';
    }
}

export function scheduleReaderToolbarHide(container: HTMLElement) {
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
        const toolbar = getReaderToolbar();
        if (toolbar) toolbar.style.opacity = '0';
        if (!state.isPanning) updateReaderCursor(container, false);
    }, 3000);
}

export function revealReaderChrome(container: HTMLElement) {
    const toolbar = getReaderToolbar();
    if (toolbar) toolbar.style.opacity = '1';
    updateReaderCursor(container, true);
    if (!state.isPanning) scheduleReaderToolbarHide(container);
}

export function exitReader(container: HTMLElement) {
    teardownReaderInteractions();
    if (state.activeAudioTrack) state.activeAudioTrack.pause();
    renderHome(container);
    updateChapterList(container);
}



export function getCurrentChapterTitle() {
    const chapterData = state.currentChapterData?.chapterData;
    const titleSource = chapterData?.imagesFolder || state.currentChapterData?.workspacePath || '';
    const title = titleSource.split(/[\\/]/).filter(Boolean).pop();
    return title || 'Chapter';
}

export function renderChapterCompleteScreen(container: HTMLElement, mode: 'cinematic' | 'standard') {
    teardownReaderInteractions();
    if (state.activeAudioTrack) {
        state.activeAudioTrack.pause();
        state.activeAudioTrack = null;
    }
    state.bState = 'IDLE';
    container.style.cursor = 'default';
    container.className = '';

    container.innerHTML = `
  <div class="chapter-complete-screen">
    <div class="chapter-complete-panel">
      <div class="chapter-complete-kicker">${mode === 'cinematic' ? 'Cinematic Mode' : 'Standard Mode'}</div>
      <h1>Chapter Complete</h1>
      <p>${escapeHtml(getCurrentChapterTitle())}</p>
      <div class="chapter-complete-actions">
        <button id="btn-read-again" class="chapter-complete-primary">Read Again</button>
        <button id="btn-complete-library">Back to Library</button>
      </div>
    </div>
  </div>
`;

    document.getElementById('btn-read-again')?.addEventListener('click', () => {
        if (mode === 'cinematic') {
            startModeB(container);
        } else {
            startModeA(container);
        }
    });
    document.getElementById('btn-complete-library')?.addEventListener('click', () => {
        renderHome(container);
    });
}

export function renderReaderUI(container: HTMLElement, title: string) {
    teardownReaderInteractions();
    container.innerHTML = `
  <div class="reader-shell">
    <div class="reader-toolbar" id="reader-toolbar">
      <h2 class="reader-toolbar-title">${title}</h2>
      <div class="reader-toolbar-actions">
        <div class="toolbar-volume" style="display: flex; align-items: center; gap: 8px;">
          <label for="reader-volume" title="Volume">🔊</label>
          <input type="range" id="reader-volume" min="0" max="1" step="0.01" value="${state.globalAudioVolume}" style="width: 80px; cursor: pointer;">
        </div>
        <div class="toolbar-zoom reader-toolbar-zoom">
          <button id="reader-zoom-out" title="Zoom Out">-</button>
          <span id="reader-zoom-label">100%</span>
          <button id="reader-zoom-in" title="Zoom In">+</button>
          <button id="reader-zoom-fit" title="Fit to View">Fit</button>
        </div>
        <button id="btn-toggle-mode" class="reader-toolbar-btn" style="border-color: var(--accent-color); color: var(--accent-color);">${state.sortedRegions.length > 0 ? 'Standard Mode' : 'Cinematic Mode'}</button>
        <button id="btn-close-reader" class="reader-toolbar-btn">Exit Chapter</button>
      </div>
    </div>

    <div id="reader-view" class="reader-view">
      <div id="reader-zoom-stage" class="reader-zoom-stage">
        <div id="reader-standard-layer" class="reader-layer reader-standard-layer"></div>
        <div id="layer-bg" class="reader-layer reader-cinematic-layer"></div>
        <div id="layer-fg" class="reader-layer reader-cinematic-layer"></div>
      </div>
    </div>
    <div id="yt-reader-container" style="position: absolute; left: -9999px;"><div id="yt-reader"></div></div>
  </div>
`;

    state.fitZoom = 1;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    state.isPanning = false;
    state.didDrag = false;
    state.suppressNextClick = false;
    state._scrollAccum = 0;
    syncReaderViewport();
    revealReaderChrome(container);

    const readerView = getReaderView();
    if (!readerView) return;

    const onContainerMouseMove = () => {
        revealReaderChrome(container);
    };
    const onReaderMouseDown = (e: MouseEvent) => {
        if (e.button !== 0 || state.zoom <= state.fitZoom + 0.001 || isReaderToolbarTarget(e.target)) return;
        state.isPanning = true;
        state.didDrag = false;
        state.pointerStartX = e.clientX;
        state.pointerStartY = e.clientY;
        state.panStartX = state.panX;
        state.panStartY = state.panY;
        syncReaderViewport();
        revealReaderChrome(container);
        e.preventDefault();
    };
    const onReaderMouseMove = (e: MouseEvent) => {
        revealReaderChrome(container);
        if (!state.isPanning) return;

        const deltaX = e.clientX - state.pointerStartX;
        const deltaY = e.clientY - state.pointerStartY;
        if (Math.abs(deltaX) > state.DRAG_THRESHOLD || Math.abs(deltaY) > state.DRAG_THRESHOLD) {
            state.didDrag = true;
        }

        state.panX = state.panStartX + deltaX;
        state.panY = state.panStartY + deltaY;
        syncReaderViewport();
    };
    const onReaderMouseUp = () => {
        if (!state.isPanning) return;
        state.isPanning = false;
        if (state.didDrag) {
            state.suppressNextClick = true;
        }
        syncReaderViewport();
        revealReaderChrome(container);
    };
    const onReaderClick = (e: MouseEvent) => {
        if (isReaderToolbarTarget(e.target)) return;
        if (state.suppressNextClick) {
            state.suppressNextClick = false;
            return;
        }
        handleReaderClick(container, e);
    };
    const onReaderWheel = (e: WheelEvent) => {
        e.preventDefault();
        revealReaderChrome(container);

        // ctrlKey is set by the browser for touchpad pinch-to-zoom gestures
        if (e.ctrlKey) {
            // Pinch zoom: use continuous scaling anchored to the pointer
            // deltaY values from pinch are typically in the range ±1–30
            // We map them to a smooth zoom factor: smaller delta = finer control
            const PINCH_SENSITIVITY = 0.008;
            const delta = -e.deltaY * PINCH_SENSITIVITY;
            const scale = Math.exp(delta); // e^delta keeps zoom proportional at any zoom level
            const nextZoom = state.zoom * scale;
            setReaderZoom(nextZoom, e.clientX, e.clientY);
        } else {
            // Two-finger scroll: pan when zoomed in, navigate pages when at fit
            if (state.zoom > state.fitZoom + 0.001) {
                // Pan the view with two-finger scroll
                const PAN_SENSITIVITY = 1.0;
                const dx = e.deltaX * PAN_SENSITIVITY;
                const dy = e.deltaY * PAN_SENSITIVITY;
                state.panX -= dx;
                state.panY -= dy;
                syncReaderViewport();
            } else {
                // At fit zoom: use vertical scroll to navigate pages
                // Accumulate scroll to avoid too-sensitive page flipping
                state._scrollAccum = (state._scrollAccum ?? 0) + e.deltaY;
                if (Math.abs(state._scrollAccum) >= 80) {
                    const dir = state._scrollAccum > 0 ? 'next' : 'prev';
                    state._scrollAccum = 0;
                    if (dir === 'next') {
                        handleReaderClick(container);
                    } else {
                        handleReaderClick(container, { clientX: 0, clientY: 0 } as MouseEvent);
                    }
                }
            }
        }
    };

    container.addEventListener('mousemove', onContainerMouseMove);
    readerView.addEventListener('mousedown', onReaderMouseDown);
    readerView.addEventListener('click', onReaderClick);
    readerView.addEventListener('wheel', onReaderWheel, { passive: false });
    window.addEventListener('mousemove', onReaderMouseMove);
    window.addEventListener('mouseup', onReaderMouseUp);
    document.removeEventListener('keydown', handleKey);
    document.addEventListener('keydown', handleKey);

    document.getElementById('reader-volume')?.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        state.globalAudioVolume = val;
        if (state.activeAudioTrack) {
            state.activeAudioTrack.updateGlobalVolume();
        }
    });

    document.getElementById('reader-zoom-in')?.addEventListener('click', () => {
        revealReaderChrome(container);
        stepReaderZoom('in');
    });
    document.getElementById('reader-zoom-out')?.addEventListener('click', () => {
        revealReaderChrome(container);
        stepReaderZoom('out');
    });
    document.getElementById('reader-zoom-fit')?.addEventListener('click', () => {
        revealReaderChrome(container);
        resetReaderZoomToFit();
    });
    document.getElementById('btn-toggle-mode')?.addEventListener('click', () => {
        if (state.sortedRegions.length > 0) {
            startModeA(container);
        } else {
            startModeB(container);
        }
    });
    document.getElementById('btn-close-reader')?.addEventListener('click', () => {
        exitReader(container);
    });

    state.detachEvents = () => {
        container.removeEventListener('mousemove', onContainerMouseMove);
        readerView.removeEventListener('mousedown', onReaderMouseDown);
        readerView.removeEventListener('click', onReaderClick);
        readerView.removeEventListener('wheel', onReaderWheel);
        window.removeEventListener('mousemove', onReaderMouseMove);
        window.removeEventListener('mouseup', onReaderMouseUp);
    };
}

export function handleReaderClick(container: HTMLElement, e?: MouseEvent) {
    let dir: 1 | -1 = 1;
    if (e) {
        const rect = container.getBoundingClientRect();
        // Right half of image = backward, left half = forward
        if (e.clientX > rect.left + rect.width * 0.5) {
            dir = -1;
        }
    }

    if (state.sortedRegions.length > 0) {
        navigateRegionB(container, dir);
    } else {
        if (dir === 1) nextImageA(container);
        else prevImageA(container);
    }
}

let lastContainer: HTMLElement | null = null;
export function handleKey(e: KeyboardEvent) {
    if (isReaderToolbarTarget(e.target)) return;
    const container = lastContainer || document.body; // Fallback, normally container is managed better, but for global keys

    if (e.key === 'ArrowLeft' || e.key === 'Space') {
        e.preventDefault();
        if (state.sortedRegions.length > 0) navigateRegionB(container, 1);
        else nextImageA(container);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (state.sortedRegions.length > 0) navigateRegionB(container, -1);
        else prevImageA(container);
    } else if (e.key === '+' || (e.key === '=' && e.shiftKey)) {
        e.preventDefault();
        revealReaderChrome(container);
        stepReaderZoom('in');
    } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        revealReaderChrome(container);
        stepReaderZoom('out');
    } else if (e.key === '0') {
        e.preventDefault();
        revealReaderChrome(container);
        resetReaderZoomToFit();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        document.getElementById('btn-close-reader')?.click();
    }
}
export function setContainerForKey(c: HTMLElement) {
    lastContainer = c;
}

export function animateReaderTo(targetZoom: number, targetPanX: number, targetPanY: number, durationMs = 600) {
    const stage = getReaderStage();
    const label = getReaderZoomLabel();
    const view = getReaderView();
    if (!stage || !view) return;

    stage.style.transition = `transform ${durationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`;

    state.zoom = targetZoom;
    state.panX = targetPanX;
    state.panY = targetPanY;

    stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    if (label) {
        label.textContent = `${Math.round(state.zoom * 100)}%`;
    }
    view.classList.toggle('is-zoomed', state.zoom > state.fitZoom + 0.001);

    setTimeout(() => {
        if (stage) stage.style.transition = '';
    }, durationMs + 50);
}
