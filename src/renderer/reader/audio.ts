import { state, TrackWrapper } from './state';
import { renderHome, updateChapterList } from './library';
import { startModeB, startModeA } from './engine';

export class HtmlAudioTrack implements TrackWrapper {
    private _baseVolume = 1;
    constructor(public element: HTMLAudioElement, public trackId: string) { }
    get volume() { return this._baseVolume; }
    set volume(v: number) { 
        this._baseVolume = v;
        this.element.volume = v * state.globalAudioVolume; 
    }
    pause() { this.element.pause(); }
    play() { this.element.play().catch(e => console.log(e)); }
    updateGlobalVolume() {
        this.element.volume = this._baseVolume * state.globalAudioVolume;
    }
}

export function getMissingAudioTracks(): { id: string, url: string }[] {
    if (!state.currentChapterData || !state.currentChapterData.chapterData) {
        return [];
    }

    const usedTrackIds = new Set<string>();
    for (const span of state.currentChapterData.chapterData.audioSpans) {
        if (span.trackId && span.trackId !== 'silence') {
            usedTrackIds.add(span.trackId);
        }
    }

    const localAudioNames = state.currentChapterData.audio.map(a => a.name);
    const missing: { id: string, url: string }[] = [];

    for (const trackId of usedTrackIds) {
        if (!localAudioNames.includes(`${trackId}.mp3`) && !localAudioNames.includes(trackId)) {
            const url = state.centralAudioLinks[trackId] || state.centralAudioLinks[`${trackId}.mp3`];
            if (url) {
                missing.push({ id: trackId, url });
            } else {
                console.warn(`Track "${trackId}" is used in audioSpans but has no local file and no download URL in audio_links.json`);
            }
        }
    }

    return missing;
}

