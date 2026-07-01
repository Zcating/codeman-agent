// T3 — electron/main/index.ts: Electron main entry.
//
// Per V3 consensus 1.6: app.setPath('userData', LOCALAPPDATA/codeman-agent)
// MUST be the first executable statement (before any other runtime import
// that might transitively call app.getPath('userData') — e.g. electron-store,
// electron-log, electron-window-state lazy init).
//
// TDD-exempt: orchestration glue, tested via e2e in T7.

import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc";

const USER_DATA = join(
  process.env.LOCALAPPDATA ?? process.env.HOME ?? process.cwd(),
  "codeman-agent",
);
app.setPath("userData", USER_DATA);

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  // T4b will swap this for electron-window-state (remember position/size).
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    title: "codeman-agent",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs Node 'electron' module
    },
  });

  win.once("ready-to-show", () => win.show());

  // Close → minimize to taskbar (V2 parity per ADR-0007).
  win.on("close", (e) => {
    if (process.platform === "darwin") return;
    e.preventDefault();
    win.minimize();
  });

  // Load renderer — dev server URL or built dist/index.html.
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../../dist/index.html"));
  }

  return win;
}

function buildAppMenu(): void {
  // File → Quit (CmdOrCtrl+Q). Mirrors V2 Tauri menu.
  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => app.exit(0),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  buildAppMenu();
  registerIpcHandlers({ getMainWindow: () => mainWindow });
  mainWindow = createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

