export const editorLayoutHtml = `
<div class="editor-inner">
  <!-- Left Sidebar -->
  <div class="sidebar sidebar-left" id="sidebar-left">
    <div class="sidebar-header">
      <button id="btn-open">Open Dir</button>
      <button id="btn-save" class="primary">Save</button>
      <button id="btn-export">Export</button>
    </div>
    <div class="sidebar-content">
      <h3>Panels</h3>
      <ul id="image-list" class="item-list"></ul>
    </div>
  </div>

  <!-- Left Resize Handle -->
  <div class="resize-handle resize-handle-left" id="resize-left"></div>

  <!-- Center -->
  <div class="editor-center" id="editor-center">
    <div class="editor-toolbar">
      <span class="toolbar-tip" id="toolbar-tip">Drag to create region · Right-click to select</span>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button id="btn-mode-rect" class="btn-toggle on" title="Rectangle Tool">Rect</button>
        <button id="btn-mode-poly" class="btn-toggle" title="Polygon Tool">Poly</button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group magiv2-group">
        <button id="btn-auto-detect" class="btn-magiv2" title="Auto-detect panels using MagiV2 AI">
          <span class="magiv2-btn-icon">🤖</span>
          <span class="magiv2-btn-text">Auto Detect</span>
          <span class="magiv2-spinner" id="magiv2-spinner"></span>
        </button>
        <span class="magiv2-status" id="magiv2-status" title="MagiV2 Server Status">●</span>
      </div>

      <div class="toolbar-separator"></div>
      <div class="toolbar-zoom">
        <button id="btn-zoom-out" title="Zoom Out">−</button>
        <span id="zoom-label">66%</span>
        <button id="btn-zoom-in" title="Zoom In">+</button>
        <button id="btn-zoom-reset" title="Fit to View">Fit</button>
      </div>
      <div class="toolbar-separator"></div>
      <button id="btn-toggle-audio" class="btn-toolbar-icon" title="Toggle Audio Panel">🎵</button>
      <button id="btn-home" title="Back to Home">⌂ Home</button>
    </div>
    <div class="canvas-area" id="canvas-area">
      <div class="canvas-stage" id="canvas-stage">
        <div class="canvas-wrapper" id="canvas-wrapper">
           <img id="main-image" />
           <canvas id="region-canvas"></canvas>
        </div>
      </div>
    </div>
    <!-- Audio Player Panel -->
    <div class="audio-panel" id="audio-panel">
      <div class="audio-panel-inner">
        <select id="player-track-select" class="player-track-select">
          <option value="">-- Select Track --</option>
        </select>
        <div class="player-controls">
          <button id="btn-play" class="player-btn" title="Play">▶</button>
          <button id="btn-pause" class="player-btn" title="Pause">⏸</button>
          <button id="btn-stop" class="player-btn" title="Stop">⏹</button>
        </div>
        <div class="player-seek-row">
          <span id="player-time">0:00</span>
          <input type="range" id="player-seek" class="player-seek" value="0" min="0" max="100" step="0.1" />
          <span id="player-duration">0:00</span>
        </div>
        <div class="player-vol-row">
          <span class="vol-label">🔊</span>
          <input type="range" id="player-volume" class="player-volume" value="80" min="0" max="100" />
          <label class="loop-label"><input type="checkbox" id="player-loop" /> Loop</label>
        </div>
        <audio id="audio-element"></audio>
      </div>
    </div>
  </div>

  <!-- Right Resize Handle -->
  <div class="resize-handle resize-handle-right" id="resize-right"></div>

  <!-- Right Sidebar — Tabbed -->
  <div class="sidebar sidebar-right" id="sidebar-right">
    <div class="sidebar-tabs">
      <button class="sidebar-tab active" data-tab="regions">📐 Regions</button>
      <button class="sidebar-tab" data-tab="audio">🎵 Audio</button>
      <button class="sidebar-tab" data-tab="timeline">📋 Timeline</button>
      <button class="sidebar-tab" data-tab="notifications">🔔 Notifications</button>
    </div>

    <!-- Tab: Regions -->
    <div class="tab-content active" id="tab-regions">
      <h3>Regions</h3>
      <ul id="region-list" class="item-list region-list"></ul>
    </div>

    <!-- Tab: Audio -->
    <div class="tab-content" id="tab-audio">
      <h3>Audio Library</h3>
      <div class="audio-library-panel">
         <input type="search" id="audio-library-search" class="audio-library-search" placeholder="Search local audio" />
         <div id="audio-library-count" class="audio-library-count">0 tracks</div>
         <ul id="audio-library-list" class="audio-library-list"></ul>
      </div>

      <h3>Add Audio Span</h3>
      <div class="audio-span-form">
         <div class="form-row-full">
           <select id="audio-select" class="w-full"></select>
         </div>
         <div class="form-row">
           <input type="number" id="audio-start-reg" placeholder="Start Reg" />
           <input type="number" id="audio-end-reg" placeholder="End Reg" />
         </div>
         <div class="form-row">
           <div style="position: relative; width: 100%;">
             <input type="text" id="audio-start-time" placeholder="Start Time (s or m:s)" style="width: 100%; padding-right: 35px; box-sizing: border-box;" />
             <span id="audio-start-time-hint" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); pointer-events: none;">0:00</span>
           </div>
           <div style="position: relative; width: 100%;">
             <input type="text" id="audio-end-time" placeholder="End Time (s or m:s)" style="width: 100%; padding-right: 35px; box-sizing: border-box;" />
             <span id="audio-end-time-hint" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); pointer-events: none;">0:00</span>
           </div>
         </div>
         <label class="form-checkbox-label">
           <input type="checkbox" id="audio-loop" /> Loop Audio
         </label>
         <button id="btn-add-span" class="btn-add">Add Audio Span</button>
      </div>

      <h3 class="mt-md">Download Audio</h3>
      <div class="web-audio-form">
         <input type="text" id="dl-audio-url" placeholder="URL (SoundCloud, YouTube, etc)" />
         <input type="text" id="dl-audio-prefix" placeholder="File Prefix (optional)" />
         <select id="dl-audio-browser" title="Browser for Cookies (Bot Bypass)">
           <option value="">No Cookies (Default)</option>
           <option value="chrome">Chrome</option>
           <option value="edge">Edge</option>
           <option value="firefox">Firefox</option>
           <option value="brave">Brave</option>
           <option value="opera">Opera</option>
           <option value="safari">Safari</option>
           <option value="vivaldi">Vivaldi</option>
         </select>
         <button id="btn-dl-audio" class="btn-add btn-add-blue">Download & Add</button>
      </div>

      <h3 class="mt-md">Set Web Link for Local Track</h3>
      <div class="web-audio-form">
         <select id="link-audio-select" class="w-full"></select>
         <input type="text" id="link-audio-url" placeholder="Web URL Source" />
         <button id="btn-set-audio-link" class="btn-add btn-add-blue">Set Link</button>
         <ul id="audio-link-list" class="item-list mt-md"></ul>
      </div>
    </div>

    <!-- Tab: Timeline -->
    <div class="tab-content" id="tab-timeline">
      <h3>Audio Timeline</h3>
      <ul id="span-list" class="item-list"></ul>
    </div>

    <!-- Tab: Notifications -->
    <div class="tab-content" id="tab-notifications">
      <h3>Notifications</h3>
      <ul id="notification-list" class="item-list"></ul>
    </div>
  </div>
</div>
`;
