import { Chapter } from './models';

export interface FileData {
    name: string;
    path: string;
    url: string;
}

export interface WorkspaceData {
    images: FileData[];
    audio: FileData[];
    chapterData: Chapter | null;
    workspacePath: string;
    /** Path to the chapter JSON file that was loaded (inside the chapters directory) */
    chapterJsonPath?: string;
}

export interface LibraryChapter {
    name: string;
    path: string;
    cover?: string;
}

/** Info about a chapter JSON file found in the chapters directory */
export interface ChapterFileInfo {
    /** Display name, e.g. "chapter001" */
    name: string;
    /** Full path to the JSON file */
    path: string;
    /** The parsed imagesFolder field from the chapter JSON (if present) */
    imagesFolder?: string;
}

/** Current user directory configuration */
export interface DirectoryConfig {
    rootDir: string;
    audioDir: string;
    chaptersDir: string;
}

export interface ServerStatus {
    running: boolean;
    port: number;
    localUrl: string;
    publicUrl: string | null;
    connections: number;
}

export interface ElectronAPI {
    // Editor
    selectWorkspace: () => Promise<WorkspaceData | null>;
    saveChapter: (path: string, data: Chapter, chapterJsonPath?: string) => Promise<boolean>;

    // Reader
    selectLibrary: () => Promise<LibraryChapter[] | null>;
    loadLibrary: () => Promise<LibraryChapter[] | null>;
    loadChapter: (chapterPath: string) => Promise<WorkspaceData | null>;

    // Chapter files (new)
    listChapterFiles: () => Promise<ChapterFileInfo[]>;
    loadChapterByFile: (chapterJsonPath: string) => Promise<WorkspaceData | null>;
    saveChapterToDir: (data: Chapter, filename?: string) => Promise<{ success: boolean; path?: string; error?: string }>;

    // Directory management
    selectDirectory: (title: string) => Promise<string | null>;
    setDirectories: (config: DirectoryConfig) => Promise<boolean>;
    getDirectoryConfig: () => Promise<DirectoryConfig | null>;
    migrateChapterFiles: () => Promise<{ success: boolean; migrated: number; errors: string[] }>;

    // Export
    exportChapter: (workspacePath: string) => Promise<boolean>;

    // Utility
    resetDirectories: () => Promise<boolean>;
    downloadAudio: (url: string, prefix?: string, exactName?: boolean, browser?: string) => Promise<{ success: boolean, newTrack?: FileData, error?: string }>;

    // Central audio links JSON
    loadAudioLinks: () => Promise<Record<string, string>>;
    saveAudioLinks: (links: Record<string, string>) => Promise<boolean>;

    // MagiV2 panel detection
    detectRegions: (imagePath: string) => Promise<{ success: boolean; panels?: { x: number; y: number; w: number; h: number }[]; error?: string }>;
    checkMagiv2Status: () => Promise<boolean>;
    startMagiv2Server: () => Promise<{ success: boolean; error?: string }>;

    // Server
    startServer: (port?: number) => Promise<{ success: boolean; status?: ServerStatus; error?: string }>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
    getServerStatus: () => Promise<ServerStatus>;
    startNgrok: (port?: number) => Promise<{ success: boolean; url?: string; error?: string }>;
    stopNgrok: () => Promise<{ success: boolean; error?: string }>;
}
