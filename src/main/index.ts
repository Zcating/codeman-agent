
import "dotenv/config";

import { app, BrowserWindow, Menu, protocol, net } from "electron";
import { join, sep, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc";
import { loadQaTable } from "./qa-loader";
import { startMockServer } from "./mock-server";
import { ensurePreinstalledSkills, registerSkillHandlers } from "./skills-host";
import { McpManager } from "./mcp-manager";
import { registerMcpIpcHandlers } from "./mcp-ipc";

const WORKER = process.env.CODEMAN_TEST_WORKER ?? "";

const USER_DATA = join(
  process.env.LOCALAPPDATA ?? process.env.HOME ?? process.cwd(),
  WORKER ? `codeman-agent.${WORKER}` : "codeman-agent",
);
app.setPath("userData", USER_DATA);

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

function appUrlToDistPath(urlString: string): string | null {
  let pathname: string;
  try {
    const u = new URL(urlString);
    pathname = u.pathname;
  } catch {
    return null;
  }
  const rel = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\/+/, "");
  const distDir = join(__dirname, "../../dist");
  const candidate = normalize(join(distDir, rel));
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
    if (process.platform === "darwin") {return;}
    e.preventDefault();
    win.minimize();
  });

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

	const mcpManager = new McpManager();
	registerMcpIpcHandlers(mcpManager);
	void mcpManager.startAll().catch((e) => {
		console.error("[mcp] startAll failed:", e);
	});
	app.on("before-quit", () => {
		void mcpManager.stopAll();
	});

	mainWindow = createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {app.quit();}
});

