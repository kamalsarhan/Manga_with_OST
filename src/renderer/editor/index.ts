import { editorLayoutHtml } from './layout';
import { initCanvas } from './canvas';
import { initSidebar } from './sidebar';
import { initRegions } from './regions';
import { initAudio } from './audio';
import { initToolbar } from './toolbar';
import { initPlayer } from './player';
import { getNotificationLog, onNotificationChange } from '../shared/toast';

export function initEditor(container: HTMLElement) {
    container.className = 'editor-layout';
    container.innerHTML = editorLayoutHtml;

    initCanvas();
    initToolbar();
    initSidebar();
    initRegions();
    initAudio();
    initPlayer();

    const notificationList = document.getElementById('notification-list');
    const renderNotifications = () => {
        if (!notificationList) return;
        const log = getNotificationLog();
        if (log.length === 0) {
            notificationList.innerHTML = `
              <div class="empty-state">
                <span class="empty-state-icon">🔔</span>
                <span class="empty-state-text">No notifications yet.</span>
              </div>`;
            return;
        }
        notificationList.innerHTML = log.map(n => {
            const timeStr = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return `
              <li class="list-item" style="display:flex; flex-direction:column; gap:4px; padding:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:bold; color: ${n.type === 'error' ? 'var(--accent, #e50914)' : n.type === 'success' ? '#4caf50' : '#00c8ff'};">
                    ${n.type.toUpperCase()}
                  </span>
                  <span style="font-size:0.8em; color:#888;">${timeStr}</span>
                </div>
                <div style="font-size:0.9em; word-break: break-word;">${n.message}</div>
              </li>
            `;
        }).join('');
    };
    
    onNotificationChange(renderNotifications);
    renderNotifications();
}
