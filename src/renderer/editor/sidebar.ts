import { state } from './state';
import { FileData } from '../../types/ipc';
import { Chapter } from '../../types/models';
import { showToast } from '../shared/toast';

export function initSidebar() {
    const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
    const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
    const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
    const imageList = document.getElementById('image-list') as HTMLUListElement;

    function makeResizable(handleId: string, sidebarId: string, side: 'left' | 'right') {
        const handle = document.getElementById(handleId) as HTMLElement;
        const sidebar = document.getElementById(sidebarId) as HTMLElement;
        let dragging = false;
        let startMouseX = 0;
        let startWidth = 0;

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            startMouseX = e.clientX;
            startWidth = sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const diff = side === 'left' ? e.clientX - startMouseX : startMouseX - e.clientX;
            const newWidth = Math.min(550, Math.max(150, startWidth + diff));
            sidebar.style.width = newWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    makeResizable('resize-left', 'sidebar-left', 'left');
    makeResizable('resize-right', 'sidebar-right', 'right');

    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab') as 'regions' | 'audio' | 'timeline' | 'notifications';
            state.activeTab = tabId;
            document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`)?.classList.add('active');
        });
    });

    function renderSidebar() {
        if (!state.workspace) {
            imageList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">📂</span>
                <span class="empty-state-text">Open a directory to<br/>load manga images</span>
              </div>`;
            return;
        }
        imageList.innerHTML = state.workspace.images.map(img => {
            const isBlur = state.imagesConfig[img.name]?.blurMode;
            const isKeepPrev = state.imagesConfig[img.name]?.keepPreviousVisible;
            return `
      <li class="list-item img-item" data-id="${img.name}" data-url="${img.url}">
        <span class="img-item-name">${img.name}</span>
        <div class="img-item-controls">
          <button class="btn-toggle btn-blur-toggle ${isBlur ? 'on' : ''}" data-id="${img.name}" title="Toggle Blur Mode for Entire Image">${isBlur ? 'Blur: ON' : 'Blur'}</button>
          ${isBlur ? `<button class="btn-toggle btn-keep-prev-toggle ${isKeepPrev ? 'on' : ''}" data-id="${img.name}" title="Keep Previous Regions Visible">${isKeepPrev ? 'Keep: ON' : 'Keep'}</button>` : ''}
        </div>
      </li>
    `}).join('');

        document.querySelectorAll('.btn-blur-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    if (!state.imagesConfig[id]) state.imagesConfig[id] = {};
                    state.imagesConfig[id].blurMode = !state.imagesConfig[id].blurMode;
                    renderSidebar();
                }
            });
        });

        document.querySelectorAll('.btn-keep-prev-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    if (!state.imagesConfig[id]) state.imagesConfig[id] = {};
                    state.imagesConfig[id].keepPreviousVisible = !state.imagesConfig[id].keepPreviousVisible;
                    renderSidebar();
                }
            });
        });

        document.querySelectorAll('.img-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.img-item').forEach(el => el.classList.remove('selected'));
                const target = e.currentTarget as HTMLElement;
                target.classList.add('selected');
                const url = target.getAttribute('data-url');
                const id = target.getAttribute('data-id');
                if (url && id) {
                    state.currentImage = state.workspace?.images.find((i: FileData) => i.name === id) || null;
                    const mainImage = document.getElementById('main-image') as HTMLImageElement;
                    mainImage.src = url;
                    // Note: image onload is handled by the canvas module but we emit an event
                    mainImage.onload = () => {
                        state.emit('image:loaded');
                    };
                }
            });
        });
    }

    state.on('render:sidebar', renderSidebar);

    btnOpen.addEventListener('click', async () => {
        const data = await window.electronAPI.selectWorkspace();
        if (data) {
            state.workspace = data;
            state.currentImage = null;
            state.selectedAudioLibraryTrack = null;
            state.regions = data.chapterData?.regions || [];
            state.audioSpans = data.chapterData?.audioSpans || [];
            state.imagesConfig = data.chapterData?.imagesConfig || {};
            state.audioSourceLinks = data.chapterData?.audioSourceLinks || {};
            const centralLinks = await window.electronAPI.loadAudioLinks() as Record<string, string>;
            for (const [k, v] of Object.entries(centralLinks)) {
                if (!state.audioSourceLinks[k]) state.audioSourceLinks[k] = v as string;
            }
            state.emit('render:sidebar');
            state.emit('render:regions');
            state.emit('render:audio');
            showToast('Workspace loaded', 'success');
        }
    });

    btnSave.addEventListener('click', async () => {
        if (!state.workspace) return;
        const folderName = state.workspace.workspacePath.split(/[\\/]/).pop() || '';
        const chapter: Chapter = { version: "1.0", imagesFolder: folderName, regions: state.regions, audioSpans: state.audioSpans, imagesConfig: state.imagesConfig, audioSourceLinks: state.audioSourceLinks };
        state.workspace.chapterData = chapter;
        const success = await window.electronAPI.saveChapter(state.workspace.workspacePath, chapter, state.workspace.chapterJsonPath);
        if (success) {
            showToast('Saved to chapters directory!', 'success');
        } else {
            showToast('Save failed', 'error');
        }
    });

    btnExport.addEventListener('click', async () => {
        if (!state.workspace) return;
        const folderName = state.workspace.workspacePath.split(/[\\/]/).pop() || '';
        const chapter: Chapter = { version: "1.0", imagesFolder: folderName, regions: state.regions, audioSpans: state.audioSpans, imagesConfig: state.imagesConfig, audioSourceLinks: state.audioSourceLinks };
        await window.electronAPI.saveChapter(state.workspace.workspacePath, chapter, state.workspace.chapterJsonPath);
        const success = await window.electronAPI.exportChapter(state.workspace.workspacePath);
        if (success) {
            showToast('Exported successfully!', 'success');
        } else {
            showToast('Export failed', 'error');
        }
    });

    renderSidebar();
}
