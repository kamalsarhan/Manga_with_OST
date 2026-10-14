import { state } from './state';
import { Region, Point } from '../../types/models';
import { isEditableTarget } from '../shared/utils';

export function initCanvas() {
    const canvas = document.getElementById('region-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    const mainImage = document.getElementById('main-image') as HTMLImageElement;
    const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLElement;
    const canvasStage = document.getElementById('canvas-stage') as HTMLElement;
    const canvasArea = document.getElementById('canvas-area') as HTMLElement;
    const zoomLabel = document.getElementById('zoom-label') as HTMLSpanElement;

    const RESIZE_HANDLE_SIZE = 10;

    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.cursor = 'crosshair';
    canvas.style.zIndex = '10';

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
        return Math.min(state.ZOOM_MAX, Math.min(availableWidth / width, availableHeight / height, 1));
    }

    function clampZoom(nextZoom: number) {
        const minZoom = Math.min(state.fitZoom, 0.66);
        return Math.min(state.ZOOM_MAX, Math.max(minZoom, parseFloat(nextZoom.toFixed(4))));
    }

    function syncCanvasZoomUI() {
        const { width, height } = getCanvasSize();
        canvasStage.style.width = `${width * state.zoom}px`;
        canvasStage.style.height = `${height * state.zoom}px`;
        canvasWrapper.style.transform = `scale(${state.zoom})`;
        zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;

        canvasArea.classList.toggle('is-zoomed', state.zoom > state.fitZoom + 0.001);
        canvasArea.classList.toggle('is-pan-ready', !!state.currentImage && state.isSpacePressed && !state.isPanningCanvas);
        canvasArea.classList.toggle('is-panning', state.isPanningCanvas);
    }

    function fitCanvasToView() {
        if (!state.currentImage) return;
        state.fitZoom = computeFitZoom();
        state.zoom = state.fitZoom;
        syncCanvasZoomUI();
        requestAnimationFrame(() => {
            canvasArea.scrollLeft = 0;
            canvasArea.scrollTop = 0;
        });
    }

    function defaultCanvasZoom() {
        if (!state.currentImage) return;
        state.fitZoom = computeFitZoom();
        state.zoom = 0.66;
        syncCanvasZoomUI();
        requestAnimationFrame(() => {
            canvasArea.scrollLeft = 0;
            canvasArea.scrollTop = 0;
        });
    }

    function setCanvasZoom(nextZoom: number, anchorClientX: number, anchorClientY: number) {
        if (!state.currentImage) return;
        const clampedZoom = clampZoom(nextZoom);
        if (Math.abs(clampedZoom - state.zoom) < 0.0001) return;

        const previousZoom = state.zoom;
        const previousRect = canvasStage.getBoundingClientRect();
        const naturalX = (anchorClientX - previousRect.left) / previousZoom;
        const naturalY = (anchorClientY - previousRect.top) / previousZoom;

        state.zoom = clampedZoom;
        syncCanvasZoomUI();

        requestAnimationFrame(() => {
            const nextRect = canvasStage.getBoundingClientRect();
            const renderedX = nextRect.left + naturalX * state.zoom;
            const renderedY = nextRect.top + naturalY * state.zoom;
            canvasArea.scrollLeft += renderedX - anchorClientX;
            canvasArea.scrollTop += renderedY - anchorClientY;
        });
    }

    function stepCanvasZoom(direction: 'in' | 'out', anchor = getCanvasViewportCenter()) {
        const nextZoom = direction === 'in'
            ? state.zoom * state.ZOOM_STEP_FACTOR
            : state.zoom / state.ZOOM_STEP_FACTOR;
        setCanvasZoom(nextZoom, anchor.x, anchor.y);
    }

    function refreshCanvasZoom(preserveManualZoom: boolean) {
        if (!state.currentImage) return;
        const previousFitZoom = state.fitZoom;
        const wasFitted = Math.abs(state.zoom - previousFitZoom) < 0.001;
        state.fitZoom = computeFitZoom();

        if (!preserveManualZoom || wasFitted) {
            state.zoom = state.fitZoom;
            syncCanvasZoomUI();
            requestAnimationFrame(() => {
                canvasArea.scrollLeft = 0;
                canvasArea.scrollTop = 0;
            });
            return;
        }

        const minZoom = Math.min(state.fitZoom, 0.66);
        state.zoom = Math.max(state.zoom, minZoom);
        syncCanvasZoomUI();
    }

    function isOverResizeHandle(reg: Region, x: number, y: number): boolean {
        if (reg.shapeType === 'polygon') return false;
        const hx = reg.rect.x + reg.rect.w - RESIZE_HANDLE_SIZE;
        const hy = reg.rect.y + reg.rect.h - RESIZE_HANDLE_SIZE;
        return (x >= hx && x <= hx + RESIZE_HANDLE_SIZE && y >= hy && y <= hy + RESIZE_HANDLE_SIZE);
    }

    function updateCanvasCursor(pos?: Point | null, hoveredRegion?: Region | null) {
        if (state.isPanningCanvas) {
            canvas.style.cursor = 'grabbing';
            return;
        }

        if (state.currentImage && state.isSpacePressed) {
            canvas.style.cursor = 'grab';
            return;
        }

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

    function drawCanvas() {
        if (!ctx || !state.currentImage) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const imgsRegions = state.regions.filter(r => r.imageId === state.currentImage?.name);
        imgsRegions.forEach(r => {
            const isSelected = r.id === state.selectedRegionId;

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

            ctx.fillStyle = isSelected ? '#00c8ff' : '#c8a84e';
            ctx.font = 'bold 24px Outfit, Inter, sans-serif';
            ctx.fillText(r.order.toString(), r.rect.x + 10, r.rect.y + 30);

            if (isSelected && r.shapeType !== 'polygon') {
                ctx.fillStyle = '#00c8ff';
                ctx.fillRect(r.rect.x + r.rect.w - RESIZE_HANDLE_SIZE, r.rect.y + r.rect.h - RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            }
        });

        if (state.isDrawing) {
            if (state.drawMode === 'polygon') {
                ctx.strokeStyle = 'rgba(229, 9, 20, 0.8)';
                ctx.lineWidth = 3;
                if (state.currentPolygonPoints.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(state.currentPolygonPoints[0].x, state.currentPolygonPoints[0].y);
                    for (let i = 1; i < state.currentPolygonPoints.length; i++) {
                        ctx.lineTo(state.currentPolygonPoints[i].x, state.currentPolygonPoints[i].y);
                    }
                    if (currentMousePos) {
                        ctx.lineTo(currentMousePos.x, currentMousePos.y);
                    }
                    ctx.stroke();

                    ctx.fillStyle = 'white';
                    state.currentPolygonPoints.forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                        ctx.fill();
                    });
                }
            } else if (state.currentRect) {
                ctx.strokeStyle = 'rgba(229, 9, 20, 0.8)';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(state.currentRect.x, state.currentRect.y, state.currentRect.w, state.currentRect.h);
                ctx.setLineDash([]);
            }
        }
    }

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
        if (!state.currentImage) return null;
        const imgsRegions = state.regions.filter(r => r.imageId === state.currentImage?.name);
        for (let i = imgsRegions.length - 1; i >= 0; i--) {
            const r = imgsRegions[i];
            if (isPointInRegion(r, { x, y })) {
                return r;
            }
        }
        return null;
    }

    function getMousePos(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        let rawX = (e.clientX - rect.left) * (canvas.width / rect.width);
        let rawY = (e.clientY - rect.top) * (canvas.height / rect.height);
        const x = Math.max(0, Math.min(rawX, canvas.width));
        const y = Math.max(0, Math.min(rawY, canvas.height));
        return { x, y };
    }

    // State events
    state.on('render:canvas', drawCanvas);
    state.on('image:loaded', () => {
        canvasWrapper.style.width = mainImage.naturalWidth + 'px';
        canvasWrapper.style.height = mainImage.naturalHeight + 'px';
        canvas.width = mainImage.naturalWidth;
        canvas.height = mainImage.naturalHeight;
        defaultCanvasZoom();
        drawCanvas();
    });
    state.on('zoom:in', () => stepCanvasZoom('in'));
    state.on('zoom:out', () => stepCanvasZoom('out'));
    state.on('zoom:fit', () => fitCanvasToView());

    // Canvas Events
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
        if (!state.currentImage) return;
        if (state.isSpacePressed || state.isPanningCanvas) return;
        const pos = getMousePos(e);

        if (e.button === 2) {
            if (state.drawMode === 'polygon' && state.currentPolygonPoints.length > 0) {
                if (state.currentPolygonPoints.length > 2) {
                    const minX = Math.min(...state.currentPolygonPoints.map(p => p.x));
                    const maxX = Math.max(...state.currentPolygonPoints.map(p => p.x));
                    const minY = Math.min(...state.currentPolygonPoints.map(p => p.y));
                    const maxY = Math.max(...state.currentPolygonPoints.map(p => p.y));
                    const rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

                    state.emit('region:add', {
                        id: 'r-' + Date.now().toString(),
                        imageId: state.currentImage.name,
                        order: 0,
                        rect: rect,
                        shapeType: 'polygon',
                        polygon: [...state.currentPolygonPoints],
                        transitionType: 'sharp'
                    });
                }
                state.currentPolygonPoints = [];
                state.isDrawing = false;
                drawCanvas();
                return;
            }

            const clickedRegion = getRegionAtPos(pos.x, pos.y);
            if (clickedRegion) {
                if (state.selectedRegionId === clickedRegion.id) {
                    const allAtPos = state.regions.filter(r => {
                        if (r.imageId !== state.currentImage?.name) return false;
                        return isPointInRegion(r, pos);
                    });
                    if (allAtPos.length > 1) {
                        const idx = allAtPos.findIndex(r => r.id === state.selectedRegionId);
                        const nextIdx = (idx - 1 + allAtPos.length) % allAtPos.length;
                        state.selectedRegionId = allAtPos[nextIdx].id;
                    }
                } else {
                    state.selectedRegionId = clickedRegion.id;
                }
            } else {
                state.selectedRegionId = null;
            }
            state.emit('render:regions');
            state.emit('render:audio');
            drawCanvas();
            return;
        }

        if (state.drawMode === 'polygon') {
            state.isDrawing = true;
            state.selectedRegionId = null;
            state.currentPolygonPoints.push(pos);
            drawCanvas();
            return;
        }

        let clickedActiveHandle = false;
        let clickedActiveBody = false;

        if (state.selectedRegionId) {
            const activeReg = state.regions.find(r => r.id === state.selectedRegionId);
            if (activeReg && activeReg.imageId === state.currentImage.name) {
                if (isOverResizeHandle(activeReg, pos.x, pos.y)) clickedActiveHandle = true;
                else if (isPointInRegion(activeReg, pos)) {
                    clickedActiveBody = true;
                }
            }
        }

        if (clickedActiveHandle) {
            state.isResizing = true;
        } else if (clickedActiveBody) {
            state.isDragging = true;
            const reg = state.regions.find(r => r.id === state.selectedRegionId)!;
            state.dragOffsetX = pos.x - reg.rect.x;
            state.dragOffsetY = pos.y - reg.rect.y;
        } else {
            state.selectedRegionId = null;
            state.isDrawing = true;
            state.startX = pos.x;
            state.startY = pos.y;
            state.currentRect = { x: state.startX, y: state.startY, w: 0, h: 0 };
        }

        state.emit('render:regions');
        state.emit('render:audio');
        drawCanvas();
    });

    let currentMousePos: Point | null = null;

    window.addEventListener('mousemove', (e) => {
        if (state.isPanningCanvas) {
            canvasArea.scrollLeft = state.panStartScrollLeft - (e.clientX - state.panStartClientX);
            canvasArea.scrollTop = state.panStartScrollTop - (e.clientY - state.panStartClientY);
            updateCanvasCursor();
            return;
        }

        if (!state.currentImage) return;

        const pos = getMousePos(e);
        currentMousePos = pos;

        if (!state.isDrawing && !state.isDragging && !state.isResizing) {
            if (e.target === canvas) {
                const hoverReg = getRegionAtPos(pos.x, pos.y);
                updateCanvasCursor(pos, hoverReg);
            } else {
                updateCanvasCursor();
            }
        }

        if (state.isDragging && state.selectedRegionId) {
            const reg = state.regions.find(r => r.id === state.selectedRegionId);
            if (reg) {
                const newX = Math.max(0, Math.min(pos.x - state.dragOffsetX, canvas.width - reg.rect.w));
                const newY = Math.max(0, Math.min(pos.y - state.dragOffsetY, canvas.height - reg.rect.h));
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
        } else if (state.isResizing && state.selectedRegionId) {
            canvas.style.cursor = 'nwse-resize';
            const reg = state.regions.find(r => r.id === state.selectedRegionId);
            if (reg && reg.shapeType !== 'polygon') {
                reg.rect.w = Math.max(10, Math.min(pos.x - reg.rect.x, canvas.width - reg.rect.x));
                reg.rect.h = Math.max(10, Math.min(pos.y - reg.rect.y, canvas.height - reg.rect.y));
                drawCanvas();
            }
        } else if (state.isDrawing) {
            if (state.drawMode === 'polygon') {
                drawCanvas();
            } else if (state.currentRect) {
                state.currentRect.w = pos.x - state.startX;
                state.currentRect.h = pos.y - state.startY;
                drawCanvas();
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (state.isPanningCanvas) {
            state.isPanningCanvas = false;
            syncCanvasZoomUI();
            updateCanvasCursor();
        }
        state.isDragging = false;
        state.isResizing = false;

        if (state.isDrawing && state.drawMode === 'rect' && state.currentImage && state.currentRect) {
            state.isDrawing = false;
            if (state.currentRect.w < 0) { state.currentRect.x += state.currentRect.w; state.currentRect.w = Math.abs(state.currentRect.w); }
            if (state.currentRect.h < 0) { state.currentRect.y += state.currentRect.h; state.currentRect.h = Math.abs(state.currentRect.h); }

            if (state.currentRect.w > 20 && state.currentRect.h > 20) {
                state.emit('region:add', {
                    id: 'r-' + Date.now().toString(),
                    imageId: state.currentImage.name,
                    order: 0,
                    rect: state.currentRect,
                    shapeType: 'rect',
                    transitionType: 'sharp'
                });
            }
            state.currentRect = null;
        }
        updateCanvasCursor();
        drawCanvas();
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !isEditableTarget(e.target) && state.currentImage) {
            state.isSpacePressed = true;
            syncCanvasZoomUI();
            updateCanvasCursor();
            e.preventDefault();
            return;
        }

        if (isEditableTarget(e.target)) return;

        if (e.key === 'Escape' && state.isDrawing && state.drawMode === 'polygon') {
            state.isDrawing = false;
            state.currentPolygonPoints = [];
            drawCanvas();
            return;
        }

        if (!state.currentImage) return;

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
        state.isSpacePressed = false;
        syncCanvasZoomUI();
        updateCanvasCursor();
    });

    window.addEventListener('blur', () => {
        state.isSpacePressed = false;
        state.isPanningCanvas = false;
        syncCanvasZoomUI();
        updateCanvasCursor();
    });

    canvasArea.addEventListener('wheel', (e: WheelEvent) => {
        if (!state.currentImage || (!e.ctrlKey && !e.metaKey)) return;
        e.preventDefault();
        const anchor = { x: e.clientX, y: e.clientY };
        stepCanvasZoom(e.deltaY < 0 ? 'in' : 'out', anchor);
    }, { passive: false });

    canvasArea.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !state.currentImage || !state.isSpacePressed) return;
        state.isPanningCanvas = true;
        state.panStartClientX = e.clientX;
        state.panStartClientY = e.clientY;
        state.panStartScrollLeft = canvasArea.scrollLeft;
        state.panStartScrollTop = canvasArea.scrollTop;
        syncCanvasZoomUI();
        updateCanvasCursor();
        e.preventDefault();
        e.stopPropagation();
    }, true);

    const canvasAreaResizeObserver = new ResizeObserver(() => {
        if (!state.currentImage) return;
        refreshCanvasZoom(true);
    });
    canvasAreaResizeObserver.observe(canvasArea);
}
