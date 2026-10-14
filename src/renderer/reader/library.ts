import { state } from './state';
import { renderSetup } from './setup';
import { teardownReaderInteractions } from './viewer';
import { getMissingAudioTracks, showAudioSetupMode } from './audio';
import { startModeB, startModeA } from './engine';

export function renderHome(container: HTMLElement) {
    teardownReaderInteractions();
    container.style.cursor = 'default';
    container.className = '';
    container.innerHTML = `
  <div style="background: var(--bg-color); color: white; height: 100vh; width: 100%; position: relative; overflow: hidden;">
    <div style="position: absolute; top: -20%; left: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, rgba(229,9,20,0.1) 0%, transparent 70%); border-radius: 50%; pointer-events: none;"></div>
    <div style="position: absolute; bottom: -20%; right: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, rgba(0,200,255,0.05) 0%, transparent 70%); border-radius: 50%; pointer-events: none;"></div>
    <div style="height: 100%; width: 100%; overflow-y: auto; display: flex; flex-direction: column; align-items: center; padding: 60px 20px; box-sizing: border-box; z-index: 1; position: relative;">
        <h1 style="font-size: 3.5rem; margin-bottom: 8px; font-family: var(--font-display); font-weight: 700; letter-spacing: -1px; text-shadow: 0 4px 20px rgba(0,0,0,0.5);">Cinematic Library</h1>
        <p id="library-path-label" style="font-size: 0.85rem; color: rgba(255,255,255,0.35); margin: 0 0 24px 0; font-family: monospace; letter-spacing: 0.5px;"></p>
        <div id="library-status" style="display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 20px;">
            <div style="width: 36px; height: 36px; border: 3px solid rgba(229,9,20,0.3); border-top-color: #e50914; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <span style="color: rgba(255,255,255,0.5); font-size: 0.95rem;">Loading library…</span>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        <div id="chapter-list" style="display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; max-width: 1200px; padding: 20px;"></div>
        <div style="display: flex; gap: 16px; margin-top: 50px;">
            <button id="btn-back" style="background: transparent; border-color: rgba(255,255,255,0.2); font-size: 1rem; padding: 12px 24px; border-radius: 4px; cursor: pointer;">Back to Main Menu</button>
            <button id="btn-reset-dirs" style="background: rgba(229,9,20,0.1); border: 1px solid #e50914; color: #e50914; font-size: 1rem; padding: 12px 24px; border-radius: 4px; cursor: pointer;">Reset Storage Locations</button>
        </div>
    </div>
  </div>
`;

    document.getElementById('btn-back')?.addEventListener('click', () => window.location.reload());
    document.getElementById('btn-reset-dirs')?.addEventListener('click', async () => {
        const confirmed = confirm("Are you sure you want to reset the storage directories? You will be prompted to select them again.");
        if (confirmed) {
            await window.electronAPI.resetDirectories();
            renderSetup(container);
        }
    });

    autoLoadLibrary(container);
}

async function autoLoadLibrary(container: HTMLElement) {
    const statusEl = document.getElementById('library-status');
    try {
        const result = await window.electronAPI.loadLibrary();
        state.chapters = result || [];

        if (statusEl) statusEl.style.display = 'none';

        if (state.chapters.length > 0) {
            updateChapterList(container);
        } else {
            const list = document.getElementById('chapter-list');
            if (list) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <span style="color: rgba(255,255,255,0.4); font-size: 2rem;">📂</span>
                        <p style="color: rgba(255,255,255,0.5); font-size: 1rem; margin-top: 12px;">No image folders found.<br>Make sure your images directory contains chapter subfolders.</p>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error('Failed to auto-load library:', err);
        if (statusEl) {
            statusEl.innerHTML = `
                <span style="color: #e50914; font-size: 1.1rem;">⚠️</span>
                <span style="color: rgba(255,255,255,0.5); font-size: 0.95rem;">Failed to load library. Check if paths exist.</span>
            `;
        }
    }
}

export function updateChapterList(container: HTMLElement) {
    const list = document.getElementById('chapter-list');
    if (!list) return;

    if (state.chapters.length === 0) {
        list.innerHTML = `<p style="color: #666;">No chapters found in selected folder.</p>`;
        return;
    }

    list.innerHTML = state.chapters.map((ch, idx) => {
        const bg = ch.cover ? `url('${ch.cover}') center/cover no-repeat` : '#222';
        return `
  <div class="chapter-card" data-idx="${idx}" style="background: ${bg}; position: relative; padding: 0; border-radius: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); width: 220px; height: 330px; text-align: center; transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div class="chapter-overlay" style="position: absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%); opacity: 0.8; transition: opacity 0.3s;"></div>
    <div style="position: absolute; bottom: 0; width: 100%; padding: 25px 20px; box-sizing: border-box; transform: translateY(0); transition: transform 0.3s;">
       <h3 style="margin: 0; font-size: 1.3rem; font-family: var(--font-display); font-weight: 600; text-shadow: 0 2px 10px rgba(0,0,0,0.8); color: white; letter-spacing: 0;">${ch.name}</h3>
    </div>
  </div>
`}).join('');

    document.querySelectorAll('.chapter-card').forEach(card => {
        card.addEventListener('mouseover', (e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.borderColor = 'var(--accent-color)';
            target.style.transform = 'translateY(-8px) scale(1.02)';
            target.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(229,9,20,0.3)';
            (target.querySelector('.chapter-overlay') as HTMLElement).style.opacity = '1';
        });
        card.addEventListener('mouseout', (e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.borderColor = 'rgba(255,255,255,0.1)';
            target.style.transform = 'translateY(0) scale(1)';
            target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            (target.querySelector('.chapter-overlay') as HTMLElement).style.opacity = '0.8';
        });
        card.addEventListener('click', async (e) => {
            const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-idx') || '0');
            const chapter = state.chapters[idx];

            document.body.style.cursor = 'wait';
            state.currentChapterData = await window.electronAPI.loadChapter(chapter.path);
            state.centralAudioLinks = await window.electronAPI.loadAudioLinks();
            document.body.style.cursor = 'default';

            if (state.currentChapterData) {
                const missingTracks = getMissingAudioTracks();
                if (missingTracks.length > 0) {
                    showAudioSetupMode(container, missingTracks, chapter.path);
                } else {
                    if (state.currentChapterData.chapterData && state.currentChapterData.chapterData.regions.length > 0) {
                        startModeB(container);
                    } else {
                        startModeA(container);
                    }
                }
            } else {
                alert("Failed to load chapter data.");
            }
        });
    });
}
