
import "dotenv/config";

import { app, BrowserWindow, Menu, protocol, net } from "electron";
import { join, sep, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { Cause, Effect, Exit, Scope } from "effect";
import { logger } from "./logger";
import { mainRuntime, MainLive } from "./runtime.js";
import { stopMockServer } from "./features/mock-server";
import { registerIpcHandlers } from "./ipc";
import { loadQaTable } from "./features/mock-server/qa-loader";
import { startMockServer } from "./features/mock-server";
import { ensurePreinstalledSkills } from "./features/skills/skills-host";
import { registerSkillsIpc } from "./features/skills/ipc";
import { createMcpManager } from "./features/mcp/mcp-manager";
import { registerMcpIpcHandlers } from "./features/mcp/mcp-ipc";
import { createAutomationScheduler } from "./features/automations/scheduler";
import { registerAutomationIpc } from "./features/automations/ipc";

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
let mainScope: Scope.CloseableScope | null = null;

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

app.whenReady().then(() => {
  mainRuntime.runFork(
    Effect.scoped(
      Effect.fn("mainBoot")(function* () {
        // 捕获 boot scope,供 before-quit 统一 close
        mainScope = (yield* Effect.scope) as Scope.CloseableScope;

        Menu.setApplicationMenu(null);
        registerAppProtocol();
        registerIpcHandlers({ getMainWindow: () => mainWindow });
        registerSkillsIpc();
        loadQaTable();

        // mock-server:资源 finalizer 挂进 mainScope,close 时自动停
        startMockServer();
        yield* Effect.addFinalizer(() => Effect.promise(() => stopMockServer()));

        // ensurePreinstalledSkills:fork 出去跑,失败经 Cause 统一日志
        yield* Effect.forkScoped(
          ensurePreinstalledSkills().pipe(
            Effect.catchAllCause((cause) =>
              Effect.sync(() => logger.error("[skills-host] ensurePreinstalledSkills failed:", Cause.pretty(cause))),
            ),
          ),
        );

        const mcpManager = createMcpManager();
        registerMcpIpcHandlers(mcpManager);
        // mcp 资源 finalizer 挂进 mainScope
        yield* Effect.addFinalizer(() => Effect.promise(() => mcpManager.stopAll()));
        yield* mcpManager.startAll().pipe(
          Effect.catchAllCause((cause) =>
            Effect.sync(() => logger.error("[mcp] startAll failed:", Cause.pretty(cause))),
          ),
        );

        // Register automation IPC handlers
        registerAutomationIpc();

        // Start automation scheduler
        const scheduler = createAutomationScheduler();
        yield* scheduler.start().pipe(
          Effect.catchAllCause((cause) =>
            Effect.sync(() => logger.error("[scheduler] start failed:", Cause.pretty(cause))),
          ),
        );
        yield* Effect.addFinalizer(() => Effect.sync(() => scheduler.stop()));

        mainWindow = createMainWindow();

        // 保持 scope 存活直到 before-quit 显式 close
        yield* Effect.never;
      })().pipe(
        // mainRuntime 已提供 MainLive，但 TS 不会从 runFork 参数类型自动
        // 推断 R 收敛；显式 provide 让 inner Effect.gen 的 R 从
        // FileSystem | Path | SqliteClient 收敛到 never。
        Effect.provide(MainLive),
        Effect.catchAllCause((cause) =>
          Effect.sync(() => logger.error("[boot] boot sequence failed:", Cause.pretty(cause))),
        ),
      ),
    ),
  );
});

app.on("before-quit", () => {
  if (mainScope !== null) {
    mainRuntime.runFork(Scope.close(mainScope, Exit.void));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {app.quit();}
});

