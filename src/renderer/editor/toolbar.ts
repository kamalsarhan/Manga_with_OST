import { state } from './state';
import { showToast } from '../shared/toast';

export function initToolbar() {
    const toolbarTip = document.getElementById('toolbar-tip') as HTMLSpanElement;
    const btnAutoDetect = document.getElementById('btn-auto-detect') as HTMLButtonElement;
    const magiv2StatusDot = document.getElementById('magiv2-status') as HTMLSpanElement;
    const magiv2Spinner = document.getElementById('magiv2-spinner') as HTMLSpanElement;
    let magiv2ServerOnline = false;
    let isDetecting = false;

    function getDefaultToolbarTip() {
        return state.drawMode === 'polygon'
            ? 'Click to add points - Right-click to close shape - Esc to cancel'
            : 'Drag to create region - Right-click to select';
    }

    document.getElementById('btn-mode-rect')?.addEventListener('click', () => {
        state.drawMode = 'rect';
        document.getElementById('btn-mode-rect')?.classList.add('on');
        document.getElementById('btn-mode-poly')?.classList.remove('on');
        toolbarTip.textContent = getDefaultToolbarTip();
        if (state.isDrawing) { 
            state.isDrawing = false; 
            state.currentPolygonPoints = []; 
            state.currentRect = null; 
            state.emit('render:canvas');
        }
    });
    document.getElementById('btn-mode-poly')?.addEventListener('click', () => {
        state.drawMode = 'polygon';
        document.getElementById('btn-mode-poly')?.classList.add('on');
        document.getElementById('btn-mode-rect')?.classList.remove('on');
        toolbarTip.textContent = getDefaultToolbarTip();
        if (state.isDrawing) { 
            state.isDrawing = false; 
            state.currentPolygonPoints = []; 
            state.currentRect = null; 
            state.emit('render:canvas');
        }
    });

    document.getElementById('btn-home')?.addEventListener('click', () => window.location.reload());

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => state.emit('zoom:in'));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => state.emit('zoom:out'));
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => state.emit('zoom:fit'));

    const audioPanel = document.getElementById('audio-panel') as HTMLElement;
    document.getElementById('btn-toggle-audio')?.addEventListener('click', () => {
        state.audioPlayerVisible = !state.audioPlayerVisible;
        audioPanel.classList.toggle('collapsed', !state.audioPlayerVisible);
    });

    async function checkMagiv2Status() {
        try {
            magiv2ServerOnline = await window.electronAPI.checkMagiv2Status();
        } catch {
            magiv2ServerOnline = false;
        }
        magiv2StatusDot.classList.toggle('online', magiv2ServerOnline);
        magiv2StatusDot.classList.toggle('offline', !magiv2ServerOnline);
        magiv2StatusDot.title = magiv2ServerOnline
            ? 'MagiV2 Server: Connected'
            : 'MagiV2 Server: Disconnected (click Auto Detect to start)';
    }

    checkMagiv2Status();
    setInterval(checkMagiv2Status, 15000);

    btnAutoDetect.addEventListener('click', async () => {
        if (!state.currentImage) {
            showToast('Open an image first', 'error');
            return;
        }
        if (isDetecting) return;

        isDetecting = true;
        btnAutoDetect.classList.add('detecting');
        magiv2Spinner.style.display = 'inline-block';
        (document.querySelector('.magiv2-btn-text') as HTMLElement).textContent = 'Detecting...';

        try {
            if (!magiv2ServerOnline) {
                showToast('Starting MagiV2 server...', 'info');
                const startResult = await window.electronAPI.startMagiv2Server();
                if (!startResult.success) {
                    showToast(`Failed to start MagiV2: ${startResult.error}`, 'error');
                    return;
                }
                magiv2ServerOnline = true;
                magiv2StatusDot.classList.add('online');
                magiv2StatusDot.classList.remove('offline');
                showToast('MagiV2 server started!', 'success');
            }

            const imagePath = state.currentImage.path;
            showToast('Analyzing manga page...', 'info');

            const result = await window.electronAPI.detectRegions(imagePath);

            if (!result.success) {
                showToast(`Detection failed: ${result.error}`, 'error');
                return;
            }

            if (!result.panels || result.panels.length === 0) {
                showToast('No panels detected on this page', 'info');
                return;
            }

            let addedCount = 0;
            for (const panel of result.panels) {
                const overlaps = state.regions.some(r => {
                    if (r.imageId !== state.currentImage!.name) return false;
                    const overlapX = Math.max(0, Math.min(r.rect.x + r.rect.w, panel.x + panel.w) - Math.max(r.rect.x, panel.x));
                    const overlapY = Math.max(0, Math.min(r.rect.y + r.rect.h, panel.y + panel.h) - Math.max(r.rect.y, panel.y));
                    const overlapArea = overlapX * overlapY;
                    const panelArea = panel.w * panel.h;
                    return overlapArea > panelArea * 0.5;
                });

                if (overlaps) continue;

                state.emit('region:add', {
                    id: 'r-' + (Date.now() + addedCount).toString(),
                    imageId: state.currentImage!.name,
                    order: 0,
                    rect: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
                    shapeType: 'rect',
                    transitionType: 'sharp'
                });
                addedCount++;
            }

            if (addedCount > 0) {
                showToast(`Detected ${addedCount} new panel${addedCount !== 1 ? 's' : ''}`, 'success');
            } else {
                showToast('No new panels detected (all overlapped with existing ones)', 'info');
            }

        } catch (err: any) {
            showToast(`Error: ${err.message || 'Unknown error'}`, 'error');
        } finally {
            isDetecting = false;
            btnAutoDetect.classList.remove('detecting');
            magiv2Spinner.style.display = 'none';
            (document.querySelector('.magiv2-btn-text') as HTMLElement).textContent = 'Auto Detect';
        }
    });
}
