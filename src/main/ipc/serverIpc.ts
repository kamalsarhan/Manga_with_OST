/**
 * IPC handlers for server management.
 * Bridges the Electron renderer (server dashboard) with the Express server.
 */

import { ipcMain } from 'electron';
import { startServer, stopServer, getServerStatus, startNgrok, stopNgrok } from '../server';

export function registerServerHandlers() {
    ipcMain.handle('start-server', async (event, port?: number) => {
        try {
            const status = await startServer(port || 3000);
            return { success: true, status };
        } catch (err: any) {
            return { success: false, error: err.message || 'Failed to start server' };
        }
    });

    ipcMain.handle('stop-server', async () => {
        try {
            await stopServer();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || 'Failed to stop server' };
        }
    });

    ipcMain.handle('get-server-status', async () => {
        return getServerStatus();
    });

    ipcMain.handle('start-ngrok', async (event, port?: number) => {
        try {
            const url = await startNgrok(port || 3000);
            return { success: true, url };
        } catch (err: any) {
            return { success: false, error: err.message || 'Failed to start ngrok' };
        }
    });

    ipcMain.handle('stop-ngrok', async () => {
        try {
            await stopNgrok();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || 'Failed to stop ngrok' };
        }
    });
}
