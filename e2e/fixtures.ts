//! e2e/fixtures.ts — V3 Electron worker-scoped fixture.
//
// Per worker (Playwright parallelIndex):
//   - own spawn of dist-electron/win-unpacked/codeman-agent.exe (V3 Electron
//!     binary; built once via electron-builder --dir in globalSetup).
//   - own CDP port (BASE_ELECTRON_CDP_PORT + parallelIndex) for connectOverCDP.
//   - own CODEMAN_TEST_WORKER env var → V3 main process suffixes SQLite /
//     settings.json / window-state.json with `w{N}` so per-worker files
//!     don't collide (electron/main/index.ts::app.setPath + main process
//!     suffixes).
//   - own WEBVIEW2_USER_DATA_FOLDER for Chromium (Electron 43's Chromium 134)
//     state isolation. Electron 43 binary exposes --remote-debugging-port
//!     via WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS.
//
// ## Why spawn the V3 binary directly (not `electron-vite dev`)
// electron-vite dev doesn't produce a release binary. We spawn from
// release/win-unpacked/codeman-agent.exe — the same artifact users get
// after `pnpm run build:win`. This means e2e tests exercise the real
// packaging path (asar + native modules + Electron runtime) instead of
// dev mode. Per-worker isolation is purely via CODEMAN_TEST_WORKER env var.
//
// ## Lifecycle (auto: true, scope: "worker")
//   1. Worker starts → fixture setup runs:
//      a. Clean any stale per-worker Electron user data dir
//      b. Spawn codeman-agent.exe with CODEMAN_TEST_WORKER + CDP env vars
//      c. Wait for CDP endpoint on /json/version
//      d. Connect via connectOverCDP (cdp-driver.ts)
//   2. Specs run (sharing the same Electron instance within the worker)
//   3. Worker shuts down → fixture teardown runs:
//      a. Close CDP connection
//      b. SIGKILL the binary (SIGTERM can hang on Windows)
//      c. Remove per-worker Electron user data dir
//!
//! globalSetup (e2e/global-setup-warm.ts) runs `pnpm run build:dir` once
//! before workers spin up so the binary is ready.

import { test as base, expect, type WorkerInfo } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync, rmSync, createWriteStream, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir, homedir } from "node:os";

import { connectElectron, type ElectronPage } from "./cdp-driver";
import { BASE_PORTS } from "../playwright.config";

/** Per-worker environment passed to specs via the `tauriEnv` fixture.
 *  Renamed to `electronEnv` in V3 — both names exported as the same type. */
export type ElectronEnv = {
  page: ElectronPage;
  workerIndex: number;
  cdpUrl: string;
  workerDataDir: string;
};
/** V2 name preserved — same shape as ElectronEnv (per-worker V3 Electron instance). */
export type TauriEnv = ElectronEnv;

/**
 * V3 Electron binary path. Two resolution modes:
 *   1. If `release/win-unpacked/codeman-agent.exe` exists (from `pnpm run build:dir`),
 *      use that (full asar-packaged release).
 *   2. Otherwise, fall back to the local `node_modules/electron/dist/electron.exe`
 *      pointing to `dist-electron/main/index.js`. This is the dev-mode shortcut
 *      when `electron-builder --dir` is blocked (e.g., icon download offline).
 */
const PACKAGED_BIN = resolve(
  process.cwd(),
  "release",
  "win-unpacked",
  process.platform === "win32" ? "codeman-agent.exe" : "codeman-agent",
);
const LOCAL_BIN = resolve(
  process.cwd(),
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
const ELECTRON_BIN = existsSync(PACKAGED_BIN) ? PACKAGED_BIN : LOCAL_BIN;

/** Optional app entry point for LOCAL_BIN mode. The packaged binary embeds its own entry. */
const APP_ENTRY = existsSync(PACKAGED_BIN)
  ? null
  : resolve(process.cwd(), "dist-electron", "main", "index.js");

/**
 * Port the shared Vite dev server (1420) is NOT used in V3 — Electron loads
 * the bundled renderer via file:// (no dev server in test). Removed V2's
 * STATIC_SERVER_PORT_FOR_WORKER.
 */

/** Wait for a URL to respond OK (or 404, which is fine for /json/version probes). */
async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 404) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(500);
  }
  throw new Error(
    `Timed out waiting for ${url} after ${timeoutMs}ms (last error: ${String(lastErr)})`,
  );
}

