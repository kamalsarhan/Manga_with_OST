import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { Chapter } from '../types/models';
import { FileData, WorkspaceData, ChapterFileInfo, DirectoryConfig } from '../types/ipc';
import { create } from 'youtube-dl-exec';
import ffmpegStatic from 'ffmpeg-static';

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, '../../../build/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false, // allow local files easily (can be stricter later)
            webviewTag: true    // allow <webview> for YouTube embeds
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Basic helpers
function getPrefsPath() {
    return path.join(app.getPath('userData'), 'user_prefs.json');
}

let cachedDirectories: { rootDir: string, audioDir: string, chaptersDir: string } | null = null;

async function getDirectories(): Promise<{ rootDir: string, audioDir: string, chaptersDir: string }> {
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

// ─── Directory Management IPC ─────────────────────────────────────────────────

// Let the renderer pick a single directory via native dialog
ipcMain.handle('select-directory', async (event, title: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// Save directory configuration from the renderer-side setup UI
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

// Read current directory configuration (returns null if not set)
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

// ─── Migration: move chapter.json files from image folders to chapters dir ───
ipcMain.handle('migrate-chapter-files', async (): Promise<{ success: boolean; migrated: number; errors: string[] }> => {
    try {
        const dirs = await getDirectories();
        const rootDir = dirs.rootDir;
        const chaptersDir = dirs.chaptersDir;

        // Ensure chapters directory exists
        await fs.mkdir(chaptersDir, { recursive: true });

        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        let migrated = 0;
        const errors: string[] = [];

        for (const ent of entries) {
            if (!ent.isDirectory()) continue;

            const chapterJsonPath = path.join(rootDir, ent.name, 'chapter.json');
            try {
                await fs.access(chapterJsonPath);
            } catch {
                continue; // No chapter.json in this folder
            }

            try {
                // Read the chapter.json
                const jsonStr = await fs.readFile(chapterJsonPath, 'utf-8');
                const chapterData = JSON.parse(jsonStr) as Chapter;

                // Set the imagesFolder reference
                chapterData.imagesFolder = ent.name;

                // Check if this chapter was already migrated
                let alreadyMigrated = false;
                try {
                    const existingFiles = await fs.readdir(chaptersDir);
                    const jsonFiles = existingFiles.filter(f => f.toLowerCase().endsWith('.json'));
                    for (const jf of jsonFiles) {
                        const fullPath = path.join(chaptersDir, jf);
                        const existingStr = await fs.readFile(fullPath, 'utf-8');
                        const existing = JSON.parse(existingStr) as Chapter;
                        if (existing.imagesFolder === ent.name) {
                            alreadyMigrated = true;
                            break;
                        }
                    }
                } catch { }

                if (alreadyMigrated) continue;

                // Determine filename based on folder name
                // Try to extract number from folder name (e.g., "Chapter_001" → 1, "350" → 350)
                const numMatch = ent.name.match(/(\d+)/);
                let targetFilename: string;
                if (numMatch) {
                    const num = parseInt(numMatch[1], 10);
                    targetFilename = `chapter${String(num).padStart(3, '0')}.json`;
                } else {
                    // No number found, use next sequential
                    targetFilename = await getNextChapterFilename(chaptersDir);
                }

                // Avoid filename collision
                const targetPath = path.join(chaptersDir, targetFilename);
                try {
                    await fs.access(targetPath);
                    // File exists, use next sequential instead
                    targetFilename = await getNextChapterFilename(chaptersDir);
                } catch {
                    // File doesn't exist, safe to use
                }

                const finalPath = path.join(chaptersDir, targetFilename);
                await fs.writeFile(finalPath, JSON.stringify(chapterData, null, 2));
                migrated++;
            } catch (e: any) {
                errors.push(`${ent.name}: ${e.message}`);
            }
        }

        return { success: true, migrated, errors };
    } catch (e: any) {
        return { success: false, migrated: 0, errors: [e.message || 'Unknown error'] };
    }
});

async function getFiles(dir: string, exts: string[]): Promise<FileData[]> {
    try {
        const files = await fs.readdir(dir);
        const validFiles = files.filter(f => exts.includes(path.extname(f).toLowerCase()));

        // Sort numerically by padded filename (000, 001, etc)
        validFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        return validFiles.map(f => {
            const p = path.join(dir, f);
            return {
                name: f,
                path: p,
                url: `file://${p.replace(/\\/g, '/')}`
            };
        });
    } catch (e) {
        return [];
    }
}

// Helper: get the next sequential chapter filename in the chapters directory
async function getNextChapterFilename(chaptersDir: string): Promise<string> {
    try {
        const files = await fs.readdir(chaptersDir);
        const chapterFiles = files.filter(f => f.toLowerCase().endsWith('.json'));
        if (chapterFiles.length === 0) return 'chapter001.json';

        // Find the highest number
        let maxNum = 0;
        for (const f of chapterFiles) {
            const match = f.match(/^chapter.*?(\d+)\.json$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }
        const nextNum = maxNum + 1;
        return `chapter${String(nextNum).padStart(3, '0')}.json`;
    } catch {
        return 'chapter001.json';
    }
}

// IPC Handlers
ipcMain.handle('select-workspace', async (event): Promise<WorkspaceData | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;

    const wsPath = result.filePaths[0];
    const imagesDir = wsPath; // Images directly in chapter folder

    let audioDir = "";
    let chaptersDir = "";
    try {
        const dirs = await getDirectories();
        audioDir = dirs.audioDir;
        chaptersDir = dirs.chaptersDir;
    } catch (e) {
        return null;
    }

    const images = await getFiles(imagesDir, ['.jpg', '.jpeg', '.png', '.webp']);
    const audio = await getFiles(audioDir, ['.mp3', '.wav', '.ogg']);

    // Try to find a chapter JSON in the chapters directory that references this images folder
    const folderName = path.basename(wsPath);
    let chapterData: Chapter | null = null;
    let chapterJsonPath: string | undefined = undefined;

    try {
        const chapterFiles = await fs.readdir(chaptersDir);
        const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json')).sort();

        for (const jf of jsonFiles) {
            const fullPath = path.join(chaptersDir, jf);
            const jsonStr = await fs.readFile(fullPath, 'utf-8');
            const parsed = JSON.parse(jsonStr) as Chapter;
            if (parsed.imagesFolder === folderName) {
                chapterData = parsed;
                chapterJsonPath = fullPath;
                break;
            }
        }
    } catch (e) {
        // No chapter file found for this folder
    }

    return { workspacePath: wsPath, images, audio, chapterData, chapterJsonPath };
});

ipcMain.handle('save-chapter', async (event, wsPath: string, data: Chapter, chapterJsonPath?: string) => {
    try {
        const dirs = await getDirectories();
        const folderName = path.basename(wsPath);

        // Ensure imagesFolder is set
        data.imagesFolder = folderName;

        let targetPath: string | null = chapterJsonPath || null;

        if (!targetPath) {
            // Check if a chapter file already exists for this images folder
            try {
                const chapterFiles = await fs.readdir(dirs.chaptersDir);
                const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json')).sort();

                for (const jf of jsonFiles) {
                    const fullPath = path.join(dirs.chaptersDir, jf);
                    const jsonStr = await fs.readFile(fullPath, 'utf-8');
                    const parsed = JSON.parse(jsonStr) as Chapter;
                    if (parsed.imagesFolder === folderName) {
                        targetPath = fullPath;
                        break;
                    }
                }
            } catch (e) {
                // ignore
            }
        }

        // If no existing file, create a new one using the folder name as the file name
        if (!targetPath) {
            targetPath = path.join(dirs.chaptersDir, `${folderName}.json`);
        }

        await fs.writeFile(targetPath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error("Save Error", e);
        return false;
    }
});

ipcMain.handle('export-chapter', async (event, wsPath: string) => {
    try {
        const result = await dialog.showSaveDialog({
            title: 'Export Chapter',
            defaultPath: path.join(app.getPath('documents'), path.basename(wsPath) + '.zip'),
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (result.canceled || !result.filePath) return false;

        const zip = new AdmZip();

        // Add images directory
        try {
            zip.addLocalFolder(path.join(wsPath, 'images'), 'images');
        } catch (e) { console.warn("No images folder found to zip"); }

        // Add chapter.json from chapters directory
        try {
            const dirs = await getDirectories();
            const folderName = path.basename(wsPath);
            const chapterFiles = await fs.readdir(dirs.chaptersDir);
            const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json')).sort();

            for (const jf of jsonFiles) {
                const fullPath = path.join(dirs.chaptersDir, jf);
                const jsonStr = await fs.readFile(fullPath, 'utf-8');
                const parsed = JSON.parse(jsonStr) as Chapter;
                if (parsed.imagesFolder === folderName) {
                    zip.addFile('chapter.json', Buffer.from(jsonStr));
                    break;
                }
            }
        } catch (e) { console.warn("No chapter.json found to zip"); }

        // Look for common cover file formats
        for (const ext of ['.jpg', '.png', '.webp', '.jpeg']) {
            try {
                zip.addLocalFile(path.join(wsPath, `cover${ext}`));
                break; // only add the first found
            } catch (ex) { }
        }

        zip.writeZip(result.filePath);
        return true;
    } catch (e) {
        console.error("Export Error", e);
        return false;
    }
});

// Helper: given a chapter number string (e.g. "009"), find the matching images folder
async function findImagesFolderByNumber(rootDir: string, numStr: string): Promise<string | undefined> {
    try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        const num = parseInt(numStr, 10);
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            // Match any folder containing this number (e.g. "chapter 009", "Chapter_009", "009")
            const folderNumMatch = ent.name.match(/(\d+)/);
            if (folderNumMatch && parseInt(folderNumMatch[1], 10) === num) {
                return ent.name;
            }
        }
    } catch { }
    return undefined;
}

// List chapter JSON files from the chapters directory
ipcMain.handle('list-chapter-files', async (): Promise<ChapterFileInfo[]> => {
    try {
        const dirs = await getDirectories();
        const files = await fs.readdir(dirs.chaptersDir);
        const chapterFiles = files.filter(f => f.toLowerCase().endsWith('.json')).sort();

        const result: ChapterFileInfo[] = [];
        for (const f of chapterFiles) {
            const fullPath = path.join(dirs.chaptersDir, f);
            let imagesFolder: string | undefined;
            try {
                const jsonStr = await fs.readFile(fullPath, 'utf-8');
                const parsed = JSON.parse(jsonStr) as Chapter;
                imagesFolder = parsed.imagesFolder;

                // Auto-fix: if imagesFolder is missing, infer from filename number
                if (!imagesFolder) {
                    const numMatch = f.match(/chapter.*?(\d+)\.json/i);
                    if (numMatch) {
                        imagesFolder = await findImagesFolderByNumber(dirs.rootDir, numMatch[1]);
                        if (imagesFolder) {
                            // Write it back to the JSON so it's fixed permanently
                            parsed.imagesFolder = imagesFolder;
                            await fs.writeFile(fullPath, JSON.stringify(parsed, null, 2));
                        }
                    }
                }
            } catch (e) {
                // ignore parse errors
            }
            result.push({
                name: imagesFolder || f.replace('.json', ''),
                path: fullPath,
                imagesFolder
            });
        }
        return result;
    } catch (e) {
        console.error('Failed to list chapter files:', e);
        return [];
    }
});

// Load a chapter by its JSON file path (new reader flow)
ipcMain.handle('load-chapter-by-file', async (event, chapterJsonPath: string): Promise<WorkspaceData | null> => {
    try {
        const dirs = await getDirectories();
        const jsonStr = await fs.readFile(chapterJsonPath, 'utf-8');
        const chapterData = JSON.parse(jsonStr) as Chapter;

        // Auto-fix: if imagesFolder is missing, infer from filename
        if (!chapterData.imagesFolder) {
            const basename = path.basename(chapterJsonPath);
            const numMatch = basename.match(/chapter.*?(\d+)\.json/i);
            if (numMatch) {
                const inferred = await findImagesFolderByNumber(dirs.rootDir, numMatch[1]);
                if (inferred) {
                    chapterData.imagesFolder = inferred;
                    // Write it back to fix permanently
                    await fs.writeFile(chapterJsonPath, JSON.stringify(chapterData, null, 2));
                }
            }
        }

        // Resolve the images directory from the chapter's imagesFolder field
        let imagesDir = '';
        if (chapterData.imagesFolder) {
            imagesDir = path.join(dirs.rootDir, chapterData.imagesFolder);
        }

        const images = imagesDir ? await getFiles(imagesDir, ['.jpg', '.jpeg', '.png', '.webp']) : [];
        const audio = await getFiles(dirs.audioDir, ['.mp3', '.wav', '.ogg']);

        return {
            workspacePath: imagesDir || dirs.rootDir,
            images,
            audio,
            chapterData,
            chapterJsonPath
        };
    } catch (e) {
        console.error('Failed to load chapter by file:', e);
        return null;
    }
});

// Save chapter to chapters directory with auto-numbering
ipcMain.handle('save-chapter-to-dir', async (event, data: Chapter, filename?: string): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
        const dirs = await getDirectories();

        let targetPath: string;
        if (filename) {
            targetPath = path.join(dirs.chaptersDir, filename.endsWith('.json') ? filename : `${filename}.json`);
        } else {
            // Check if a file already exists for this imagesFolder
            if (data.imagesFolder) {
                const files = await fs.readdir(dirs.chaptersDir);
                const jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json')).sort();

                let found = false;
                for (const jf of jsonFiles) {
                    const fullPath = path.join(dirs.chaptersDir, jf);
                    const jsonStr = await fs.readFile(fullPath, 'utf-8');
                    const parsed = JSON.parse(jsonStr) as Chapter;
                    if (parsed.imagesFolder === data.imagesFolder) {
                        targetPath = fullPath;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    targetPath = path.join(dirs.chaptersDir, `${data.imagesFolder}.json`);
                }
            } else {
                const nextFilename = await getNextChapterFilename(dirs.chaptersDir);
                targetPath = path.join(dirs.chaptersDir, nextFilename);
            }
        }

        await fs.writeFile(targetPath!, JSON.stringify(data, null, 2));
        return { success: true, path: targetPath! };
    } catch (e: any) {
        console.error('Failed to save chapter to dir:', e);
        return { success: false, error: e.message || 'Unknown error' };
    }
});

// Scan a root directory for image chapter folders
async function scanLibraryDir(rootDir: string, chaptersDir?: string): Promise<({ name: string, path: string, cover?: string })[]> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const chapters: ({ name: string, path: string, cover?: string })[] = [];

    // Pre-calculate which folders have JSON files
    const linkedFolders = new Set<string>();
    if (chaptersDir) {
        try {
            const chapterFiles = await fs.readdir(chaptersDir);
            const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json'));
            for (const jf of jsonFiles) {
                const fullPath = path.join(chaptersDir, jf);
                try {
                    const jsonStr = await fs.readFile(fullPath, 'utf-8');
                    const parsed = JSON.parse(jsonStr) as Chapter;
                    if (parsed.imagesFolder) {
                        linkedFolders.add(parsed.imagesFolder);
                    } else {
                        // Infer from number
                        const numMatch = jf.match(/chapter.*?(\d+)\.json/i);
                        if (numMatch) {
                            const inferred = await findImagesFolderByNumber(rootDir, numMatch[1]);
                            if (inferred) linkedFolders.add(inferred);
                        }
                    }
                } catch { }
            }
        } catch { }
    }

    for (const ent of entries) {
        if (ent.isDirectory()) {
            // Must be linked to a JSON file (if chaptersDir was provided)
            if (chaptersDir && linkedFolders.size > 0 && !linkedFolders.has(ent.name)) {
                continue;
            }

            const chapPath = path.join(rootDir, ent.name);

            // Look for cover image
            let coverUrl = undefined;
            for (const ext of ['.jpg', '.png', '.webp', '.jpeg']) {
                try {
                    await fs.access(path.join(chapPath, `cover${ext}`));
                    coverUrl = `file://${path.join(chapPath, `cover${ext}`).replace(/\\/g, '/')}`;
                    break;
                } catch (ex) { }
            }

            chapters.push({ name: ent.name, path: chapPath, cover: coverUrl });
        }
    }

    // Sort naturally by name
    chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return chapters;
}

ipcMain.handle('select-library', async (event): Promise<({ name: string, path: string, cover?: string })[] | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;

    try {
        let chaptersDir: string | undefined;
        try {
            const dirs = await getDirectories();
            chaptersDir = dirs.chaptersDir;
        } catch { }
        return await scanLibraryDir(result.filePaths[0], chaptersDir);
    } catch (e) {
        return null;
    }
});

// Auto-load library from configured path
ipcMain.handle('load-library', async (event): Promise<({ name: string, path: string, cover?: string })[] | null> => {
    try {
        const dirs = await getDirectories();
        return await scanLibraryDir(dirs.rootDir, dirs.chaptersDir);
    } catch (e) {
        console.error('Failed to load library:', e);
        return null;
    }
});

ipcMain.handle('load-chapter', async (event, wsPath: string): Promise<WorkspaceData | null> => {
    // This is basically the same logic as select-workspace but taking a path
    const imagesDir = wsPath; // Images directly in chapter folder

    let audioDir = "";
    let chaptersDir = "";
    try {
        const dirs = await getDirectories();
        audioDir = dirs.audioDir;
        chaptersDir = dirs.chaptersDir;
    } catch (e) {
        return null;
    }

    const images = await getFiles(imagesDir, ['.jpg', '.jpeg', '.png', '.webp']);
    const audio = await getFiles(audioDir, ['.mp3', '.wav', '.ogg']);

    // Try to find a chapter JSON in the chapters directory for this folder
    const folderName = path.basename(wsPath);
    let chapterData: Chapter | null = null;
    let chapterJsonPath: string | undefined = undefined;

    try {
        const chapterFiles = await fs.readdir(chaptersDir);
        const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json')).sort();

        for (const jf of jsonFiles) {
            const fullPath = path.join(chaptersDir, jf);
            const jsonStr = await fs.readFile(fullPath, 'utf-8');
            const parsed = JSON.parse(jsonStr) as Chapter;
            if (parsed.imagesFolder === folderName) {
                chapterData = parsed;
                chapterJsonPath = fullPath;
                break;
            }
        }
    } catch (e) { }

    // Try to find by number if imagesFolder didn't match (for manually copied JSONs)
    if (!chapterData) {
        const folderNumMatch = folderName.match(/(\d+)/);
        if (folderNumMatch) {
            const folderNum = parseInt(folderNumMatch[1], 10);
            const chapterFiles = await fs.readdir(chaptersDir);
            const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json'));

            for (const jf of jsonFiles) {
                const numMatch = jf.match(/chapter.*?(\d+)\.json/i);
                if (numMatch && parseInt(numMatch[1], 10) === folderNum) {
                    const fullPath = path.join(chaptersDir, jf);
                    const jsonStr = await fs.readFile(fullPath, 'utf-8');
                    const parsed = JSON.parse(jsonStr) as Chapter;

                    // Found a match by number, let's use it and auto-fix the JSON
                    parsed.imagesFolder = folderName;
                    await fs.writeFile(fullPath, JSON.stringify(parsed, null, 2));

                    chapterData = parsed;
                    chapterJsonPath = fullPath;
                    break;
                }
            }
        }
    }

    return { workspacePath: wsPath, images, audio, chapterData, chapterJsonPath };
});

ipcMain.handle('download-audio', async (event, url: string, prefix?: string, exactName: boolean = false, browser?: string): Promise<{ success: boolean, newTrack?: FileData, error?: string }> => {
    try {
        const dirs = await getDirectories();
        const audioDir = dirs.audioDir;
        // Create audio directory if it doesn't exist just in case
        await fs.mkdir(audioDir, { recursive: true });

        const timestamp = Date.now();
        const baseName = prefix ? (exactName ? prefix : `${prefix}_${timestamp}`) : `track_${timestamp}`;

        // Create an absolute path to the output with an initial extension placeholder
        const outputTemplate = path.join(audioDir, `${baseName}.%(ext)s`);

        // Need the final expected mp3 path for renderer
        const finalMp3Path = path.join(audioDir, `${baseName}.mp3`);

        let ytResult;

        const ytDlpPath = path.join(app.getAppPath(), 'node_modules', 'youtube-dl-exec', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp').replace('app.asar', 'app.asar.unpacked');
        const youtubedl = create(ytDlpPath);
        const ffmpegPath = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : undefined;

        const options: any = {
            extractAudio: true,
            audioFormat: 'mp3',
            ffmpegLocation: ffmpegPath,
            output: outputTemplate,
            noWarnings: true
        };
        
        if (browser) {
            options.cookiesFromBrowser = browser;
        }

        try {
            ytResult = await youtubedl(url, options);
        } catch (e: any) {
            console.log("yt-dlp download failed, attempting to update yt-dlp...");
            try {
                // Try updating yt-dlp first
                await youtubedl('', { update: true });
                console.log("yt-dlp updated, retrying download...");
                // Retry the download
                ytResult = await youtubedl(url, options);
            } catch (retryError: any) {
                console.error("Retry failed:", retryError);
                throw retryError; // Let the outer catch handle it
            }
        }

        // Ensure file exists
        await fs.access(finalMp3Path);

        const newTrack: FileData = {
            name: `${baseName}.mp3`,
            path: finalMp3Path,
            url: `file://${finalMp3Path.replace(/\\/g, '/')}`
        };

        return { success: true, newTrack };
    } catch (e: any) {
        console.error("Download audio error", e);
        return { success: false, error: e.message || 'Unknown error' };
    }
});

// Central audio links JSON — stores track name → source URL mappings

ipcMain.handle('load-audio-links', async (): Promise<Record<string, string>> => {
    try {
        const dirs = await getDirectories();
        const audioLinksPath = path.join(dirs.audioDir, 'audio_links.json');
        const jsonStr = await fs.readFile(audioLinksPath, 'utf-8');
        return JSON.parse(jsonStr) as Record<string, string>;
    } catch (e) {
        // File doesn't exist yet or is invalid — return empty
        return {};
    }
});

ipcMain.handle('save-audio-links', async (event, links: Record<string, string>): Promise<boolean> => {
    try {
        const dirs = await getDirectories();
        const audioLinksPath = path.join(dirs.audioDir, 'audio_links.json');
        await fs.writeFile(audioLinksPath, JSON.stringify(links, null, 2));
        return true;
    } catch (e) {
        console.error('Failed to save audio links:', e);
        return false;
    }
});
