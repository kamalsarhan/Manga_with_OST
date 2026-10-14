import { app, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DirectoryConfig } from '../../types/ipc';

function getPrefsPath() {
    return path.join(app.getPath('userData'), 'user_prefs.json');
}

let cachedDirectories: { rootDir: string, audioDir: string, chaptersDir: string } | null = null;

export async function getDirectories(): Promise<{ rootDir: string, audioDir: string, chaptersDir: string }> {
    if (cachedDirectories) return cachedDirectories;

    const prefsPath = getPrefsPath();
    try {
        const data = await fs.readFile(prefsPath, 'utf-8');
        const prefs = JSON.parse(data);
        if (prefs && prefs.rootDir && prefs.audioDir && prefs.chaptersDir) {
            cachedDirectories = prefs;
            return prefs;
        }
    } catch {
        // ignore
    }

    throw new Error('Directories not configured');
}

export function registerDirectoryHandlers() {
    ipcMain.handle('select-directory', async (event, title: string): Promise<string | null> => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('set-directories', async (event, config: DirectoryConfig): Promise<boolean> => {
        try {
            const prefsPath = getPrefsPath();
            await fs.writeFile(prefsPath, JSON.stringify(config, null, 2));
            cachedDirectories = config;
            return true;
        } catch (e) {
            console.error('Failed to save directory config:', e);
            return false;
        }
    });

    ipcMain.handle('get-directory-config', async (): Promise<DirectoryConfig | null> => {
        try {
            return await getDirectories();
        } catch {
            return null;
        }
    });

    ipcMain.handle('reset-directories', async () => {
        cachedDirectories = null;
        const prefsPath = getPrefsPath();
        try {
            await fs.unlink(prefsPath);
        } catch { }
        return true;
    });
}
