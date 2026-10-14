import { ipcMain, app } from 'electron';
import * as path from 'path';

const MAGIV2_SERVER_URL = 'http://127.0.0.1:5050';
let magiv2Process: import('child_process').ChildProcess | null = null;

export function registerMagiv2Handlers() {
    ipcMain.handle('check-magiv2-status', async (): Promise<boolean> => {
        try {
            const http = await import('http');
            return new Promise((resolve) => {
                const req = http.get(`${MAGIV2_SERVER_URL}/health`, { timeout: 3000 }, (res) => {
                    let data = '';
                    res.on('data', (chunk: string) => data += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            resolve(parsed.status === 'ok');
                        } catch {
                            resolve(false);
                        }
                    });
                });
                req.on('error', () => resolve(false));
                req.on('timeout', () => { req.destroy(); resolve(false); });
            });
        } catch {
            return false;
        }
    });

    ipcMain.handle('start-magiv2-server', async (): Promise<{ success: boolean; error?: string }> => {
        try {
            const http = await import('http');
            const isRunning = await new Promise<boolean>((resolve) => {
                const req = http.get(`${MAGIV2_SERVER_URL}/health`, { timeout: 2000 }, (res) => {
                    let data = '';
                    res.on('data', (chunk: string) => data += chunk);
                    res.on('end', () => resolve(true));
                });
                req.on('error', () => resolve(false));
                req.on('timeout', () => { req.destroy(); resolve(false); });
            });

            if (isRunning) {
                return { success: true };
            }

            const serverScript = path.join(app.getAppPath(), 'magiv2', 'server.py')
                .replace('app.asar', 'app.asar.unpacked');

            const devServerScript = path.join(__dirname, '..', '..', '..', 'magiv2', 'server.py');
            const scriptPath = require('fs').existsSync(serverScript) ? serverScript : devServerScript;

            if (!require('fs').existsSync(scriptPath)) {
                return { success: false, error: `Server script not found at ${scriptPath}` };
            }

            const { spawn } = require('child_process');
            const childProc = spawn('python', [scriptPath], {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env }
            });
            magiv2Process = childProc;

            if (childProc.stdout) {
                childProc.stdout.on('data', (data: Buffer) => {
                    console.log(`[MagiV2] ${data.toString().trim()}`);
                });
            }
            if (childProc.stderr) {
                childProc.stderr.on('data', (data: Buffer) => {
                    console.error(`[MagiV2 ERR] ${data.toString().trim()}`);
                });
            }

            childProc.on('exit', (code: number | null) => {
                console.log(`[MagiV2] Server process exited with code ${code}`);
                magiv2Process = null;
            });

            const maxWait = 300000;
            const pollInterval = 1000;
            let waited = 0;

            while (waited < maxWait) {
                await new Promise(r => setTimeout(r, pollInterval));
                waited += pollInterval;

                const ready = await new Promise<boolean>((resolve) => {
                    const req = http.get(`${MAGIV2_SERVER_URL}/health`, { timeout: 2000 }, (res) => {
                        let data = '';
                        res.on('data', (chunk: string) => data += chunk);
                        res.on('end', () => resolve(true));
                    });
                    req.on('error', () => resolve(false));
                    req.on('timeout', () => { req.destroy(); resolve(false); });
                });

                if (ready) {
                    console.log('[MagiV2] Server is ready!');
                    return { success: true };
                }
            }

            return { success: false, error: 'Server started but did not become ready within 5 minutes. Check if python downloaded the model correctly.' };
        } catch (e: any) {
            console.error('Failed to start MagiV2 server:', e);
            return { success: false, error: e.message || 'Unknown error' };
        }
    });

    ipcMain.handle('detect-regions', async (event, imagePath: string): Promise<{ success: boolean; panels?: { x: number; y: number; w: number; h: number }[]; error?: string }> => {
        try {
            const http = await import('http');
            const postData = JSON.stringify({ image_path: imagePath });

            return new Promise((resolve) => {
                const req = http.request(`${MAGIV2_SERVER_URL}/detect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 120000
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk: string) => data += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.success) {
                                resolve({ success: true, panels: parsed.panels });
                            } else {
                                resolve({ success: false, error: parsed.error || 'Detection failed' });
                            }
                        } catch (e) {
                            resolve({ success: false, error: 'Invalid response from MagiV2 server' });
                        }
                    });
                });

                req.on('error', (e: Error) => {
                    resolve({ success: false, error: `Cannot connect to MagiV2 server: ${e.message}` });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ success: false, error: 'Detection timed out (model may still be loading)' });
                });

                req.write(postData);
                req.end();
            });
        } catch (e: any) {
            return { success: false, error: e.message || 'Unknown error' };
        }
    });

    app.on('before-quit', () => {
        if (magiv2Process) {
            try {
                magiv2Process.kill();
            } catch { }
        }
    });
}
