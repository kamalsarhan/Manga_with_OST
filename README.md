# Manga with OST - Cinematic Reader & Editor

A premium desktop application built to create and experience manga like a movie—with synchronized, region-specific soundtracks, cinematic transitions, and a sleek, glassmorphic UI.

---

## 🎮 For Users (How to Play)

If you just want to experience the cinematic chapters, you don't need any coding experience!

### Installation
1. Go to the **Releases** section on the right side of this GitHub page.
2. Download the latest installer: `Manga with OST Setup X.X.X.exe`.
3. Double-click the `.exe` file to install the application.
4. Launch "Manga with OST" from your desktop or start menu.

### How to Use
1. Open the application and click **"Select Chapters Folder"**.
2. Choose the folder on your computer that contains your prepared chapter folders.
3. The app will automatically load your library. Click on any chapter cover to start the cinematic experience!

---

## 💻 For Developers (How to Build/Contribute)

If you want to view the source code, build the app yourself, or contribute new features:

### Prerequisites
You must have [Node.js](https://nodejs.org/) installed on your computer.

### Setup Instructions
1. **Clone the repository:**
   ```bash
   git clone https://github.com/kamalsarhan/Berserk_with_OST.git
   cd Berserk_with_OST
   ```

2. **Install all dependencies:**
   *(Note: This downloads the required libraries natively for your operating system).*
   ```bash
   npm install
   ```

3. **Run in Development Mode:**
   This starts the application with hot-reloading (changes to the code will update the app instantly).
   ```bash
   npm run dev
   ```

### Building the Final App
To compile the code and generate a standalone `.exe` installer (like the one in the Releases tab):
```bash
npm run dist
```
Once the command finishes, you will find the installer inside the newly created `release/` folder.

---

## ⚙️ Tech Stack
*   **Framework:** Electron + Vite
*   **UI/Styling:** Raw HTML/CSS with a custom Glassmorphic Dark Theme
*   **Logic:** TypeScript (Vanilla JS)
