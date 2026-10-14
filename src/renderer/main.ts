import { initEditor } from './editor';
import { initReader } from './reader';
import { initServerDashboard } from './server';

// Load Modular CSS
import './styles/variables.css';
import './styles/base.css';
import './styles/utilities.css';
import './styles/welcome.css';
import './styles/toast.css';
import './styles/editor-layout.css';
import './styles/editor-canvas.css';
import './styles/editor-toolbar.css';
import './styles/editor-lists.css';
import './styles/editor-audio.css';
import './styles/reader.css';
import './styles/server-dashboard.css';

const app = document.getElementById('app');

function renderWelcome() {
  if (!app) return;
  app.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-divider"></div>
      <h1 class="welcome-title"><span class="highlight">Cinematic</span> Manga</h1>
      <p class="welcome-subtitle">Reader &amp; Editor System</p>
      <div class="welcome-divider"></div>
      <div class="welcome-buttons">
        <button id="btn-editor" class="welcome-btn primary-btn">Launch Editor</button>
        <button id="btn-reader" class="welcome-btn">Launch Reader</button>
        <button id="btn-server" class="welcome-btn" style="border-color: var(--accent-color); color: var(--accent-color); background: rgba(229,9,20,0.1);">Launch Server</button>
      </div>
    </div>
  `;

  document.getElementById('btn-editor')?.addEventListener('click', () => {
    initEditor(app);
  });

  document.getElementById('btn-reader')?.addEventListener('click', () => {
    initReader(app);
  });

  document.getElementById('btn-server')?.addEventListener('click', () => {
    initServerDashboard(app);
  });
}

renderWelcome();
