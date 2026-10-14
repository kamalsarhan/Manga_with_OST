import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { create } from 'youtube-dl-exec';
import ffmpegStatic from 'ffmpeg-static';
import { getDirectories } from './directories';
import { FileData } from '../../types/ipc';

export function registerAudioHandlers() {
    ipcMain.handle('download-audio', async (event, url: string, prefix?: string, exactName: boolean = false, browser?: string): Promise<{ success: boolean, newTrack?: FileData, error?: string }> => {
        try {
            const dirs = await getDirectories();
            const audioDir = dirs.audioDir;
            await fs.mkdir(audioDir, { recursive: true });

            const timestamp = Date.now();
            const baseName = prefix ? (exactName ? prefix : `${prefix}_${timestamp}`) : `track_${timestamp}`;
            const outputTemplate = path.join(audioDir, `${baseName}.%(ext)s`);
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
                    await youtubedl('', { update: true });
                    console.log("yt-dlp updated, retrying download...");
                    ytResult = await youtubedl(url, options);
                } catch (retryError: any) {
                    console.error("Retry failed:", retryError);
                    throw retryError;
                }
            }

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

    ipcMain.handle('load-audio-links', async (): Promise<Record<string, string>> => {
        try {
            const dirs = await getDirectories();
            const audioLinksPath = path.join(dirs.audioDir, 'audio_links.json');
            const jsonStr = await fs.readFile(audioLinksPath, 'utf-8');
            return JSON.parse(jsonStr) as Record<string, string>;
        } catch (e) {
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
}
