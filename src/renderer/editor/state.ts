import { WorkspaceData, FileData } from '../../types/ipc';
import { Region, Rect, AudioSpan, Point } from '../../types/models';

type EventCallback = (data?: any) => void;

class EditorState {
    workspace: WorkspaceData | null = null;
    currentImage: FileData | null = null;
    regions: Region[] = [];
    audioSpans: AudioSpan[] = [];
    imagesConfig: Record<string, { blurMode?: boolean; keepPreviousVisible?: boolean }> = {};
    audioSourceLinks: Record<string, string> = {};

    audioLibrarySearch = '';
    selectedAudioLibraryTrack: string | null = null;

    isDrawing = false;
    isDragging = false;
    isResizing = false;
    selectedRegionId: string | null = null;
    
    dragOffsetX = 0;
    dragOffsetY = 0;
    startX = 0;
    startY = 0;
    currentRect: Rect | null = null;
    drawMode: 'rect' | 'polygon' = 'rect';
    currentPolygonPoints: Point[] = [];

    // Zoom state
    zoom = 0.66;
    fitZoom = 1;
    readonly ZOOM_MAX = 4.0;
    readonly ZOOM_STEP_FACTOR = 1.15;
    
    // Canvas pan state
    isSpacePressed = false;
    isPanningCanvas = false;
    panStartClientX = 0;
    panStartClientY = 0;
    panStartScrollLeft = 0;
    panStartScrollTop = 0;

    audioPlayerVisible = true;
    activeTab: 'regions' | 'audio' | 'timeline' | 'notifications' = 'regions';

    private listeners: Record<string, EventCallback[]> = {};

    on(event: string, callback: EventCallback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event: string, data?: any) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

export const state = new EditorState();
