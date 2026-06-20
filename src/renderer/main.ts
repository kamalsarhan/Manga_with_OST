import { initEditor } from './editor';
import { initReader } from './reader';
import './style.css';

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
      </div>
    </div>
  `;

  document.getElementById('btn-editor')?.addEventListener('click', () => {
    initEditor(app);
  });

  document.getElementById('btn-reader')?.addEventListener('click', () => {
    initReader(app);
  });
}

renderWelcome();
