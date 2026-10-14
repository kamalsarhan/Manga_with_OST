/**
 * Built-in Express HTTP server for serving manga chapters online.
 * Runs inside the Electron main process.
 */

import express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { getDirectories } from './ipc/directories';
import { scanLibraryDir, getFiles } from './ipc/chapter';
import { Chapter } from '../types/models';
import { generateWebReaderHtml } from './webReader';

let app: express.Express | null = null;
let server: http.Server | null = null;
let ngrokUrl: string | null = null;
let activeConnections = 0;
let tunnelProcess: any = null;

export interface ServerStatus {
    running: boolean;
    port: number;
    localUrl: string;
    publicUrl: string | null;
    connections: number;
}

function getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

/**
 * Validates that a requested file path stays within the allowed directory.
 * Prevents path traversal attacks.
 */
function isPathSafe(basePath: string, requestedPath: string): boolean {
    const resolved = path.resolve(basePath, requestedPath);
    return resolved.startsWith(path.resolve(basePath));
}

export async function startServer(port: number = 3000): Promise<ServerStatus> {
    if (server) {
        return getServerStatus();
    }

    const expressApp = express();
    app = expressApp;

    // Track active connections
    expressApp.use((req, res, next) => {
        activeConnections++;
        res.on('finish', () => {
            activeConnections = Math.max(0, activeConnections - 1);
        });
        next();
    });

    // CORS headers for broad compatibility
    expressApp.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });

    // ─── Web Reader Page ─────────────────────────────────────────────────
    expressApp.get('/', (req, res) => {
        res.type('html').send(generateWebReaderHtml());
    });

    // ─── API: Library listing ────────────────────────────────────────────
    expressApp.get('/api/library', async (req, res) => {
        try {
            const dirs = await getDirectories();
            const chapters = await scanLibraryDir(dirs.rootDir, dirs.chaptersDir);
            // Return chapter info with web-friendly URLs
            const result = chapters.map(ch => ({
                name: ch.name,
                folder: path.basename(ch.path),
                hasCover: !!ch.cover
            }));
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'Failed to load library' });
        }
    });

    // ─── API: Chapter data ───────────────────────────────────────────────
    expressApp.get('/api/chapter/:folderName', async (req, res) => {
        try {
            const dirs = await getDirectories();
            const folderName = req.params.folderName;

            // Find the chapter JSON that references this folder
            let chapterData: Chapter | null = null;
            try {
                const chapterFiles = await fs.readdir(dirs.chaptersDir);
                const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json')).sort();

                for (const jf of jsonFiles) {
                    const fullPath = path.join(dirs.chaptersDir, jf);
                    const jsonStr = await fs.readFile(fullPath, 'utf-8');
                    const parsed = JSON.parse(jsonStr) as Chapter;
                    if (parsed.imagesFolder === folderName) {
                        chapterData = parsed;
                        break;
                    }
                }
            } catch { }

            // Fallback: try matching by number
            if (!chapterData) {
                const numMatch = folderName.match(/(\d+)/);
                if (numMatch) {
                    const folderNum = parseInt(numMatch[1], 10);
                    try {
                        const chapterFiles = await fs.readdir(dirs.chaptersDir);
                        const jsonFiles = chapterFiles.filter(f => f.toLowerCase().endsWith('.json'));
                        for (const jf of jsonFiles) {
                            const jfNumMatch = jf.match(/chapter.*?(\d+)\.json/i);
                            if (jfNumMatch && parseInt(jfNumMatch[1], 10) === folderNum) {
                                const fullPath = path.join(dirs.chaptersDir, jf);
                                const jsonStr = await fs.readFile(fullPath, 'utf-8');
                                chapterData = JSON.parse(jsonStr) as Chapter;
                                break;
                            }
                        }
                    } catch { }
                }
            }

            // Load audio links
            let audioLinks: Record<string, string> = {};
            try {
                const audioLinksPath = path.join(dirs.audioDir, 'audio_links.json');
                const linksStr = await fs.readFile(audioLinksPath, 'utf-8');
                audioLinks = JSON.parse(linksStr);
            } catch { }

            // Get image list
            const imagesDir = path.join(dirs.rootDir, folderName);
            const images = await getFiles(imagesDir, ['.jpg', '.jpeg', '.png', '.webp']);
            const imageNames = images.map(img => img.name);

            // Get audio file list
            const audioFiles = await getFiles(dirs.audioDir, ['.mp3', '.wav', '.ogg']);
            const audioNames = audioFiles.map(a => a.name);

            res.json({
                chapter: chapterData,
                images: imageNames,
                audioFiles: audioNames,
                audioLinks: audioLinks,
                folder: folderName
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'Failed to load chapter' });
        }
    });

    // ─── API: Serve manga images ─────────────────────────────────────────
    expressApp.get('/api/images/:folderName/:filename', async (req, res) => {
        try {
            const dirs = await getDirectories();
            const { folderName, filename } = req.params;

            if (!isPathSafe(dirs.rootDir, path.join(folderName, filename))) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const filePath = path.join(dirs.rootDir, folderName, filename);
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({ error: 'Image not found' });
            }

            res.sendFile(filePath);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── API: Serve audio files ──────────────────────────────────────────
    expressApp.get('/api/audio/:filename', async (req, res) => {
        try {
            const dirs = await getDirectories();
            const { filename } = req.params;

            if (!isPathSafe(dirs.audioDir, filename)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const filePath = path.join(dirs.audioDir, filename);
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({ error: 'Audio file not found' });
            }

            res.sendFile(filePath);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── API: Serve cover images ─────────────────────────────────────────
    expressApp.get('/api/covers/:folderName', async (req, res) => {
        try {
            const dirs = await getDirectories();
            const { folderName } = req.params;

            if (!isPathSafe(dirs.rootDir, folderName)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const chapPath = path.join(dirs.rootDir, folderName);
            for (const ext of ['.jpg', '.png', '.webp', '.jpeg']) {
                const coverPath = path.join(chapPath, `cover${ext}`);
                try {
                    await fs.access(coverPath);
                    return res.sendFile(coverPath);
                } catch { }
            }

            // No cover found – return first image as fallback
            const images = await getFiles(chapPath, ['.jpg', '.jpeg', '.png', '.webp']);
            if (images.length > 0) {
                return res.sendFile(path.join(chapPath, images[0].name));
            }

            res.status(404).json({ error: 'No cover image found' });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Start listening ─────────────────────────────────────────────────
    return new Promise<ServerStatus>((resolve, reject) => {
        try {
            server = expressApp.listen(port, '0.0.0.0', () => {
                console.log(`[Server] Manga server started on port ${port}`);
                console.log(`[Server] Local: http://localhost:${port}`);
                console.log(`[Server] Network: http://${getLocalIp()}:${port}`);
                resolve(getServerStatus());
            });

            server.on('error', (err: any) => {
                console.error('[Server] Failed to start:', err);
                server = null;
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

export async function stopServer(): Promise<void> {
    if (ngrokUrl) {
        await stopNgrok();
    }

    if (server) {
        return new Promise((resolve) => {
            server!.close(() => {
                console.log('[Server] Server stopped');
                server = null;
                app = null;
                activeConnections = 0;
                resolve();
            });
        });
    }
}

export async function startNgrok(port: number = 3000): Promise<string> {
    try {
        const { spawn } = require('child_process');
        return new Promise<string>((resolve, reject) => {
            const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            tunnelProcess = spawn(cmd, ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${port}`]);
            
            let resolved = false;

            tunnelProcess.stderr.on('data', (data: any) => {
                const output = data.toString();
                // Cloudflare prints the trycloudflare.com URL to stderr
                const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (match && !resolved) {
                    resolved = true;
                    ngrokUrl = match[0];
                    console.log(`[Server] Cloudflare tunnel: ${ngrokUrl}`);
                    resolve(ngrokUrl!);
                }
            });

            tunnelProcess.on('error', (err: any) => {
                if (!resolved) {
                    reject(err);
                }
                console.error('[Server] Cloudflare tunnel error:', err);
            });
            
            tunnelProcess.on('close', (code: number) => {
                if (!resolved) {
                    reject(new Error(`Cloudflare tunnel exited with code ${code}`));
                }
                ngrokUrl = null;
                console.log('[Server] Cloudflare tunnel closed');
            });
        });
    } catch (err: any) {
        console.error('[Server] Tunnel failed:', err);
        throw new Error(`Failed to start Cloudflare tunnel: ${err.message || err}`);
    }
}

export async function stopNgrok(): Promise<void> {
    try {
        if (tunnelProcess) {
            tunnelProcess.kill();
            tunnelProcess = null;
        }
        ngrokUrl = null;
        console.log('[Server] Cloudflare tunnel closed');
    } catch (err) {
        console.error('[Server] Error stopping Cloudflare tunnel:', err);
        ngrokUrl = null;
    }
}

export function getServerStatus(): ServerStatus {
    const port = server ? (server.address() as any)?.port || 3000 : 3000;
    return {
        running: !!server,
        port,
        localUrl: server ? `http://${getLocalIp()}:${port}` : '',
        publicUrl: ngrokUrl,
        connections: activeConnections
    };
}
