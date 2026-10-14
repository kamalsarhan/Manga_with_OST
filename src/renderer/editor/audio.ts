import { state } from './state';
import { formatTime, parseTimeInput, escapeHtml } from '../shared/utils';
import { showToast } from '../shared/toast';

export function initAudio() {
    const audioSelect = document.getElementById('audio-select') as HTMLSelectElement;
    const playerTrackSel = document.getElementById('player-track-select') as HTMLSelectElement;
    const audioLibrarySearchInput = document.getElementById('audio-library-search') as HTMLInputElement;
    const spanList = document.getElementById('span-list') as HTMLUListElement;

    const audioStartTimeInput = document.getElementById('audio-start-time') as HTMLInputElement;
    const audioEndTimeInput = document.getElementById('audio-end-time') as HTMLInputElement;
    const audioStartTimeHint = document.getElementById('audio-start-time-hint') as HTMLSpanElement;
    const audioEndTimeHint = document.getElementById('audio-end-time-hint') as HTMLSpanElement;

    audioLibrarySearchInput?.addEventListener('input', () => {
        state.audioLibrarySearch = audioLibrarySearchInput.value;
        renderAudioLibrary();
    });

    function loadAudioPreview(trackName: string) {
        if (!state.workspace) return;
        const track = state.workspace.audio.find(a => a.name === trackName);
        if (!track) return;
        
        state.emit('player:load', track);
    }

    function selectAudioLibraryTrack(trackName: string) {
        if (!state.workspace) return;
        const track = state.workspace.audio.find(a => a.name === trackName);
        if (!track) return;

        state.selectedAudioLibraryTrack = track.name;
        audioSelect.value = track.name;

        const linkSelect = document.getElementById('link-audio-select') as HTMLSelectElement | null;
        if (linkSelect) linkSelect.value = track.name;

        loadAudioPreview(track.name);
        renderAudioLibrary();
    }

    function renderAudioUI() {
        if (!state.workspace) return;

        audioSelect.innerHTML = `<option value="">-- Select Track --</option><option value="silence">🔇 Silence</option>` +
            state.workspace.audio.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join('');
            
        const linkSelect = document.getElementById('link-audio-select') as HTMLSelectElement;
        linkSelect.innerHTML = `<option value="">-- Select Local Track --</option>` +
            state.workspace.audio.map(a => {
                const isLinked = !!state.audioSourceLinks[a.name];
                return `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)} ${isLinked ? '(🔗 Linked)' : '(❌ No Link)'}</option>`;
            }).join('');

        playerTrackSel.innerHTML = `<option value="">-- Select Track --</option>` +
            state.workspace.audio.map(a => `<option value="${escapeHtml(a.name)}" data-url="${escapeHtml(a.url)}">${escapeHtml(a.name)}</option>`).join('');

        if (state.selectedAudioLibraryTrack && state.workspace.audio.some(a => a.name === state.selectedAudioLibraryTrack)) {
            audioSelect.value = state.selectedAudioLibraryTrack;
            linkSelect.value = state.selectedAudioLibraryTrack;
            playerTrackSel.value = state.selectedAudioLibraryTrack;
        }

        renderAudioLibrary();
        renderSpanList();
        renderAudioLinkList();
    }

    function renderAudioLibrary() {
        const list = document.getElementById('audio-library-list');
        const count = document.getElementById('audio-library-count');
        if (!list || !count) return;

        if (!state.workspace) {
            count.textContent = '0 tracks';
            list.innerHTML = `
              <div class="empty-state audio-library-empty">
                <span class="empty-state-text">Open a workspace to browse audio</span>
              </div>`;
            return;
        }

        const query = state.audioLibrarySearch.trim().toLowerCase();
        const tracks = state.workspace.audio.filter(a => a.name.toLowerCase().includes(query));
        const total = state.workspace.audio.length;
        count.textContent = query
            ? `${tracks.length} of ${total} track${total === 1 ? '' : 's'}`
            : `${total} track${total === 1 ? '' : 's'}`;

        if (total === 0) {
            list.innerHTML = `
              <div class="empty-state audio-library-empty">
                <span class="empty-state-text">No audio files in workspace</span>
              </div>`;
            return;
        }

        if (tracks.length === 0) {
            list.innerHTML = `
              <div class="empty-state audio-library-empty">
                <span class="empty-state-text">No audio matches</span>
              </div>`;
            return;
        }

        list.innerHTML = tracks.map(track => {
            const isSelected = track.name === state.selectedAudioLibraryTrack;
            return `
              <li class="audio-library-track ${isSelected ? 'selected' : ''}" data-track="${escapeHtml(track.name)}" title="${escapeHtml(track.name)}">
                <span class="audio-library-track-name">${escapeHtml(track.name)}</span>
              </li>
            `;
        }).join('');

        list.querySelectorAll('.audio-library-track').forEach(item => {
            item.addEventListener('click', () => {
                const trackName = (item as HTMLElement).getAttribute('data-track');
                if (trackName) selectAudioLibraryTrack(trackName);
            });
        });
    }

    document.getElementById('btn-dl-audio')?.addEventListener('click', async () => {
        if (!state.workspace) return;
        const urlInput = document.getElementById('dl-audio-url') as HTMLInputElement;
        const prefixInput = document.getElementById('dl-audio-prefix') as HTMLInputElement;
        const url = urlInput.value.trim();
        const prefix = prefixInput.value.trim();
        const browser = (document.getElementById('dl-audio-browser') as HTMLSelectElement).value;

        if (browser) localStorage.setItem('yt-dlp-browser', browser);
        else localStorage.removeItem('yt-dlp-browser');

        if (!url) { showToast('Please provide a URL', 'error'); return; }

        showToast('Downloading audio... this may take a moment', 'info');
        document.body.style.cursor = 'wait';

        try {
            const res = await window.electronAPI.downloadAudio(url, prefix || undefined, false, browser || undefined);
            if (res.success && res.newTrack) {
                state.workspace.audio.push(res.newTrack);
                state.audioSourceLinks[res.newTrack.name] = url;

                const centralLinks = await window.electronAPI.loadAudioLinks();
                centralLinks[res.newTrack.name] = url;
                await window.electronAPI.saveAudioLinks(centralLinks);

                urlInput.value = '';
                prefixInput.value = '';
                renderAudioUI();
                showToast(`Downloaded successfully: ${res.newTrack.name}`, 'success');
            } else {
                showToast(`Download failed: ${res.error}`, 'error');
            }
        } catch (e: any) {
            showToast(`Error: ${e.message}`, 'error');
        } finally {
            document.body.style.cursor = 'default';
        }
    });

    document.getElementById('btn-set-audio-link')?.addEventListener('click', async () => {
        if (!state.workspace) return;
        const trackId = (document.getElementById('link-audio-select') as HTMLSelectElement).value;
        const url = (document.getElementById('link-audio-url') as HTMLInputElement).value.trim();
        if (!trackId || !url) { showToast('Please select a track and enter a URL', 'error'); return; }

        state.audioSourceLinks[trackId] = url;

        const centralLinks = await window.electronAPI.loadAudioLinks();
        centralLinks[trackId] = url;
        await window.electronAPI.saveAudioLinks(centralLinks);

        (document.getElementById('link-audio-url') as HTMLInputElement).value = '';
        renderAudioUI();
        showToast(`Link set for ${trackId}`, 'success');
    });

    function renderAudioLinkList() {
        const list = document.getElementById('audio-link-list');
        if (!list || !state.workspace) return;

        if (state.workspace.audio.length === 0) {
            list.innerHTML = `
              <div class="empty-state" style="padding: 12px;">
                <span class="empty-state-text">No audio files in workspace</span>
              </div>`;
            return;
        }

        list.innerHTML = state.workspace.audio.map(a => {
            const trackId = a.name;
            const linkUrl = state.audioSourceLinks[trackId];
            if (linkUrl) {
                return `
                <li class="list-item web-track-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" data-id="${escapeHtml(trackId)}">
                   <div>
                       <span class="web-track-name" style="color:var(--accent-gold)">🔗 ${escapeHtml(trackId)}</span>
                       <br><span style="color:#aaa;font-size:0.85em;word-break:break-all;" title="${escapeHtml(linkUrl)}">${escapeHtml(linkUrl)}</span>
                   </div>
                   <button class="btn-delete btn-del-audio-link" data-id="${escapeHtml(trackId)}">✕</button>
                </li>
                `;
            } else {
                return `
                <li class="list-item web-track-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" data-id="${escapeHtml(trackId)}">
                   <span class="web-track-name" style="color:#888;">❌ ${escapeHtml(trackId)} (No Link)</span>
                </li>
                `;
            }
        }).join('');

        document.querySelectorAll('.web-track-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).classList.contains('btn-del-audio-link')) return;

                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    const sel = document.getElementById('link-audio-select') as HTMLSelectElement;
                    const inp = document.getElementById('link-audio-url') as HTMLInputElement;
                    sel.value = id;
                    inp.value = state.audioSourceLinks[id] || '';
                    inp.focus();
                }
            });
        });

        document.querySelectorAll('.btn-del-audio-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id) {
                    delete state.audioSourceLinks[id];
                    renderAudioUI();
                }
            });
        });
    }

    audioStartTimeInput?.addEventListener('input', (e) => {
        const val = parseTimeInput((e.target as HTMLInputElement).value);
        if (audioStartTimeHint) audioStartTimeHint.textContent = isNaN(val) ? '0:00' : formatTime(val);
    });

    audioEndTimeInput?.addEventListener('input', (e) => {
        const val = parseTimeInput((e.target as HTMLInputElement).value);
        if (audioEndTimeHint) audioEndTimeHint.textContent = isNaN(val) ? '0:00' : formatTime(val);
    });

    document.getElementById('btn-add-span')?.addEventListener('click', () => {
        const trackId = audioSelect.value;
        const startOrder = parseInt((document.getElementById('audio-start-reg') as HTMLInputElement).value);
        const endOrder = parseInt((document.getElementById('audio-end-reg') as HTMLInputElement).value);
        let startTime = parseTimeInput((document.getElementById('audio-start-time') as HTMLInputElement).value);
        let endTime = parseTimeInput((document.getElementById('audio-end-time') as HTMLInputElement).value);
        const loop = (document.getElementById('audio-loop') as HTMLInputElement).checked;

        if (!trackId || isNaN(startOrder) || isNaN(endOrder)) { showToast('Invalid inputs', 'error'); return; }
        if (isNaN(startTime)) startTime = 0;
        if (isNaN(endTime)) endTime = 0;

        state.audioSpans.push({
            id: 'span-' + Date.now(),
            trackId,
            startRegionOrder: startOrder,
            endRegionOrder: endOrder,
            startTime,
            endTime,
            loop
        });
        renderSpanList();
        showToast('Audio span added', 'success');
    });

    function renderSpanList() {
        if (state.audioSpans.length === 0) {
            spanList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">🎵</span>
                <span class="empty-state-text">No audio spans yet.<br/>Add them in the Audio tab.</span>
              </div>`;
            return;
        }
        spanList.innerHTML = state.audioSpans.map(s => `
      <div class="span-card">
        <div class="span-header">
           <span>🎵 ${escapeHtml(s.trackId)}</span>
           <button class="btn-delete btn-del-span" data-id="${s.id}">✕</button>
        </div>
        <div class="span-details">
           <span>Regions: ${s.startRegionOrder} → ${s.endRegionOrder} | ${s.startTime}s (${formatTime(s.startTime)}) - ${s.endTime ? `${s.endTime}s (${formatTime(s.endTime)})` : 'end'}</span>
           <span>${s.loop ? '🔁 Loop' : 'Once'}</span>
        </div>
      </div>
    `).join('');

        document.querySelectorAll('.btn-del-span').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                state.audioSpans = state.audioSpans.filter(s => s.id !== id);
                renderSpanList();
            });
        });
    }

    state.on('render:audio', renderAudioUI);
    // Initial setup
    const savedBrowser = localStorage.getItem('yt-dlp-browser') || '';
    const browserSelect = document.getElementById('dl-audio-browser') as HTMLSelectElement;
    if (browserSelect) browserSelect.value = savedBrowser;
}
