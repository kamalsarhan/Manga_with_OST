import { LibraryChapter, WorkspaceData } from '../../types/ipc';
import { Region } from '../../types/models';

export interface TrackWrapper {
    trackId: string;
    get volume(): number;
    set volume(v: number);
    pause(): void;
    play(): void;
    updateGlobalVolume(): void;
}

type EventCallback = (data?: any) => void;

class ReaderState {
    chapters: LibraryChapter[] = [];
    currentChapterData: WorkspaceData | null = null;
    centralAudioLinks: Record<string, string> = {};

    currentImageIndex = 0;
    currentRegionIndex = 0;
    sortedRegions: Region[] = [];

    globalAudioVolume = 1;
    activeAudioTrack: TrackWrapper | null = null;

    bState: 'PLAYING' | 'WAIT_INPUT' | 'IDLE' = 'IDLE';

    // Zoom and Pan
    readonly ZOOM_MAX = 4.0;
    readonly ZOOM_STEP_FACTOR = 1.15;
    readonly DRAG_THRESHOLD = 6;
    zoom = 1;
    fitZoom = 1;
    panX = 0;
    panY = 0;

    isPanning = false;
    pointerStartX = 0;
    pointerStartY = 0;
    panStartX = 0;
    panStartY = 0;
    didDrag = false;
    suppressNextClick = false;
    _scrollAccum = 0;

    hideTimer: ReturnType<typeof setTimeout> | null = null;
    detachEvents: (() => void) | null = null;

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

export const state = new ReaderState();
