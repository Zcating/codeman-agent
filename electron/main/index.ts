// T3 — electron/main/index.ts: Electron main entry.
//
// Per V3 consensus 1.6: app.setPath('userData', LOCALAPPDATA/codeman-agent)
// MUST be the first executable statement (before any other runtime import
// that might transitively call app.getPath('userData') — e.g. electron-store,
// electron-log, electron-window-state lazy init).
//
// V3 e2e fix: register `app://` custom protocol handler so the renderer loads
// from a clean `app://./index.html` URL instead of `file:///C:/.../index.html`.
// TanStack Router's createBrowserHistory reads window.location.pathname which
// on file:// is the absolute Windows path and never matches the `/` route.
//
// ─── .env loading ──────────────────────────────────────────────────────────
// `import "dotenv/config"` runs as a side-effect import, BEFORE any other
// import in this file. It populates `process.env` from the repo-root `.env`
// (per `dotenv` default lookup at `process.cwd()/.env`). It does NOT touch
// electron's `app` namespace, so the V3 `app.setPath`-first constraint above
// is preserved (the constraint applies to imports that transitively call
// `app.getPath('userData')` — dotenv has no such dependency). Shell-exported
// env vars WIN over `.env` values (`dotenv` default: never overwrite existing
// `process.env` keys). Missing `.env` is silently ignored.

import "dotenv/config";

import { app, BrowserWindow, Menu, protocol, net } from "electron";
import { join, sep, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc";
import { loadQaTable } from "./qa-loader";
import { startMockServer } from "./mock-server";
import { ensurePreinstalledSkills, registerSkillHandlers } from "./skills-host";

// Worker suffix for e2e parallel workers (CODEMAN_TEST_WORKER = w0, w1, …).
// When set, paths are suffixed (codeman-agent.w0, codeman-agent.w1) so
// parallel Electron instances don't share SQLite / settings / window-state.
const WORKER = process.env.CODEMAN_TEST_WORKER ?? "";

const USER_DATA = join(
  process.env.LOCALAPPDATA ?? process.env.HOME ?? process.cwd(),
  WORKER ? `codeman-agent.${WORKER}` : "codeman-agent",
);
app.setPath("userData", USER_DATA);

// Register `app://` scheme as privileged (secure, standard, fetch API) BEFORE
// app is ready. Without this, `fetch()` and `History.pushState` are blocked
// on the custom scheme.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

/** Resolve `app://./foo` to a file path under dist/ (the renderer output). */
function appUrlToDistPath(urlString: string): string | null {
  let pathname: string;
  try {
    const u = new URL(urlString);
    pathname = u.pathname;
  } catch {
    return null;
  }
  // Map "/" → "index.html"; anything else → relative file under dist/
  const rel = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\/+/, "");
  const distDir = join(__dirname, "../../dist");
  const candidate = normalize(join(distDir, rel));
  // Path traversal guard: must stay inside distDir
  if (!candidate.startsWith(normalize(distDir) + sep) && candidate !== normalize(distDir)) {
    return null;
  }
  return candidate;
}

function registerAppProtocol(): void {
  protocol.handle("app", (request) => {
    const filePath = appUrlToDistPath(request.url);
    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }
    // Use net.fetch for proper streaming + range support + MIME inference.
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: "Codeman",
    show: false,
    webPreferences: {
      preload: (() => {
        const base = join(__dirname, "../preload/index");
        for (const ext of [".mjs", ".js"]) {
          try {
            require("node:fs").accessSync(base + ext);
            return base + ext;
          } catch {
            // try next
          }
        }
        return base + ".mjs";
      })(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.openDevTools({ mode: "detach" });

  win.once("ready-to-show", () => win.show());

  win.on("close", (e) => {
    if (process.platform === "darwin") return;
    e.preventDefault();
    win.minimize();
  });

  // Load renderer via custom `app://` protocol — clean URL for TanStack Router.
  // Load `app://./` (path "/") so the router's createBrowserHistory sees
  // pathname "/" and matches the home route. The app:// protocol handler maps
  // "/" → dist/index.html.
  // Dev server override: use the dev URL if ELECTRON_RENDERER_URL is set.
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadURL("app://./");
  }

  return win;
}

function buildAppMenu(): void {

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
	registerAppProtocol();
	buildAppMenu();
	registerIpcHandlers({ getMainWindow: () => mainWindow });
	registerSkillHandlers();
	loadQaTable();
	startMockServer();
	void ensurePreinstalledSkills().catch((e) => {
		console.error("[skills-host] ensurePreinstalledSkills failed:", e);
	});
	mainWindow = createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