export const test = base.extend<{}, { tauriEnv: ElectronEnv; electronEnv: ElectronEnv }>({
  tauriEnv: [
    async ({}, use, workerInfo: WorkerInfo) => {
      const idx = workerInfo.parallelIndex;
      const cdpPort = BASE_PORTS.BASE_ELECTRON_CDP_PORT + idx;
      const cdpUrl = `http://127.0.0.1:${cdpPort}`;
      const userDataDir = join(tmpdir(), `codeman-e2e-w${idx}`);
      const logPath = join(userDataDir, "electron.log");

      // 1. Clean stale Electron user data from previous run.
      //    V3 main process (electron/main/index.ts) sets app.getPath('userData')
      //    via app.setPath to LOCALAPPDATA/codeman-agent.
      rmSync(userDataDir, { recursive: true, force: true });
      mkdirSync(userDataDir, { recursive: true });

      // 1b. Clean per-worker Electron app data dir.  The main process now
      //     uses CODEMAN_TEST_WORKER to suffix its userData path (see
      //     electron/main/index.ts), so data lives under
      //     codeman-agent.w{idx}/.  Clean the entire per-worker dir so
      //     SQLite, settings, and window-state are pristine.
      const electronAppData = join(
        process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"),
        `codeman-agent.w${idx}`,
      );
      try {
        rmSync(electronAppData, { recursive: true, force: true });
      } catch {
        // ignore
      }

      // 2. Spawn the V3 Electron binary directly with per-worker env vars.
      //    When using the local (non-packaged) Electron binary, pass the app entry
      //    point as the first non-flag argument.
      const args = [`--remote-debugging-port=${cdpPort}`];
      if (APP_ENTRY) args.push(APP_ENTRY);

      const child: ChildProcess = spawn(
        ELECTRON_BIN,
        args,
        {
          env: {
            ...process.env,
            CODEMAN_TEST_WORKER: `w${idx}`,
            ELECTRON_DISABLE_GPU: "1",
            ELECTRON_NO_ATTACH_CONSOLE: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
          cwd: process.cwd(),
        },
      );

      // Mirror stdout/stderr to per-worker log.
      const logStream = createWriteStream(logPath);
      child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk));
      child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk));

      let electronExitCode: number | null = null;
      child.once("exit", (code) => {
        electronExitCode = code;
      });

      try {
        // 3. Wait for CDP endpoint.
        await waitForUrl(`${cdpUrl}/json/version`, 60_000);

        // 4. Connect via CDP. V3 loads bundled renderer via file://.
        const page = await connectElectron({
          cdpUrl,
          pageUrlPattern: /file:\/\/.*index\.html|.*index\.html$/,
        });

        // Diagnostic probe — log so we can debug multi-worker setup.
        try {
          const probe = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            bodyChars: document.body?.innerText?.length ?? 0,
            bodySample: document.body?.innerText?.slice(0, 200) ?? "",
            asideExists: !!document.querySelector("aside"),
            codemanExists: !!(window as unknown as { codeman?: unknown }).codeman,
            codemanKeys: (window as unknown as { codeman?: { [k: string]: unknown } }).codeman
              ? Object.keys((window as unknown as { codeman: { [k: string]: unknown } }).codeman).length
              : 0,
          }));
          console.log(
            `[tauriEnv w${idx}] page probe: ${JSON.stringify(probe)}`,
          );
        } catch (probeErr) {
          console.log(
            `[tauriEnv w${idx}] page probe failed: ${String(probeErr)}`,
          );
        }

        const env: ElectronEnv = {
          page,
          workerIndex: idx,
          cdpUrl,
          workerDataDir: userDataDir,
        };

        await use(env);
      } catch (e) {
        if (electronExitCode !== null) {
          throw new Error(
            `Electron exited with code ${electronExitCode} before fixtures ready. ` +
              `Log: ${logPath}\nOriginal error: ${String(e)}`,
          );
        }
        throw e;
      } finally {
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
        await sleep(500);
        try {
          logStream.end();
        } catch {
          // ignore
        }
        console.log(`[tauriEnv w${idx}] log preserved at ${logPath}`);
      }
    },
    { scope: "worker", auto: true },
  ],
  // V3 alias for `tauriEnv` — same data, V3 spec files may prefer this name.
  electronEnv: [
    async ({ tauriEnv }, use) => {
      await use(tauriEnv);
    },
    { scope: "worker", auto: false },
  ],
});

export { expect };

// Re-export common helpers from helpers.ts so specs can import everything
// from a single entry point. Note: V3 helpers.ts still has V2 Tauri helpers;
// follow-up commits update individual helpers for V3 IPC surface
// (window.codeman instead of @tauri-apps/api/core invoke).
export {
  invoke,
  assert,
  cancelRunningAgent,
  clearAllHistory,
  clickNewConversationAndWait,
  disposeTauriPage,
  expandWorkspace,
  getTauriPage,
  nthConv,
  resetChatState,
  resetSidebar,
  setupWorkspaceAndCreateConvViaIpc,
  submitForm,
  submitHomeAgentForm,
} from "./helpers";
// Type-only re-exports (V2 deprecated aliases for ElectronLocator / ElectronPage).
export type { TauriLocator, TauriPage } from "./helpers";