export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Region {
    id: string;
    imageId: string;
    order: number;
    rect: Rect;
    shapeType?: 'rect' | 'polygon';
    polygon?: Point[];
    audioSpanId?: string;
    transitionType?: 'fade' | 'sharp' | 'blur';
    /**
     * Identifier for a blur group. Regions that share the same blurGroupId are considered part of the same blur set.
     */
    blurGroupId?: string;
    /**
     * When true, previous regions remain visible while this blur region is shown.
     */
    keepPrevious?: boolean;
}

export interface AudioSpan {
    id: string;
    trackId: string;
    startRegionOrder: number;
    endRegionOrder: number;
    startTime: number;
    endTime: number;
    loop: boolean;
}
export interface Chapter {
    version: string;
    /**
     * The name of the images folder (subdirectory name inside the images root) that this chapter references.
     */
    imagesFolder?: string;
    regions: Region[];
    audioSpans: AudioSpan[];
    imagesConfig?: Record<string, { blurMode?: boolean; keepPreviousVisible?: boolean }>;
    audioSourceLinks?: Record<string, string>;
}
