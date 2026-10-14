# 🎬 Cinematic Manga — Reader & Editor

> **Experience manga like a movie.** A desktop app that synchronizes region-specific soundtracks, cinematic panel transitions, and immersive blur reveals to transform static manga pages into a living cinematic experience.

[![Electron](https://img.shields.io/badge/Electron-40.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-ISC-blue)](LICENSE)

---

## ✨ What Is This?

Cinematic Manga is a **BYOC (Bring Your Own Content)** application — you supply your own manga images and audio files, and the app provides the tools to:

1. **Edit** — Draw regions on manga pages, assign audio tracks to panels, configure transition styles, and build chapter JSON files that define the entire cinematic experience.
2. **Read** — Play through chapters in **Cinematic Mode** (panel-by-panel with synced OST, fade/blur transitions, and auto-zoom) or **Standard Mode** (full-page scroll).
3. **Share** — Host your curated chapters on your local network or the public internet via a built-in Express server + Cloudflare Tunnel, with a self-contained web reader.

No manga content is bundled with this application. Users provide their own images and audio.

---

## 🧩 Features

### 📖 Reader
- **Cinematic Mode** — Panel-by-panel playback with synchronized audio, crossfade transitions between OST tracks, and three transition types:
  - **Sharp** — Instant crop & pan to each region
  - **Fade** — Smooth crossfade between panels
  - **Blur** — Full-page blur backdrop with a spotlight clip-path reveal on the active region (supports grouped blur regions with `keepPrevious` for progressive reveals)
- **Standard Mode** — Classic full-page reading with arrow key / click navigation
- **Zoom & Pan** — Scroll-wheel zoom anchored to cursor, pinch-to-zoom on trackpad, click-drag panning when zoomed in
- **Volume Control** — Global volume slider with per-track fade-in/fade-out during OST transitions
- **Auto Audio Setup** — Detects missing audio tracks on chapter load and offers one-click batch download via `yt-dlp` (with browser cookie support for bot bypass)
- **Chapter Complete Screen** — Cinematic end screen with "Read Again" and "Back to Library" actions

### ✏️ Editor
- **Region Drawing** — Rectangle and freeform polygon drawing tools on a canvas overlay
- **Drag & Resize** — Move and resize regions with mouse; right-click to cycle selection through overlapping regions
- **Region Ordering** — Set reading order, assign transition types, and configure blur groups
- **Audio Timeline** — Assign audio spans (tracks) to region ranges with start/end times and loop control
- **Image Configuration** — Per-image blur mode toggle and `keepPreviousVisible` flags
- **AI Panel Detection** — One-click auto-detection of manga panels via MagiV2 (local Python server) with overlap deduplication
- **Chapter Export** — Save chapter JSON to a dedicated chapters directory; supports chapter file migration from legacy layouts
- **Notification Log** — Persistent toast-style notification panel for tracking editor actions

### 🌐 Server & Sharing
- **Built-in Express Server** — Serves a self-contained web reader (all CSS/JS inline) with library browsing, chapter loading, and the full cinematic playback engine
- **Local Network** — Auto-detects LAN IP for sharing on your WiFi network
- **Cloudflare Tunnel** — One-click public URL generation via `cloudflared` (no account needed) for sharing with anyone on the internet
- **Server Dashboard** — Start/stop server, manage tunnel, copy URLs, and monitor active connections
- **Path Traversal Protection** — Validates all file paths to prevent directory traversal attacks

### 🤖 MagiV2 Integration
- Automatically starts and manages a local Python server running the MagiV2 manga panel detection model
- Health-check polling with status indicator in the editor toolbar
- Sends manga page images for AI-powered panel boundary detection
- Detected panels are added as regions with overlap deduplication against existing regions

---

## 📂 Content Structure

The app uses three user-configured directories:

```
📁 Manga Images Root/          ← Root folder you select
├── 📁 chapter_001/            ← One subfolder per chapter (names are flexible)
│   ├── cover.jpg              ← Optional cover image (or first image is used)
│   ├── page_001.jpg
│   ├── page_002.png
│   └── ...
├── 📁 chapter_002/
│   └── ...
│
📁 Audio Files/                ← All audio tracks (.mp3, .wav, .ogg)
├── ost_guts_theme.mp3
├── ost_battle.mp3
├── audio_links.json           ← Maps track IDs → download URLs
│
📁 Chapter JSONs/              ← Chapter definition files
├── chapter001.json            ← Regions, audio spans, transitions
├── chapter002.json
└── ...
```

Each **chapter JSON** contains:
- `regions` — Ordered list of panels with coordinates, shape types, transition types, blur groups
- `audioSpans` — Audio track assignments mapped to region order ranges with timing
- `imagesConfig` — Per-image settings (blur mode, keep-previous-visible)
- `imagesFolder` — Which image subfolder this chapter references

---

## 🎮 For Users

### Installation
1. Go to the [**Releases**](../../releases) page.
2. Download the latest `Manga with OST Setup X.X.X.exe`.
3. Run the installer — the app will be available from your Start Menu / Desktop.

### Quick Start
1. Launch the app → click **Launch Reader**.
2. On first run, you'll be asked to configure three directories (images, audio, chapters).
3. The library auto-loads all chapter subfolders from your images root.
4. Click any chapter card to start reading!
   - If the chapter has a `chapter.json` with regions → **Cinematic Mode** starts automatically.
   - If no chapter data exists → **Standard Mode** (full-page viewing).
5. Toggle between modes anytime via the toolbar button.

### Controls (Reader)
| Action | Input |
|---|---|
| Next panel/page | `←` Arrow, `Space`, or click left half |
| Previous panel/page | `→` Arrow or click right half |
| Zoom in/out | `+` / `-` or scroll wheel |
| Fit to view | `0` |
| Pan (when zoomed) | Click & drag, or two-finger scroll |
| Exit chapter | `Escape` |

---

## 💻 For Developers

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Python 3.10+](https://www.python.org/) (optional — only for MagiV2 AI panel detection)

### Setup
```bash
git clone https://github.com/kamaljama/Berserk_with_OST.git
cd Berserk_with_OST
npm install
```

### Development
```bash
npm run dev
```
This starts three concurrent processes:
1. **Vite** dev server (renderer hot-reload on `localhost:5173`)
2. **TypeScript** watcher for the main process
3. **Electron** app (waits for Vite, then launches)

### Building
```bash
npm run dist
```
Generates a standalone `.exe` installer in the `release/` directory.

### Project Structure
```
src/
├── main/                      # Electron main process
│   ├── main.ts                # App entry, window creation
│   ├── preload.ts             # Context bridge (IPC API)
│   ├── server.ts              # Express server + Cloudflare tunnel
│   ├── webReader.ts           # Self-contained web reader HTML generator
│   └── ipc/                   # IPC handlers
│       ├── chapter.ts         #   Chapter loading, saving, migration
│       ├── audio.ts           #   Audio download (yt-dlp), audio links
│       ├── directories.ts     #   User directory config
│       ├── magiv2.ts          #   MagiV2 server management & detection
│       └── serverIpc.ts       #   Server start/stop/tunnel IPC
├── renderer/                  # Electron renderer (Vite-bundled)
│   ├── main.ts                # Welcome screen, mode launcher
│   ├── editor/                # Chapter editor
│   │   ├── canvas.ts          #   Canvas rendering, region drawing
│   │   ├── regions.ts         #   Region list management
│   │   ├── audio.ts           #   Audio span editor
│   │   ├── sidebar.ts         #   Image list sidebar
│   │   ├── toolbar.ts         #   Toolbar + MagiV2 auto-detect
│   │   ├── player.ts          #   Audio player controls
│   │   ├── layout.ts          #   Editor HTML layout
│   │   └── state.ts           #   Editor state + event bus
│   ├── reader/                # Chapter reader
│   │   ├── engine.ts          #   Cinematic engine (Mode A & B)
│   │   ├── viewer.ts          #   Zoom/pan system, reader UI
│   │   ├── library.ts         #   Chapter library grid
│   │   ├── audio.ts           #   Audio track management
│   │   ├── setup.ts           #   Directory setup wizard
│   │   └── state.ts           #   Reader state
│   ├── server/                # Server dashboard
│   │   └── index.ts           #   Server control panel UI
│   ├── shared/                # Shared utilities
│   │   ├── toast.ts           #   Toast notification system
│   │   └── utils.ts           #   HTML escaping, helpers
│   └── styles/                # Modular CSS
│       ├── variables.css      #   Design tokens
│       ├── base.css           #   Reset, scrollbars, typography
│       └── ...                #   Component-specific styles
└── types/                     # Shared TypeScript types
    ├── models.ts              #   Chapter, Region, AudioSpan, etc.
    └── ipc.ts                 #   IPC channel type definitions
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Electron 40 + Vite 5 |
| **Language** | TypeScript (strict) |
| **UI** | Vanilla HTML/CSS — custom glassmorphic dark theme |
| **Fonts** | Inter + Outfit (Google Fonts) |
| **Server** | Express 5 (embedded in Electron main process) |
| **Tunnel** | Cloudflare `cloudflared` (via npx) |
| **Audio Download** | yt-dlp + ffmpeg-static |
| **AI Detection** | MagiV2 (Python, optional) |
| **Build** | electron-builder (NSIS installer) |

---

## 📜 License

ISC

---

## ⚠️ Disclaimer

This application is a **content-agnostic reader and editor tool**. It does not include, distribute, or host any copyrighted manga content. Users are solely responsible for ensuring they have the right to use any content they load into the application.
