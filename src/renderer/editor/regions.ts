import { state } from './state';
import { Region } from '../../types/models';

export function initRegions() {
    const regionList = document.getElementById('region-list') as HTMLUListElement;

    function imageNumFromId(imageId: string): number {
        const match = imageId.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : Infinity;
    }

    function addRegionAndReorder(newRegion: Region) {
        newRegion.order = 999999;
        state.regions.push(newRegion);

        state.regions.sort((a, b) => {
            const numA = imageNumFromId(a.imageId);
            const numB = imageNumFromId(b.imageId);
            if (numA !== numB) return numA - numB;
            return a.order - b.order;
        });

        const newIdx = state.regions.indexOf(newRegion);
        const assignedOrder = newIdx + 1;

        state.regions.forEach((r, idx) => r.order = idx + 1);

        state.audioSpans.forEach(span => {
            if (span.startRegionOrder >= assignedOrder) span.startRegionOrder++;
            if (span.endRegionOrder >= assignedOrder) span.endRegionOrder++;
        });
    }

    state.on('region:add', (region: Region) => {
        addRegionAndReorder(region);
        renderRegionList();
        state.emit('render:canvas');
        state.emit('render:audio'); // To update spans list if affected
    });

    function renderRegionList() {
        state.regions.sort((a, b) => {
            const numA = imageNumFromId(a.imageId);
            const numB = imageNumFromId(b.imageId);
            if (numA !== numB) return numA - numB;
            return a.order - b.order;
        });

        if (state.regions.length === 0) {
            regionList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">📐</span>
                <span class="empty-state-text">No regions yet.<br/>Draw on an image to create regions.</span>
              </div>`;
            return;
        }

        regionList.innerHTML = state.regions.map((r) => `
      <li class="region-item" data-transition="${r.transitionType || 'sharp'}">
        <div class="region-item-header">
          <div style="display: flex; align-items: center;">
            <span class="region-order">#${r.order}</span>
            <span class="region-image-id">${r.imageId}</span>
          </div>
          <button class="btn-delete btn-del-region" data-id="${r.id}">✕</button>
        </div>
        <div class="region-item-controls">
           <select class="region-transition-select" data-id="${r.id}">
              <option value="fade" ${r.transitionType === 'fade' ? 'selected' : ''}>Fade</option>
              <option value="sharp" ${(!r.transitionType || r.transitionType === 'sharp') ? 'selected' : ''}>Sharp</option>
              <option value="blur" ${r.transitionType === 'blur' ? 'selected' : ''}>Blur</option>
           </select>
           <input type="text" class="region-group-input" data-id="${r.id}" placeholder="Group" value="${r.blurGroupId || ''}" title="Blur Group ID" />
           ${r.transitionType === 'blur' ? `<label class="region-keep-label">
             <input type="checkbox" class="region-keep-prev" data-id="${r.id}" ${r.keepPrevious ? 'checked' : ''} /> Keep
           </label>` : ''}
        </div>
      </li>
    `).join('');

        document.querySelectorAll('.region-transition-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const id = (e.currentTarget as HTMLSelectElement).getAttribute('data-id');
                const val = (e.currentTarget as HTMLSelectElement).value as 'fade' | 'sharp' | 'blur';
                const reg = state.regions.find(r => r.id === id);
                if (reg) {
                    reg.transitionType = val;
                    renderRegionList();
                }
            });
        });

        document.querySelectorAll('.region-group-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const target = e.currentTarget as HTMLInputElement;
                const id = target.getAttribute('data-id');
                const val = target.value;
                const trimmedVal = val.trim();
                const reg = state.regions.find(r => r.id === id);
                if (reg) {
                    reg.blurGroupId = trimmedVal !== '' ? trimmedVal : undefined;

                    if (trimmedVal !== '') {
                        let needsRender = false;
                        if (reg.transitionType !== 'blur') {
                            reg.transitionType = 'blur';
                            needsRender = true;
                        }
                        if (!reg.keepPrevious) {
                            reg.keepPrevious = true;
                            needsRender = true;
                        }

                        if (needsRender) {
                            const cursorStart = target.selectionStart;
                            const cursorEnd = target.selectionEnd;

                            renderRegionList();
                            state.emit('render:canvas');

                            const newInput = document.querySelector(`.region-group-input[data-id="${id}"]`) as HTMLInputElement;
                            if (newInput) {
                                newInput.focus();
                                newInput.setSelectionRange(cursorStart, cursorEnd);
                            }
                        }
                    }
                }
            });
        });

        document.querySelectorAll('.region-keep-prev').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = (e.currentTarget as HTMLInputElement).getAttribute('data-id');
                const reg = state.regions.find(r => r.id === id);
                if (reg) {
                    reg.keepPrevious = (e.currentTarget as HTMLInputElement).checked;
                    renderRegionList();
                    state.emit('render:canvas');
                }
            });
        });

        document.querySelectorAll('.btn-del-region').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                const regToDelete = state.regions.find(r => r.id === id);
                const deletedOrder = regToDelete ? regToDelete.order : -1;

                state.regions = state.regions.filter(r => r.id !== id);
                state.regions.forEach((r, i) => r.order = i + 1);

                if (deletedOrder !== -1) {
                    state.audioSpans.forEach(span => {
                        if (span.startRegionOrder > deletedOrder) span.startRegionOrder--;
                        if (span.endRegionOrder >= deletedOrder) span.endRegionOrder--;
                    });
                }

                if (state.selectedRegionId === id) state.selectedRegionId = null;
                renderRegionList();
                state.emit('render:canvas');
                state.emit('render:audio');
            });
        });
    }

    state.on('render:regions', renderRegionList);
    // Initial render
    renderRegionList();
}
