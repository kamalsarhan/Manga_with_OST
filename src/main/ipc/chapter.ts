import { ipcMain, dialog, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { getDirectories } from './directories';
import { Chapter } from '../../types/models';
import { FileData, WorkspaceData, ChapterFileInfo } from '../../types/ipc';

export async function getFiles(dir: string, exts: string[]): Promise<FileData[]> {
    try {
        const files = await fs.readdir(dir);
        const validFiles = files.filter(f => exts.includes(path.extname(f).toLowerCase()));

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

export async function getNextChapterFilename(chaptersDir: string): Promise<string> {
    try {
        const files = await fs.readdir(chaptersDir);
        const chapterFiles = files.filter(f => f.toLowerCase().endsWith('.json'));
        if (chapterFiles.length === 0) return 'chapter001.json';

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

export async function findImagesFolderByNumber(rootDir: string, numStr: string): Promise<string | undefined> {
    try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        const num = parseInt(numStr, 10);
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            const folderNumMatch = ent.name.match(/(\d+)/);
            if (folderNumMatch && parseInt(folderNumMatch[1], 10) === num) {
                return ent.name;
            }
        }
    } catch { }
    return undefined;
}

export async function scanLibraryDir(rootDir: string, chaptersDir?: string): Promise<({ name: string, path: string, cover?: string })[]> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const chapters: ({ name: string, path: string, cover?: string })[] = [];

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
            if (chaptersDir && linkedFolders.size > 0 && !linkedFolders.has(ent.name)) {
                continue;
            }

            const chapPath = path.join(rootDir, ent.name);
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

    chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return chapters;
}

export function registerChapterHandlers() {
    ipcMain.handle('migrate-chapter-files', async (): Promise<{ success: boolean; migrated: number; errors: string[] }> => {
        try {
            const dirs = await getDirectories();
            const rootDir = dirs.rootDir;
            const chaptersDir = dirs.chaptersDir;

            await fs.mkdir(chaptersDir, { recursive: true });
            const entries = await fs.readdir(rootDir, { withFileTypes: true });
            let migrated = 0;
            const errors: string[] = [];

            for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                const chapterJsonPath = path.join(rootDir, ent.name, 'chapter.json');
                try { await fs.access(chapterJsonPath); } catch { continue; }

                try {
                    const jsonStr = await fs.readFile(chapterJsonPath, 'utf-8');
                    const chapterData = JSON.parse(jsonStr) as Chapter;
                    chapterData.imagesFolder = ent.name;

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

                    const numMatch = ent.name.match(/(\d+)/);
                    let targetFilename: string;
                    if (numMatch) {
                        const num = parseInt(numMatch[1], 10);
                        targetFilename = `chapter${String(num).padStart(3, '0')}.json`;
                    } else {
                        targetFilename = await getNextChapterFilename(chaptersDir);
                    }

                    const targetPath = path.join(chaptersDir, targetFilename);
                    try {
                        await fs.access(targetPath);
                        targetFilename = await getNextChapterFilename(chaptersDir);
                    } catch { }

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

    ipcMain.handle('select-workspace', async (event): Promise<WorkspaceData | null> => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled || result.filePaths.length === 0) return null;

        const wsPath = result.filePaths[0];
        const imagesDir = wsPath;

        let audioDir = "";
        let chaptersDir = "";
        try {
            const dirs = await getDirectories();
            audioDir = dirs.audioDir;
            chaptersDir = dirs.chaptersDir;
        } catch (e) { return null; }

        const images = await getFiles(imagesDir, ['.jpg', '.jpeg', '.png', '.webp']);
        const audio = await getFiles(audioDir, ['.mp3', '.wav', '.ogg']);

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

        return { workspacePath: wsPath, images, audio, chapterData, chapterJsonPath };
    });

    ipcMain.handle('save-chapter', async (event, wsPath: string, data: Chapter, chapterJsonPath?: string) => {
        try {
            const dirs = await getDirectories();
            const folderName = path.basename(wsPath);
            data.imagesFolder = folderName;

            let targetPath: string | null = chapterJsonPath || null;

            if (!targetPath) {
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
                } catch (e) { }
            }

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
            try { zip.addLocalFolder(path.join(wsPath, 'images'), 'images'); } catch (e) { console.warn("No images folder found to zip"); }

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

            for (const ext of ['.jpg', '.png', '.webp', '.jpeg']) {
                try {
                    zip.addLocalFile(path.join(wsPath, `cover${ext}`));
                    break;
                } catch (ex) { }
            }

            zip.writeZip(result.filePath);
            return true;
        } catch (e) {
            console.error("Export Error", e);
            return false;
        }
    });

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

                    if (!imagesFolder) {
                        const numMatch = f.match(/chapter.*?(\d+)\.json/i);
                        if (numMatch) {
                            imagesFolder = await findImagesFolderByNumber(dirs.rootDir, numMatch[1]);
                            if (imagesFolder) {
                                parsed.imagesFolder = imagesFolder;
                                await fs.writeFile(fullPath, JSON.stringify(parsed, null, 2));
                            }
                        }
                    }
                } catch (e) { }
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

    ipcMain.handle('load-chapter-by-file', async (event, chapterJsonPath: string): Promise<WorkspaceData | null> => {
        try {
            const dirs = await getDirectories();
            const jsonStr = await fs.readFile(chapterJsonPath, 'utf-8');
            const chapterData = JSON.parse(jsonStr) as Chapter;

            if (!chapterData.imagesFolder) {
                const basename = path.basename(chapterJsonPath);
                const numMatch = basename.match(/chapter.*?(\d+)\.json/i);
                if (numMatch) {
                    const inferred = await findImagesFolderByNumber(dirs.rootDir, numMatch[1]);
                    if (inferred) {
                        chapterData.imagesFolder = inferred;
                        await fs.writeFile(chapterJsonPath, JSON.stringify(chapterData, null, 2));
                    }
                }
            }

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

    ipcMain.handle('save-chapter-to-dir', async (event, data: Chapter, filename?: string): Promise<{ success: boolean; path?: string; error?: string }> => {
        try {
            const dirs = await getDirectories();

            let targetPath: string;
            if (filename) {
                targetPath = path.join(dirs.chaptersDir, filename.endsWith('.json') ? filename : `${filename}.json`);
            } else {
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
        const imagesDir = wsPath;

        let audioDir = "";
        let chaptersDir = "";
        try {
            const dirs = await getDirectories();
            audioDir = dirs.audioDir;
            chaptersDir = dirs.chaptersDir;
        } catch (e) { return null; }

        const images = await getFiles(imagesDir, ['.jpg', '.jpeg', '.png', '.webp']);
        const audio = await getFiles(audioDir, ['.mp3', '.wav', '.ogg']);

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
}