export function showAudioSetupMode(container: HTMLElement, missingTracks: { id: string, url: string }[], chapterPath: string) {
    container.innerHTML = `
    <div style="background: #111; color: white; height: 100vh; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h2 style="font-family: var(--font-display); font-size: 2.5rem; color: #e50914; margin-bottom: 10px;">Missing Audio Elements</h2>
        <p style="font-size: 1.2rem; margin-bottom: 30px; text-align: center; max-width: 600px; color: #ccc;">
            This chapter requires additional audio tracks to deliver the full cinematic experience. 
            They must be downloaded locally from their provided sources.
        </p>
        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; width: 80%; max-width: 800px; max-height: 40vh; overflow-y: auto; margin-bottom: 30px; border: 1px solid rgba(255,255,255,0.1);">
            ${missingTracks.map(t => `
                <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-weight: bold; font-size: 1.1rem; color: #fff;">🎵 ${t.id}</span>
                    <span style="color: #888; font-family: monospace; font-size: 0.9em; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 60%;" title="${t.url}">${t.url}</span>
                </div>
            `).join('')}
        </div>
        
        <div style="margin-bottom: 20px;">
             <label style="color: #ccc; margin-right: 10px;">Browser Cookies (Bot Bypass):</label>
             <select id="reader-dl-browser" style="background: #222; color: #fff; border: 1px solid #555; padding: 5px; border-radius: 4px;">
               <option value="">No Cookies (Default)</option>
               <option value="chrome">Chrome</option>
               <option value="edge">Edge</option>
               <option value="firefox">Firefox</option>
               <option value="brave">Brave</option>
               <option value="opera">Opera</option>
               <option value="safari">Safari</option>
               <option value="vivaldi">Vivaldi</option>
             </select>
        </div>
        
        <div style="display: flex; gap: 20px;">
            <button id="btn-cancel-setup" style="background: transparent; color: white; border: 1px solid rgba(255,255,255,0.2); padding: 12px 24px; border-radius: 8px; font-size: 1rem; cursor: pointer;">Cancel</button>
            <button id="btn-dl-all-setup" class="primary" style="padding: 12px 36px; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer;">Download ${missingTracks.length} Missing Audio Tracks</button>
        </div>
        <button id="btn-skip-setup" style="margin-top: 16px; background: transparent; color: rgba(255,255,255,0.4); border: none; font-size: 0.9rem; cursor: pointer; text-decoration: underline; padding: 4px 8px;">Skip & Read Anyway (missing audio will be silent)</button>
        <div id="setup-progress" style="margin-top: 25px; font-size: 1.1rem; color: var(--accent-color); font-weight: 500;"></div>
    </div>
    `;

    const savedBrowser = localStorage.getItem('yt-dlp-browser') || '';
    const browserSelect = document.getElementById('reader-dl-browser') as HTMLSelectElement;
    if (browserSelect) browserSelect.value = savedBrowser;

    // Shared helper: reload chapter data and launch the reader
    const launchReader = async () => {
        document.body.style.cursor = 'wait';
        if (chapterPath.endsWith('.json')) {
            state.currentChapterData = await window.electronAPI.loadChapterByFile(chapterPath);
        } else {
            state.currentChapterData = await window.electronAPI.loadChapter(chapterPath);
        }
        state.centralAudioLinks = await window.electronAPI.loadAudioLinks();
        document.body.style.cursor = 'default';

        if (state.currentChapterData) {
            if (state.currentChapterData.chapterData && state.currentChapterData.chapterData.regions.length > 0) {
                startModeB(container);
            } else {
                startModeA(container);
            }
        } else {
            renderHome(container);
            updateChapterList(container);
        }
    };

    document.getElementById('btn-cancel-setup')?.addEventListener('click', () => {
        renderHome(container);
        updateChapterList(container);
    });

    // Skip button: launch reader immediately without downloading
    document.getElementById('btn-skip-setup')?.addEventListener('click', () => {
        launchReader();
    });

    document.getElementById('btn-dl-all-setup')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-dl-all-setup') as HTMLButtonElement;
        const skipBtn = document.getElementById('btn-skip-setup') as HTMLButtonElement | null;
        const progress = document.getElementById('setup-progress');
        if (!progress) return;

        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'wait';
        if (skipBtn) { skipBtn.style.display = 'none'; }

        const browser = (document.getElementById('reader-dl-browser') as HTMLSelectElement).value;
        if (browser) localStorage.setItem('yt-dlp-browser', browser);
        else localStorage.removeItem('yt-dlp-browser');

        const totalBatch = missingTracks.length;
        let successCount = 0;
        const failedTracks: { id: string, url: string }[] = [];
        const successfulTracks: { id: string, url: string }[] = [];

        for (let i = 0; i < missingTracks.length; i++) {
            const t = missingTracks[i];
            progress.textContent = `Downloading ${i + 1} of ${missingTracks.length}: ${t.id}...`;
            try {
                const res = await window.electronAPI.downloadAudio(t.url, t.id, true, browser || undefined);
                if (res.success) {
                    successCount++;
                    successfulTracks.push(t);
                } else {
                    console.error('Failed to download', t.id, res.error);
                    failedTracks.push(t);
                }
            } catch (e) {
                console.error('Error downloading', t.id, e);
                failedTracks.push(t);
            }
        }

        // Save audio links for tracks that succeeded in this batch
        for (const t of successfulTracks) {
            state.centralAudioLinks[t.id] = t.url;
        }
        if (successfulTracks.length > 0) {
            await window.electronAPI.saveAudioLinks(state.centralAudioLinks);
        }

        // Shrink missingTracks to only the ones that still failed,
        // so "Retry" and "Skip" only target the errored audio.
        missingTracks.length = 0;
        for (const ft of failedTracks) missingTracks.push(ft);

        const hasErrors = failedTracks.length > 0;

        if (hasErrors) {
            progress.innerHTML = `Completed with errors. ${successCount}/${totalBatch} downloaded. Check console or try again.<br><span style="color: rgba(255,255,255,0.5); font-size: 0.9em;">${failedTracks.length} track(s) could not be downloaded (e.g. DRM-protected links). They will be silent in the reader.</span>`;
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.textContent = `Retry ${failedTracks.length} Failed Track(s)`;

            // Show a prominent "Skip & Begin Chapter" button after failure
            const existingSkip = document.getElementById('btn-skip-after-error');
            if (!existingSkip) {
                const skipAfterError = document.createElement('button');
                skipAfterError.id = 'btn-skip-after-error';
                skipAfterError.textContent = '▶  Skip & Begin Chapter';
                skipAfterError.style.cssText = [
                    'margin-top: 18px',
                    'background: linear-gradient(135deg, #e50914 0%, #b0060f 100%)',
                    'color: #fff',
                    'border: none',
                    'padding: 14px 40px',
                    'border-radius: 10px',
                    'font-size: 1.1rem',
                    'cursor: pointer',
                    'font-weight: 700',
                    'letter-spacing: 0.03em',
                    'box-shadow: 0 4px 20px rgba(229,9,20,0.45)',
                    'transition: opacity 0.2s',
                ].join(';');
                skipAfterError.addEventListener('mouseenter', () => { skipAfterError.style.opacity = '0.85'; });
                skipAfterError.addEventListener('mouseleave', () => { skipAfterError.style.opacity = '1'; });
                skipAfterError.addEventListener('click', () => launchReader());
                progress.after(skipAfterError);
            }
            return;
        }

        progress.textContent = `Download complete! ${successCount}/${totalBatch} tracks downloaded successfully.`;

        setTimeout(() => launchReader(), 1500);
    });
}
