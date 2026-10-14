import { renderHome } from './library';
import { teardownReaderInteractions } from './viewer';

export function renderSetup(container: HTMLElement) {
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
            renderHome(container);
        } else {
            alert('Failed to save directory configuration.');
        }
    });

    document.getElementById('btn-migrate')?.addEventListener('click', async () => {
        if (!selectedRoot || !selectedChapters) return;
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
