import { LibraryChapter, WorkspaceData } from '../types/ipc';
import { Region } from '../types/models';

declare global {
    interface Window {
        electronAPI: import('../types/ipc').ElectronAPI;
    }
}

export function initReader(container: HTMLElement) {
    let chapters: LibraryChapter[] = [];
    let currentChapterData: WorkspaceData | null = null;
    let centralAudioLinks: Record<string, string> = {};

    // -- State for Modes --
    let currentImageIndex = 0;
    // Mode B State
    let currentRegionIndex = 0;
    let sortedRegions: Region[] = [];

    // Abstracting audio tracks for reader
    interface TrackWrapper {
        trackId: string;
        get volume(): number;
        set volume(v: number);
        pause(): void;
        play(): void;
        updateGlobalVolume(): void;
    }

    let globalAudioVolume = 1;

    class HtmlAudioTrack implements TrackWrapper {
        private _baseVolume = 1;
        constructor(public element: HTMLAudioElement, public trackId: string) { }
        get volume() { return this._baseVolume; }
        set volume(v: number) {
            this._baseVolume = v;
            this.element.volume = v * globalAudioVolume;
        }
        pause() { this.element.pause(); }
        play() { this.element.play().catch(e => console.log(e)); }
        updateGlobalVolume() {
            this.element.volume = this._baseVolume * globalAudioVolume;
        }
    }

    let activeAudioTrack: TrackWrapper | null = null;

    let bState: 'PLAYING' | 'WAIT_INPUT' | 'IDLE' = 'IDLE';
    const READER_ZOOM_MAX = 4.0;
    const READER_ZOOM_STEP_FACTOR = 1.15;
    const READER_DRAG_THRESHOLD = 6;
    let readerZoom = 1;
    let readerFitZoom = 1;
    let readerPanX = 0;
    let readerPanY = 0;
    let readerIsPanning = false;
    let readerPointerStartX = 0;
    let readerPointerStartY = 0;
    let readerPanStartX = 0;
    let readerPanStartY = 0;
    let readerDidDrag = false;
    let readerSuppressNextClick = false;
    let readerHideTimer: ReturnType<typeof setTimeout> | null = null;
    let detachReaderEvents: (() => void) | null = null;

    // Check if directories are configured, show setup if not
    checkAndRender();

    async function checkAndRender() {
        const config = await window.electronAPI.getDirectoryConfig();
        if (config) {
            renderHome();
        } else {
            renderSetup();
        }
    }

    function renderSetup() {
        teardownReaderInteractions();
        container.style.cursor = 'default';
        container.className = '';

        let selectedRoot = '';
        let selectedAudio = '';
        let selectedChapters = '';

        container.innerHTML = `
      <div style="background: var(--bg-color); color: white; height: 100vh; width: 100%; position: relative; overflow: hidden;">
        <div style="position: absolute; top: -20%; left: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, rgba(229,9,20,0.1) 0%, transparent 70%); border-radius: 50%; pointer-events: none;"></div>
        <div style="position: absolute; bottom: -20%; right: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, rgba(0,200,255,0.05) 0%, transparent 70%); border-radius: 50%; pointer-events: none;"></div>
        <div style="height: 100%; width: 100%; overflow-y: auto; display: flex; flex-direction: column; align-items: center; padding: 60px 20px; box-sizing: border-box; z-index: 1; position: relative;">
            <h1 style="font-size: 3rem; margin-bottom: 6px; font-family: var(--font-display); font-weight: 700; letter-spacing: -1px; text-shadow: 0 4px 20px rgba(0,0,0,0.5);">Setup Directories</h1>
            <p style="font-size: 0.95rem; color: rgba(255,255,255,0.4); margin: 0 0 40px 0; max-width: 500px; text-align: center;">Select where your manga images, audio files, and chapter JSON files are stored.</p>

            <div style="display: flex; flex-direction: column; gap: 18px; width: 100%; max-width: 600px;">
              ${['images', 'audio', 'chapters'].map((type, i) => {
            const icons = ['🖼️', '🎵', '📄'];
            const labels = ['Manga Images Folder', 'Audio Files Folder', 'Chapter JSON Folder'];
            const descs = ['Root folder containing chapter image subfolders', 'Folder with downloaded audio tracks (.mp3)', 'Folder to store chapterXXX.json files'];
            return `
              <div id="setup-row-${type}" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px 24px; display: flex; align-items: center; gap: 16px; transition: all 0.3s;">
                <div style="font-size: 1.8rem; width: 44px; text-align: center;">${icons[i]}</div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 3px;">${labels[i]}</div>
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.35);">${descs[i]}</div>
                  <div id="setup-path-${type}" style="font-size: 0.8rem; color: #e50914; margin-top: 4px; font-family: monospace; word-break: break-all;"></div>
                </div>
                <button id="btn-pick-${type}" style="background: rgba(229,9,20,0.15); border: 1px solid rgba(229,9,20,0.4); color: #e50914; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600; white-space: nowrap;">Browse</button>
              </div>`;
        }).join('')}
            </div>

            <div style="display: flex; gap: 16px; margin-top: 36px;">
                <button id="btn-setup-back" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: white; font-size: 1rem; padding: 12px 24px; border-radius: 8px; cursor: pointer;">Back</button>
                <button id="btn-setup-confirm" disabled style="background: rgba(229,9,20,0.3); border: 1px solid rgba(229,9,20,0.5); color: rgba(255,255,255,0.4); font-size: 1rem; padding: 12px 32px; border-radius: 8px; cursor: not-allowed; font-weight: 600; transition: all 0.3s;">Continue</button>
            </div>

            <div id="setup-migrate-section" style="display: none; margin-top: 30px; text-align: center;">
                <div style="width: 100%; max-width: 600px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 24px;">
                    <p style="font-size: 0.9rem; color: rgba(255,255,255,0.4); margin: 0 0 12px 0;">Have existing chapter.json files inside image folders?</p>
                    <button id="btn-migrate" style="background: rgba(0,200,255,0.1); border: 1px solid rgba(0,200,255,0.3); color: rgba(0,200,255,0.9); padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 600;">🔄 Migrate Chapter Files</button>
                    <div id="migrate-status" style="margin-top: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.5);"></div>
                </div>
            </div>
        </div>
      </div>
    `;

        function updateConfirmBtn() {
            const btn = document.getElementById('btn-setup-confirm') as HTMLButtonElement;
            const allSet = selectedRoot && selectedAudio && selectedChapters;
            btn.disabled = !allSet;
            btn.style.background = allSet ? '#e50914' : 'rgba(229,9,20,0.3)';
            btn.style.color = allSet ? 'white' : 'rgba(255,255,255,0.4)';
            btn.style.cursor = allSet ? 'pointer' : 'not-allowed';
            // Show migrate section when all dirs are set
            const migrateSection = document.getElementById('setup-migrate-section');
            if (migrateSection) migrateSection.style.display = allSet ? 'flex' : 'none';
        }

        async function pickDir(type: string, title: string) {
            const dir = await window.electronAPI.selectDirectory(title);
            if (!dir) return;
            if (type === 'images') selectedRoot = dir;
            else if (type === 'audio') selectedAudio = dir;
            else selectedChapters = dir;
            const pathEl = document.getElementById(`setup-path-${type}`);
            if (pathEl) pathEl.textContent = dir;
            const row = document.getElementById(`setup-row-${type}`);
            if (row) row.style.borderColor = 'rgba(34,197,94,0.5)';
            updateConfirmBtn();
        }

        document.getElementById('btn-pick-images')?.addEventListener('click', () => pickDir('images', 'Select Manga Images Root'));
        document.getElementById('btn-pick-audio')?.addEventListener('click', () => pickDir('audio', 'Select Audio Directory'));
        document.getElementById('btn-pick-chapters')?.addEventListener('click', () => pickDir('chapters', 'Select Chapters JSON Directory'));
        document.getElementById('btn-setup-back')?.addEventListener('click', () => window.location.reload());

        document.getElementById('btn-setup-confirm')?.addEventListener('click', async () => {
            if (!selectedRoot || !selectedAudio || !selectedChapters) return;
            const success = await window.electronAPI.setDirectories({
                rootDir: selectedRoot,
                audioDir: selectedAudio,
                chaptersDir: selectedChapters
            });
            if (success) {
                renderHome();
            } else {
                alert('Failed to save directory configuration.');
            }
        });

        document.getElementById('btn-migrate')?.addEventListener('click', async () => {
            if (!selectedRoot || !selectedChapters) return;
            // Save dirs first so migration can use them
            await window.electronAPI.setDirectories({
                rootDir: selectedRoot,
                audioDir: selectedAudio,
                chaptersDir: selectedChapters
            });
            const statusEl = document.getElementById('migrate-status');
            if (statusEl) statusEl.textContent = 'Migrating...';
            const result = await window.electronAPI.migrateChapterFiles();
            if (statusEl) {
                if (result.success) {
                    statusEl.textContent = `✅ Migrated ${result.migrated} chapter file(s).` +
                        (result.errors.length > 0 ? ` (${result.errors.length} errors)` : '');
                    statusEl.style.color = '#22c55e';
                } else {
                    statusEl.textContent = `❌ Migration failed: ${result.errors.join(', ')}`;
                    statusEl.style.color = '#ef4444';
                }
            }
        });
    }

    function renderHome() {
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
                renderSetup();
            }
        });

        autoLoadLibrary();
    }

    async function autoLoadLibrary() {
        const statusEl = document.getElementById('library-status');
        try {
            const result = await window.electronAPI.loadLibrary();
            chapters = result || [];

            if (statusEl) statusEl.style.display = 'none';

            if (chapters.length > 0) {
                updateChapterList();
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

    function updateChapterList() {
        const list = document.getElementById('chapter-list');
        if (!list) return;

        if (chapters.length === 0) {
            list.innerHTML = `<p style="color: #666;">No chapters found in selected folder.</p>`;
            return;
        }

        list.innerHTML = chapters.map((ch, idx) => {
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
                const chapter = chapters[idx];

                // Show loading state
                document.body.style.cursor = 'wait';
                currentChapterData = await window.electronAPI.loadChapter(chapter.path);
                // Load central audio links
                centralAudioLinks = await window.electronAPI.loadAudioLinks();
                document.body.style.cursor = 'default';

                if (currentChapterData) {
                    const missingTracks = getMissingAudioTracks();
                    if (missingTracks.length > 0) {
                        showAudioSetupMode(missingTracks, chapter.path);
                    } else {
                        // Check if regions exist to decide default mode
                        if (currentChapterData.chapterData && currentChapterData.chapterData.regions.length > 0) {
                            startModeB(); // Default to Mode B if regions exist
                        } else {
                            startModeA(); // Fallback to Mode A
                        }
                    }
                } else {
                    alert("Failed to load chapter data.");
                }
            });
        });
    }

    // --- MODE B: CINEMATIC ---
    function startModeB() {
        if (!currentChapterData || !currentChapterData.chapterData) {
            alert("This chapter has no cinematic data (chapter.json missing or invalid).");
            return;
        }

        sortedRegions = [...currentChapterData.chapterData.regions].sort((a, b) => a.order - b.order);
        currentRegionIndex = 0;
        bState = 'IDLE';
        if (activeAudioTrack) activeAudioTrack.pause();
        activeAudioTrack = null;

        if (sortedRegions.length === 0) {
            alert("No regions defined in this chapter. Switching to Standard Mode A.");
            startModeA();
            return;
        }

        renderReaderUI('Cinematic Mode');
        advanceRegionB();
    }

    function teardownReaderInteractions() {
        detachReaderEvents?.();
        detachReaderEvents = null;
        document.removeEventListener('keydown', handleKey);
        if (readerHideTimer) {
            clearTimeout(readerHideTimer);
            readerHideTimer = null;
        }
        readerIsPanning = false;
        readerDidDrag = false;
        readerSuppressNextClick = false;
    }

    function getReaderView() {
        return document.getElementById('reader-view') as HTMLElement | null;
    }

    function getReaderStage() {
        return document.getElementById('reader-zoom-stage') as HTMLElement | null;
    }

    function getReaderZoomLabel() {
        return document.getElementById('reader-zoom-label') as HTMLSpanElement | null;
    }

    function getReaderToolbar() {
        return document.getElementById('reader-toolbar') as HTMLElement | null;
    }

    function isReaderToolbarTarget(target: EventTarget | null) {
        return target instanceof HTMLElement && !!target.closest('#reader-toolbar');
    }

    function clampReaderPan(nextPanX: number, nextPanY: number, nextZoom = readerZoom) {
        const view = getReaderView();
        if (!view || nextZoom <= readerFitZoom + 0.001) {
            return { x: 0, y: 0 };
        }

        const maxPanX = Math.max(0, (view.clientWidth * nextZoom - view.clientWidth) / 2);
        const maxPanY = Math.max(0, (view.clientHeight * nextZoom - view.clientHeight) / 2);
        return {
            x: Math.max(-maxPanX, Math.min(maxPanX, nextPanX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, nextPanY))
        };
    }

    function syncReaderViewport() {
        const stage = getReaderStage();
        const label = getReaderZoomLabel();
        const view = getReaderView();
        if (!stage || !view) return;

        const clampedPan = clampReaderPan(readerPanX, readerPanY);
        readerPanX = clampedPan.x;
        readerPanY = clampedPan.y;

        stage.style.transform = `translate(${readerPanX}px, ${readerPanY}px) scale(${readerZoom})`;
        if (label) {
            label.textContent = `${Math.round(readerZoom * 100)}%`;
        }

        view.classList.toggle('is-zoomed', readerZoom > readerFitZoom + 0.001);
        view.classList.toggle('is-panning', readerIsPanning);
    }

    function getReaderViewportCenter() {
        const view = getReaderView();
        const rect = view?.getBoundingClientRect();
        return rect ? {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        } : { x: 0, y: 0 };
    }

    function setReaderZoom(nextZoom: number, anchorClientX: number, anchorClientY: number) {
        const stage = getReaderStage();
        if (!stage) return;

        const clampedZoom = Math.min(READER_ZOOM_MAX, Math.max(readerFitZoom, parseFloat(nextZoom.toFixed(4))));
        if (Math.abs(clampedZoom - readerZoom) < 0.0001) return;

        const previousZoom = readerZoom;
        const previousRect = stage.getBoundingClientRect();
        const naturalX = (anchorClientX - previousRect.left) / previousZoom;
        const naturalY = (anchorClientY - previousRect.top) / previousZoom;

        readerZoom = clampedZoom;
        syncReaderViewport();

        requestAnimationFrame(() => {
            const nextRect = stage.getBoundingClientRect();
            const renderedX = nextRect.left + naturalX * readerZoom;
            const renderedY = nextRect.top + naturalY * readerZoom;
            readerPanX += anchorClientX - renderedX;
            readerPanY += anchorClientY - renderedY;
            syncReaderViewport();
        });
    }

    function stepReaderZoom(direction: 'in' | 'out', anchor = getReaderViewportCenter()) {
        const nextZoom = direction === 'in'
            ? readerZoom * READER_ZOOM_STEP_FACTOR
            : readerZoom / READER_ZOOM_STEP_FACTOR;
        setReaderZoom(nextZoom, anchor.x, anchor.y);
    }

    function resetReaderZoomToFit() {
        readerFitZoom = 1;
        readerZoom = readerFitZoom;
        readerPanX = 0;
        readerPanY = 0;
        syncReaderViewport();
    }

    function updateReaderCursor(visible = true) {
        if (!visible) {
            container.style.cursor = 'none';
            return;
        }

        if (readerIsPanning) {
            container.style.cursor = 'grabbing';
        } else if (readerZoom > readerFitZoom + 0.001) {
            container.style.cursor = 'grab';
        } else {
            container.style.cursor = 'default';
        }
    }

    function scheduleReaderToolbarHide() {
        if (readerHideTimer) clearTimeout(readerHideTimer);
        readerHideTimer = setTimeout(() => {
            const toolbar = getReaderToolbar();
            if (toolbar) toolbar.style.opacity = '0';
            if (!readerIsPanning) updateReaderCursor(false);
        }, 3000);
    }

    function revealReaderChrome() {
        const toolbar = getReaderToolbar();
        if (toolbar) toolbar.style.opacity = '1';
        updateReaderCursor(true);
        if (!readerIsPanning) scheduleReaderToolbarHide();
    }

    function exitReader() {
        teardownReaderInteractions();
        if (activeAudioTrack) activeAudioTrack.pause();
        renderHome();
        updateChapterList();
    }

    function renderReaderUI(title: string) {
        teardownReaderInteractions();
        container.innerHTML = `
      <div class="reader-shell">
        <div class="reader-toolbar" id="reader-toolbar">
          <h2 class="reader-toolbar-title">${title}</h2>
          <div class="reader-toolbar-actions">
            <div class="toolbar-volume" style="display: flex; align-items: center; gap: 8px;">
              <label for="reader-volume" title="Volume">🔊</label>
              <input type="range" id="reader-volume" min="0" max="1" step="0.01" value="${globalAudioVolume}" style="width: 80px; cursor: pointer;">
            </div>
            <div class="toolbar-zoom reader-toolbar-zoom">
              <button id="reader-zoom-out" title="Zoom Out">-</button>
              <span id="reader-zoom-label">100%</span>
              <button id="reader-zoom-in" title="Zoom In">+</button>
              <button id="reader-zoom-fit" title="Fit to View">Fit</button>
            </div>
            <button id="btn-toggle-mode" class="reader-toolbar-btn" style="border-color: var(--accent-color); color: var(--accent-color);">${sortedRegions.length > 0 ? 'Standard Mode' : 'Cinematic Mode'}</button>
            <button id="btn-close-reader" class="reader-toolbar-btn">Exit Chapter</button>
          </div>
        </div>

        <div id="reader-view" class="reader-view">
          <div id="reader-zoom-stage" class="reader-zoom-stage">
            <div id="reader-standard-layer" class="reader-layer reader-standard-layer"></div>
            <div id="layer-bg" class="reader-layer reader-cinematic-layer"></div>
            <div id="layer-fg" class="reader-layer reader-cinematic-layer"></div>
          </div>
        </div>
        <div id="yt-reader-container" style="position: absolute; left: -9999px;"><div id="yt-reader"></div></div>
      </div>
    `;

        readerFitZoom = 1;
        readerZoom = 1;
        readerPanX = 0;
        readerPanY = 0;
        readerIsPanning = false;
        readerDidDrag = false;
        readerSuppressNextClick = false;
        syncReaderViewport();
        revealReaderChrome();

        const readerView = getReaderView();
        if (!readerView) return;

        const onContainerMouseMove = () => {
            revealReaderChrome();
        };
        const onReaderMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || readerZoom <= readerFitZoom + 0.001 || isReaderToolbarTarget(e.target)) return;
            readerIsPanning = true;
            readerDidDrag = false;
            readerPointerStartX = e.clientX;
            readerPointerStartY = e.clientY;
            readerPanStartX = readerPanX;
            readerPanStartY = readerPanY;
            syncReaderViewport();
            revealReaderChrome();
            e.preventDefault();
        };
        const onReaderMouseMove = (e: MouseEvent) => {
            revealReaderChrome();
            if (!readerIsPanning) return;

            const deltaX = e.clientX - readerPointerStartX;
            const deltaY = e.clientY - readerPointerStartY;
            if (Math.abs(deltaX) > READER_DRAG_THRESHOLD || Math.abs(deltaY) > READER_DRAG_THRESHOLD) {
                readerDidDrag = true;
            }

            readerPanX = readerPanStartX + deltaX;
            readerPanY = readerPanStartY + deltaY;
            syncReaderViewport();
        };
        const onReaderMouseUp = () => {
            if (!readerIsPanning) return;
            readerIsPanning = false;
            if (readerDidDrag) {
                readerSuppressNextClick = true;
            }
            syncReaderViewport();
            revealReaderChrome();
        };
        const onReaderClick = (e: MouseEvent) => {
            if (isReaderToolbarTarget(e.target)) return;
            if (readerSuppressNextClick) {
                readerSuppressNextClick = false;
                return;
            }
            handleReaderClick(e);
        };
        const onReaderWheel = (e: WheelEvent) => {
            e.preventDefault();
            revealReaderChrome();
            stepReaderZoom(e.deltaY < 0 ? 'in' : 'out', { x: e.clientX, y: e.clientY });
        };

        container.addEventListener('mousemove', onContainerMouseMove);
        readerView.addEventListener('mousedown', onReaderMouseDown);
        readerView.addEventListener('click', onReaderClick);
        readerView.addEventListener('wheel', onReaderWheel, { passive: false });
        window.addEventListener('mousemove', onReaderMouseMove);
        window.addEventListener('mouseup', onReaderMouseUp);
        document.removeEventListener('keydown', handleKey);
        document.addEventListener('keydown', handleKey);

        document.getElementById('reader-volume')?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            globalAudioVolume = val;
            if (activeAudioTrack) {
                activeAudioTrack.updateGlobalVolume();
            }
        });

        document.getElementById('reader-zoom-in')?.addEventListener('click', () => {
            revealReaderChrome();
            stepReaderZoom('in');
        });
        document.getElementById('reader-zoom-out')?.addEventListener('click', () => {
            revealReaderChrome();
            stepReaderZoom('out');
        });
        document.getElementById('reader-zoom-fit')?.addEventListener('click', () => {
            revealReaderChrome();
            resetReaderZoomToFit();
        });
        document.getElementById('btn-toggle-mode')?.addEventListener('click', () => {
            if (sortedRegions.length > 0) {
                startModeA();
            } else {
                startModeB();
            }
        });
        document.getElementById('btn-close-reader')?.addEventListener('click', () => {
            exitReader();
        });

        detachReaderEvents = () => {
            container.removeEventListener('mousemove', onContainerMouseMove);
            readerView.removeEventListener('mousedown', onReaderMouseDown);
            readerView.removeEventListener('click', onReaderClick);
            readerView.removeEventListener('wheel', onReaderWheel);
            window.removeEventListener('mousemove', onReaderMouseMove);
            window.removeEventListener('mouseup', onReaderMouseUp);
        };
    }

    function handleReaderClick(e?: MouseEvent) {
        let dir: 1 | -1 = 1;
        if (e) {
            const rect = container.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width * 0.3) {
                dir = -1;
            }
        }

        if (sortedRegions.length > 0) {
            navigateRegionB(dir);
        } else {
            if (dir === 1) nextImageA();
            else prevImageA();
        }
    }

    function handleKey(e: KeyboardEvent) {
        if (isReaderToolbarTarget(e.target)) return;

        if (e.key === 'ArrowRight' || e.key === 'Space') {
            e.preventDefault();
            if (sortedRegions.length > 0) navigateRegionB(1);
            else nextImageA();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (sortedRegions.length > 0) navigateRegionB(-1);
            else prevImageA();
        } else if (e.key === '+' || (e.key === '=' && e.shiftKey)) {
            e.preventDefault();
            revealReaderChrome();
            stepReaderZoom('in');
        } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            revealReaderChrome();
            stepReaderZoom('out');
        } else if (e.key === '0') {
            e.preventDefault();
            revealReaderChrome();
            resetReaderZoomToFit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            document.getElementById('btn-close-reader')?.click();
        }
    }

    function navigateRegionB(direction: 1 | -1) {
        if (bState !== 'WAIT_INPUT') return;

        const nextIndex = currentRegionIndex + direction;
        if (nextIndex < 0) return; // Cannot go before start

        currentRegionIndex = nextIndex;
        advanceRegionB();
    }

    function advanceRegionB() {
        if (currentRegionIndex >= sortedRegions.length) {
            // End of chapter
            if (activeAudioTrack) activeAudioTrack.pause();
            alert("Chapter Complete!");
            exitReader();
            return;
        }

        const currentRegion = sortedRegions[currentRegionIndex];
        bState = 'PLAYING';

        // Find image URL
        const imgData = currentChapterData?.images.find(i => i.name === currentRegion.imageId);
        if (!imgData) return;

        // Handle Audio Span
        const spans = currentChapterData?.chapterData?.audioSpans || [];
        const activeSpan = spans.find(s => currentRegion.order >= s.startRegionOrder && currentRegion.order <= s.endRegionOrder);
        const audioSourceLinks = centralAudioLinks;

        // Fade existing audio out if track changes
        if (activeSpan) {
            if (activeSpan.trackId === 'silence') {
                // Fade out current audio and play nothing
                if (activeAudioTrack) {
                    const track = activeAudioTrack;
                    activeAudioTrack = null;
                    const fadeOutInt = setInterval(() => {
                        if (track.volume > 0.05) track.volume -= 0.05;
                        else {
                            track.pause();
                            track.volume = 1;
                            clearInterval(fadeOutInt);
                        }
                    }, 50);
                }
            } else if (!activeAudioTrack || activeAudioTrack.trackId !== activeSpan.trackId) {
                const oldAudio = activeAudioTrack;

                let newAudioTrack: TrackWrapper | null = null;

                // Track resolution: Prioritize local workspace audio (downloaded MP3s)
                const localTrackMatch = currentChapterData?.audio.find(a => a.name === activeSpan.trackId || a.name === activeSpan.trackId + '.mp3');
                const webTrackUrl = audioSourceLinks[activeSpan.trackId];

                if (localTrackMatch) {
                    const newAudio = new Audio(localTrackMatch.url);
                    newAudio.loop = activeSpan.loop;

                    if (activeSpan.startTime > 0) {
                        newAudio.currentTime = activeSpan.startTime;
                    }

                    // Enforce endTime
                    newAudio.addEventListener('timeupdate', () => {
                        if (activeSpan.endTime > 0 && newAudio.currentTime >= activeSpan.endTime) {
                            if (activeSpan.loop) {
                                newAudio.currentTime = activeSpan.startTime || 0;
                            } else {
                                newAudio.pause();
                            }
                        }
                    });
                    newAudioTrack = new HtmlAudioTrack(newAudio, activeSpan.trackId);
                } else if (webTrackUrl) {
                    // Direct URL playback fallback
                    const newAudio = new Audio(webTrackUrl);
                    newAudio.loop = activeSpan.loop;
                    if (activeSpan.startTime > 0) newAudio.currentTime = activeSpan.startTime;

                    // Enforce endTime
                    newAudio.addEventListener('timeupdate', () => {
                        if (activeSpan.endTime > 0 && newAudio.currentTime >= activeSpan.endTime) {
                            if (activeSpan.loop) {
                                newAudio.currentTime = activeSpan.startTime || 0;
                            } else {
                                newAudio.pause();
                            }
                        }
                    });

                    newAudioTrack = new HtmlAudioTrack(newAudio, activeSpan.trackId);
                }

                if (newAudioTrack) {
                    newAudioTrack.volume = 0;
                    newAudioTrack.play();
                    activeAudioTrack = newAudioTrack;

                    // Crossfade
                    let v = 0;
                    const fadeInt = setInterval(() => {
                        v += 0.05;
                        if (oldAudio && oldAudio.volume > 0.05) oldAudio.volume -= 0.05;
                        if (v >= 1) {
                            if (newAudioTrack) newAudioTrack.volume = 1;
                            if (oldAudio) { oldAudio.pause(); oldAudio.volume = 1; }
                            clearInterval(fadeInt);
                        } else {
                            if (newAudioTrack) newAudioTrack.volume = v;
                        }
                    }, 50);
                }
            } else {
                // Same track continuing, bounds are handled internally
            }
        } else {
            // Fade out current audio
            if (activeAudioTrack) {
                const track = activeAudioTrack;
                activeAudioTrack = null;
                const fadeOutInt = setInterval(() => {
                    if (track.volume > 0.05) track.volume -= 0.05;
                    else {
                        track.pause();
                        track.volume = 1;
                        clearInterval(fadeOutInt);
                    }
                }, 50);
            }
        }
        const imgConfig = currentChapterData?.chapterData?.imagesConfig?.[imgData.name];
        const isBlurMode = imgConfig?.blurMode;
        // Determine keepPrevious: region-specific overrides image config
        const keepPrevious = (typeof currentRegion.keepPrevious === 'boolean')
            ? currentRegion.keepPrevious
            : (imgConfig?.keepPreviousVisible ?? false);
        // Prefer per‑region transition type if defined; otherwise fall back to image‑wide blur flag
        const transitionType = currentRegion.transitionType ?
            currentRegion.transitionType :
            (isBlurMode ? 'blur' : 'sharp');
        // Detect if this is the first blur region entered from a non-blur region
        let isFirstBlurEntry = false;
        if (transitionType === 'blur' && currentRegionIndex > 0) {
            const prevRegion = sortedRegions[currentRegionIndex - 1];
            const prevImgConfig = currentChapterData?.chapterData?.imagesConfig?.[prevRegion.imageId];
            const prevIsBlurMode = prevImgConfig?.blurMode;
            const prevTransitionType = prevRegion.transitionType ?
                prevRegion.transitionType :
                (prevIsBlurMode ? 'blur' : 'sharp');
            if (prevTransitionType !== 'blur') {
                isFirstBlurEntry = true;
            }
        }
        const blurSharp = (isBlurMode && currentRegion.transitionType === 'sharp') || isFirstBlurEntry;
        // Set current blur group ID for grouping logic
        currentBlurGroupId = currentRegion.blurGroupId || null;
        // Debug log to verify blur group handling
        console.log('AdvanceRegionB - region:', currentRegion.id, 'blurGroupId:', currentRegion.blurGroupId, 'renderFullBackground:', !currentBlurGroupId);
        const standardLayer = document.getElementById('reader-standard-layer') as HTMLElement | null;
        if (standardLayer) {
            standardLayer.innerHTML = '';
            standardLayer.style.opacity = '0';
        }
        renderRegionFrame(imgData.url, currentRegion.rect, transitionType, { sharp: blurSharp, keepPrevious }, currentRegion);
        bState = 'WAIT_INPUT';
    }

    let isLayerFgActive = true;
    // visited regions for the current blur group
    let visitedBlurRegions: Region[] = [];
    // currently active blur group ID (null if none)
    let currentBlurGroupId: string | null = null;
    let blurClipId = '';

    function animateReaderTo(targetZoom: number, targetPanX: number, targetPanY: number, durationMs = 600) {
        const stage = getReaderStage();
        const label = getReaderZoomLabel();
        const view = getReaderView();
        if (!stage || !view) return;

        // Apply CSS transition for smooth movement
        stage.style.transition = `transform ${durationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`;

        readerZoom = targetZoom;
        readerPanX = targetPanX;
        readerPanY = targetPanY;

        // Apply transform directly (bypass clampReaderPan so auto-focus values aren't clamped)
        stage.style.transform = `translate(${readerPanX}px, ${readerPanY}px) scale(${readerZoom})`;
        if (label) {
            label.textContent = `${Math.round(readerZoom * 100)}%`;
        }
        view.classList.toggle('is-zoomed', readerZoom > readerFitZoom + 0.001);

        // Remove transition after animation completes so manual zoom/pan stays snappy
        setTimeout(() => {
            if (stage) stage.style.transition = '';
        }, durationMs + 50);
    }

    function autoFocusOnBlurRegions(blurRegions: Region[], imgScale: number, imgW: number, imgH: number) {
        const view = getReaderView();
        if (!view || blurRegions.length === 0) return;

        const viewW = view.clientWidth;
        const viewH = view.clientHeight;

        // 1. Compute union bounding box in natural image coordinates
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const r of blurRegions) {
            minX = Math.min(minX, r.rect.x);
            minY = Math.min(minY, r.rect.y);
            maxX = Math.max(maxX, r.rect.x + r.rect.w);
            maxY = Math.max(maxY, r.rect.y + r.rect.h);
        }

        // 2. Convert bounding box center to stage coordinates
        //    The blur-container-wrap is centered in the layer via translate(-50%,-50%) + top/left 50%
        //    so the image top-left in stage coords = (viewW/2 - imgW*scale/2, viewH/2 - imgH*scale/2)
        const boxCenterX = viewW / 2 - (imgW * imgScale) / 2 + ((minX + maxX) / 2) * imgScale;
        const boxCenterY = viewH / 2 - (imgH * imgScale) / 2 + ((minY + maxY) / 2) * imgScale;
        const boxW = (maxX - minX) * imgScale;
        const boxH = (maxY - minY) * imgScale;

        // 3. Calculate target zoom to fit the bounding box with padding
        const focusPadding = 80;
        const targetZoom = Math.min(
            (viewW - focusPadding * 2) / boxW,
            (viewH - focusPadding * 2) / boxH,
            READER_ZOOM_MAX
        );
        const clampedZoom = Math.max(readerFitZoom, targetZoom);

        // 4. Calculate pan to center the bounding box in the viewport
        //    CSS transform: translate(panX, panY) scale(zoom) applies scale first (around center), then translate
        //    To center boxCenter: panX = (viewW/2 - boxCenterX) * zoom
        const targetPanX = (viewW / 2 - boxCenterX) * clampedZoom;
        const targetPanY = (viewH / 2 - boxCenterY) * clampedZoom;

        animateReaderTo(clampedZoom, targetPanX, targetPanY);
    }

    function renderRegionFrame(imgUrl: string, rect: any, transitionType: 'fade' | 'sharp' | 'blur', blurOpts?: { sharp?: boolean; keepPrevious?: boolean }, region?: Region) {
        const layerFg = document.getElementById('layer-fg');
        const layerBg = document.getElementById('layer-bg');
        if (!layerFg || !layerBg) return;

        // Determine currently active and inactive layers (do not swap yet)
        const activeLayer = isLayerFgActive ? layerFg : layerBg;
        const inactiveLayer = isLayerFgActive ? layerBg : layerFg;

        const viewRect = getReaderView()?.getBoundingClientRect() ?? container.getBoundingClientRect();

        let htmlContent = '';

        if (transitionType === 'blur') {
            const keepPrevious = blurOpts?.keepPrevious;

            // --- Stateless visitedBlurRegions calculation ---
            visitedBlurRegions = [];
            let tempMasked: string | null = null;
            let tempGroupId: string | null = null;

            for (let i = 0; i <= currentRegionIndex; i++) {
                const r = sortedRegions[i];
                const rImgData = currentChapterData?.images.find(img => img.name === r.imageId);
                const rUrl = rImgData?.url || null;
                const rGroupId = r.blurGroupId || null;

                if (tempMasked !== rUrl || tempGroupId !== rGroupId) {
                    tempMasked = rUrl;
                    visitedBlurRegions = [];
                    tempGroupId = rGroupId;
                }

                const rImgConfig = currentChapterData?.chapterData?.imagesConfig?.[r.imageId];
                const rKeep = (typeof r.keepPrevious === 'boolean') ? r.keepPrevious : (rImgConfig?.keepPreviousVisible ?? false);

                if (rKeep) {
                    visitedBlurRegions.push(r);
                } else {
                    visitedBlurRegions = [r];
                }
            }

            blurClipId = `blur-clip-${Date.now()}`;

            const renderFullBackground = !currentBlurGroupId;
            if (keepPrevious) {
                htmlContent = `
                <div style="position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden;">
                   <div id="blur-container-wrap-${Date.now()}" style="position: absolute; transform: translate(-50%, -50%); top: 50%; left: 50%;">
                       <svg width="0" height="0" style="position:absolute">
                           <defs>
                               <clipPath id="${blurClipId}">
                               </clipPath>
                           </defs>
                       </svg>
                       ${renderFullBackground ? `<img class="anim-img-bg" src="${imgUrl}" style="
                          display: block;
                          position: absolute;
                          top: 0; left: 0;
                          width: 100%; height: 100%;
                          filter: blur(12px) brightness(0.45);
                       " />` : ''}
                       <img class="anim-img-fg" src="${imgUrl}" style="
                          position: absolute;
                          top: 0; left: 0;
                          width: 100%; height: 100%;
                          clip-path: url(#${blurClipId});
                       " />
                   </div>
                </div>
                `;
            } else {
                htmlContent = `
                <div style="position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden;">
                   <div id="blur-container-wrap-${Date.now()}" style="position: absolute; transform: translate(-50%, -50%); top: 50%; left: 50%;">
                       ${renderFullBackground ? `<img class="anim-img-bg" src="${imgUrl}" style="
                          display: block;
                          position: absolute;
                          top: 0; left: 0;
                          width: 100%; height: 100%;
                          filter: blur(12px) brightness(0.45);
                       " />` : ''}
                       <img class="anim-img-fg" src="${imgUrl}" style="
                          position: absolute;
                          top: 0; left: 0;
                          width: 100%; height: 100%;
                       " />
                   </div>
                </div>
                `;
            }
        } else {

            const scaleW = viewRect.width / (rect.w || 1);
            const scaleH = viewRect.height / (rect.h || 1);
            const scale = Math.min(scaleW, scaleH);

            let clipPathStyle = '';
            if (region?.shapeType === 'polygon' && region.polygon) {
                const points = region.polygon.map(p => `${(p.x - rect.x) * scale}px ${(p.y - rect.y) * scale}px`).join(', ');
                clipPathStyle = `clip-path: polygon(${points});`;
            }

            htmlContent = `
            <div style="position: relative; overflow: hidden; width: ${rect.w * scale}px; height: ${rect.h * scale}px; box-shadow: 0 0 50px rgba(0,0,0,0.8); border: 2px solid #222; ${clipPathStyle}">
               <img class="anim-img-fg" src="${imgUrl}" style="
                  position: absolute; 
                  transform-origin: top left; 
                  width: 100%; /* Temporary, will be set on load */
                  transform: translate(-${rect.x * scale}px, -${rect.y * scale}px);
                  transition: transform 0.8s ease-in-out;
               " />
            </div>
            `;
        }

        // Write the new content to the currently hidden (inactive) layer
        inactiveLayer.innerHTML = htmlContent;

        // Reference the images inside the newly populated layer
        const imgFg = inactiveLayer.querySelector('.anim-img-fg') as HTMLImageElement;

        const finalizeFrame = () => {
            // Once the new image is loaded, we map the layers based on our new swapped state
            const targetVisibleLayer = inactiveLayer;
            const targetHiddenLayer = activeLayer;

            // Officially toggle the global state now that everything is loaded and ready
            isLayerFgActive = !isLayerFgActive;
            const imgW = imgFg.naturalWidth;
            const imgH = imgFg.naturalHeight;

            if (transitionType === 'blur') {
                const scaleW = viewRect.width / (imgW || 1);
                const scaleH = viewRect.height / (imgH || 1);
                const scale = Math.min(scaleW, scaleH);

                const wrap = targetVisibleLayer.querySelector('div[id^="blur-container-wrap-"]') as HTMLElement | null;
                if (wrap) {
                    wrap.style.width = `${imgW * scale}px`;
                    wrap.style.height = `${imgH * scale}px`;
                }

                if (blurOpts?.keepPrevious) {
                    // Populate SVG clip-path with the initial rect
                    const clipEl = document.getElementById(blurClipId);
                    if (clipEl) {
                        for (const r of visitedBlurRegions) {
                            if (r.shapeType === 'polygon' && r.polygon) {
                                const svgPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                                const points = r.polygon.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
                                svgPoly.setAttribute('points', points);
                                clipEl.appendChild(svgPoly);
                            } else {
                                const svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                                svgRect.setAttribute('x', String(r.rect.x * scale));
                                svgRect.setAttribute('y', String(r.rect.y * scale));
                                svgRect.setAttribute('width', String(r.rect.w * scale));
                                svgRect.setAttribute('height', String(r.rect.h * scale));
                                svgRect.setAttribute('rx', '6');
                                svgRect.setAttribute('ry', '6');
                                clipEl.appendChild(svgRect);
                            }
                        }
                    }
                    imgFg.style.transform = 'none';
                } else {
                    // Set initial clip-path without transition so it doesn't animate in from nowhere
                    imgFg.style.transition = 'none';
                    if (region?.shapeType === 'polygon' && region.polygon) {
                        const points = region.polygon.map(p => `${p.x * scale}px ${p.y * scale}px`).join(', ');
                        imgFg.style.clipPath = `polygon(${points})`;
                    } else {
                        const top = rect.y * scale;
                        const left = rect.x * scale;
                        const right = (imgW - (rect.x + rect.w)) * scale;
                        const bottom = (imgH - (rect.y + rect.h)) * scale;
                        imgFg.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 6px)`;
                    }
                    imgFg.style.transform = 'none';
                }

            } else {
                const scaleW = viewRect.width / (rect.w || 1);
                const scaleH = viewRect.height / (rect.h || 1);
                const scale = Math.min(scaleW, scaleH);

                imgFg.style.width = `${imgW * scale}px`;
                imgFg.style.height = `${imgH * scale}px`;

                requestAnimationFrame(() => {
                    imgFg.style.transform = `translate(-${rect.x * scale}px, -${rect.y * scale}px)`;
                });
            }

            // Transition styles
            const isSharpTrans = transitionType === 'sharp' || (transitionType === 'blur' && blurOpts?.sharp);
            const fadeDur = transitionType === 'blur' ? '0.8s' : '1.5s';

            if (isSharpTrans) {
                // Instant transition
                targetVisibleLayer.style.transition = 'none';
                targetHiddenLayer.style.transition = 'none';
                targetVisibleLayer.style.opacity = '1';
                targetHiddenLayer.style.opacity = '0';

                // Restore transition property for future use
                // Small delay to ensure the browser paints the 'none' state
                setTimeout(() => {
                    targetVisibleLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
                    targetHiddenLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
                }, 50);
            } else {
                // Fade crossfade
                targetVisibleLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
                targetHiddenLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
                targetVisibleLayer.style.opacity = '1';
                targetHiddenLayer.style.opacity = '0';
            }

            // Auto-focus on accumulated blur regions when keep+group is active
            if (transitionType === 'blur' && blurOpts?.keepPrevious && currentBlurGroupId && visitedBlurRegions.length > 0) {
                const focusPad = 50;
                const focusScaleW = (viewRect.width - focusPad * 2) / (imgW || 1);
                const focusScaleH = (viewRect.height - focusPad * 2) / (imgH || 1);
                const focusScale = Math.min(focusScaleW, focusScaleH);
                autoFocusOnBlurRegions(visitedBlurRegions, focusScale, imgW, imgH);
            } else {
                resetReaderZoomToFit();
            }
        };

        if (imgFg.complete) {
            finalizeFrame();
        } else {
            imgFg.onload = finalizeFrame;
        }
    }

    // --- MODE A: STANDARD ---
    function startModeA() {
        sortedRegions = []; // flag for Mode A
        currentImageIndex = 0;
        renderReaderUI('Standard Mode');
        renderImageA();
    }

    function renderImageA() {
        if (!currentChapterData) return;
        if (currentImageIndex >= currentChapterData.images.length) {
            alert("Chapter Complete!");
            exitReader();
            return;
        }

        const imgData = currentChapterData.images[currentImageIndex];
        const standardLayer = document.getElementById('reader-standard-layer') as HTMLElement | null;
        const layerBg = document.getElementById('layer-bg') as HTMLElement | null;
        const layerFg = document.getElementById('layer-fg') as HTMLElement | null;
        if (standardLayer) {
            standardLayer.style.opacity = '1';
            standardLayer.innerHTML = `<img id="reader-mode-a-image" class="reader-mode-a-image" src="${imgData.url}" />`;
        }
        if (layerBg) {
            layerBg.innerHTML = '';
            layerBg.style.opacity = '0';
        }
        if (layerFg) {
            layerFg.innerHTML = '';
            layerFg.style.opacity = '0';
        }

        const img = document.getElementById('reader-mode-a-image') as HTMLImageElement | null;
        if (img) {
            if (img.complete) {
                resetReaderZoomToFit();
            } else {
                img.onload = () => {
                    resetReaderZoomToFit();
                };
            }
        }
    }

    function nextImageA() {
        currentImageIndex++;
        renderImageA();
    }

    function prevImageA() {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            renderImageA();
        }
    }

    function getMissingAudioTracks(): { id: string, url: string }[] {
        if (!currentChapterData || !currentChapterData.chapterData) {
            return [];
        }

        // Only check tracks that are actually used in this chapter's audioSpans
        const usedTrackIds = new Set<string>();
        for (const span of currentChapterData.chapterData.audioSpans) {
            if (span.trackId && span.trackId !== 'silence') {
                usedTrackIds.add(span.trackId);
            }
        }

        const localAudioNames = currentChapterData.audio.map(a => a.name);
        const missing: { id: string, url: string }[] = [];

        for (const trackId of usedTrackIds) {
            // Check if this track exists locally
            if (!localAudioNames.includes(`${trackId}.mp3`) && !localAudioNames.includes(trackId)) {
                // Check if we have a download URL for it in the central links
                const url = centralAudioLinks[trackId] || centralAudioLinks[`${trackId}.mp3`];
                if (url) {
                    missing.push({ id: trackId, url });
                } else {
                    console.warn(`Track "${trackId}" is used in audioSpans but has no local file and no download URL in audio_links.json`);
                }
            }
        }

        return missing;
    }

    function showAudioSetupMode(missingTracks: { id: string, url: string }[], chapterPath: string) {
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
            <div id="setup-progress" style="margin-top: 25px; font-size: 1.1rem; color: var(--accent-color); font-weight: 500;"></div>
        </div>
        `;

        const savedBrowser = localStorage.getItem('yt-dlp-browser') || '';
        const browserSelect = document.getElementById('reader-dl-browser') as HTMLSelectElement;
        if (browserSelect) browserSelect.value = savedBrowser;

        document.getElementById('btn-cancel-setup')?.addEventListener('click', () => {
            renderHome();
            updateChapterList();
        });

        document.getElementById('btn-dl-all-setup')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-dl-all-setup') as HTMLButtonElement;
            const progress = document.getElementById('setup-progress');
            if (!progress) return;

            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'wait';

            const browser = (document.getElementById('reader-dl-browser') as HTMLSelectElement).value;
            if (browser) localStorage.setItem('yt-dlp-browser', browser);
            else localStorage.removeItem('yt-dlp-browser');

            let successCount = 0;
            let hasErrors = false;
            for (let i = 0; i < missingTracks.length; i++) {
                const t = missingTracks[i];
                progress.textContent = `Downloading ${i + 1} of ${missingTracks.length}: ${t.id}...`;
                try {
                    const res = await window.electronAPI.downloadAudio(t.url, t.id, true, browser || undefined);
                    if (res.success) {
                        successCount++;
                    } else {
                        console.error('Failed to download', t.id, res.error);
                        hasErrors = true;
                    }
                } catch (e) {
                    console.error('Error downloading', t.id, e);
                    hasErrors = true;
                }
            }

            if (hasErrors) {
                progress.textContent = `Completed with errors. ${successCount}/${missingTracks.length} downloaded. Check console or try again.`;
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.textContent = "Retry Failed Tracks";
                return;
            }

            progress.textContent = `Download complete! ${successCount}/${missingTracks.length} tracks downloaded successfully.`;

            // Save downloaded track URLs to central audio_links.json
            for (const t of missingTracks) {
                centralAudioLinks[t.id] = t.url;
            }
            await window.electronAPI.saveAudioLinks(centralAudioLinks);

            setTimeout(async () => {
                // Reload chapter data — chapterPath may be a JSON file path or folder path
                document.body.style.cursor = 'wait';
                if (chapterPath.endsWith('.json')) {
                    currentChapterData = await window.electronAPI.loadChapterByFile(chapterPath);
                } else {
                    currentChapterData = await window.electronAPI.loadChapter(chapterPath);
                }
                centralAudioLinks = await window.electronAPI.loadAudioLinks();
                document.body.style.cursor = 'default';

                if (currentChapterData) {
                    if (currentChapterData.chapterData && currentChapterData.chapterData.regions.length > 0) {
                        startModeB();
                    } else {
                        startModeA();
                    }
                } else {
                    renderHome();
                    updateChapterList();
                }
            }, 1500);
        });
    }
}
