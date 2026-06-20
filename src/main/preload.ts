import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI } from '../types/ipc';

const api: ElectronAPI = {
    selectWorkspace: () => ipcRenderer.invoke('select-workspace'),
    saveChapter: (path, data, chapterJsonPath) => ipcRenderer.invoke('save-chapter', path, data, chapterJsonPath),

    selectLibrary: () => ipcRenderer.invoke('select-library'),
    loadLibrary: () => ipcRenderer.invoke('load-library'),
    loadChapter: (path) => ipcRenderer.invoke('load-chapter', path),

    // Chapter files
    listChapterFiles: () => ipcRenderer.invoke('list-chapter-files'),
    loadChapterByFile: (chapterJsonPath) => ipcRenderer.invoke('load-chapter-by-file', chapterJsonPath),
    saveChapterToDir: (data, filename) => ipcRenderer.invoke('save-chapter-to-dir', data, filename),

    // Directory management
    selectDirectory: (title) => ipcRenderer.invoke('select-directory', title),
    setDirectories: (config) => ipcRenderer.invoke('set-directories', config),
    getDirectoryConfig: () => ipcRenderer.invoke('get-directory-config'),
    migrateChapterFiles: () => ipcRenderer.invoke('migrate-chapter-files'),

    exportChapter: (path) => ipcRenderer.invoke('export-chapter', path),
    downloadAudio: (url, prefix, exactName, browser) => ipcRenderer.invoke('download-audio', url, prefix, exactName, browser),
    loadAudioLinks: () => ipcRenderer.invoke('load-audio-links'),
    saveAudioLinks: (links) => ipcRenderer.invoke('save-audio-links', links),
    resetDirectories: () => ipcRenderer.invoke('reset-directories'),
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
