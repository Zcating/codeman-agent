//! e2e/fixtures.ts — worker-scoped Tauri fixture.
//!
//! Each Playwright worker gets its own fully-isolated Tauri instance:
//!   - own CDP port (BASE_TAURI_DRIVER_PORT + parallelIndex)
//!   - own CODEMAN_TEST_WORKER env var → Rust suffixes SQLite / settings.json /
//!     window-state.json with `w{N}` so files don't collide (see
//!     src-tauri/src/lib.rs::test_worker_suffix)
//!   - own WEBVIEW2_USER_DATA_FOLDER so WebView2's internal state
//!     (cookies, IndexedDB, cache) doesn't collide either
//!
//! ## Why spawn the binary directly (not `tauri dev`)
//! The compiled `codeman-agent.exe` reads `frontendDist` via Tauri's `tauri://`
//! asset protocol — no dev server, no Vite, no port collision. Per-worker
//! isolation is purely via `CODEMAN_TEST_WORKER` env var. This is much simpler
//! and more reliable than going through `tauri dev --config <merged.json>`,
//! which (a) doesn't override the embedded identifier at runtime, and (b)
//! makes Tauri's dev server port juggling fragile.
//!
//! ## Lifecycle (auto: true, scope: "worker")
//!   1. Worker starts → fixture setup runs:
//!      a. Clean any stale per-worker WebView2 dir
//!      b. Spawn `codeman-agent.exe` with CODEMAN_TEST_WORKER + CDP env vars
//!      c. Wait for CDP endpoint
//!      d. Connect via connectOverCDP (cdp-driver.ts)
//!   2. Specs run (sharing the same Tauri instance within the worker)
//!   3. Worker shuts down → fixture teardown runs:
//!      a. Close CDP connection
//!      b. SIGKILL the binary (SIGTERM can hang on Windows)
//!      c. Remove per-worker WebView2 dir
//!
//! globalSetup (e2e/global-setup-warm.ts) has already done `cargo build` +
//! `pnpm run build`, so workers don't fight over those resources.

import { test as base, expect, type WorkerInfo } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  mkdirSync,
  rmSync,
  createWriteStream,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir, homedir } from "node:os";

import { connectTauri, type TauriPage } from "./cdp-driver";
import { BASE_PORTS } from "../playwright.config";

/** Per-worker environment passed to specs via the `tauriEnv` fixture. */
export type TauriEnv = {
  page: TauriPage;
  workerIndex: number;
  cdpUrl: string;
  workerDataDir: string;
};

/**
 * Compiled Tauri binary. globalSetup (`e2e/global-setup-warm.ts`) runs
 * `cargo build` so this exists by the time workers spin up.
 */
const TAURI_BIN = resolve(
  process.cwd(),
  "src-tauri",
  "target",
  "debug",
  "codeman-agent.exe",
);

/**
 * Port the SHARED Vite dev server is bound to. The Tauri binary loads the
 * webview from this URL via the TAURI_DEV_SERVER_URL env var.
 *
 * Must match STATIC_SERVER_PORT in `e2e/global-setup-warm.ts`.
 */
const STATIC_SERVER_PORT_FOR_WORKER = 1420;

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

export const test = base.extend<{}, { tauriEnv: TauriEnv }>({
  tauriEnv: [
    async ({}, use, workerInfo: WorkerInfo) => {
      const idx = workerInfo.parallelIndex;
      const cdpPort = BASE_PORTS.BASE_TAURI_DRIVER_PORT + idx;
      const cdpUrl = `http://127.0.0.1:${cdpPort}`;
      const userDataDir = join(tmpdir(), `codeman-e2e-w${idx}`);
      const webview2Dir = join(userDataDir, "WebView2");
      const logPath = join(userDataDir, "tauri.log");

      // 1. Clean stale WebView2 state from any previous run. Don't pre-clean
      //    the full dir yet — Tauri's `app_data_dir` is `%LocalAppData%\<id>\`
      //    and the WebView2 subdir there (for WebView2's own state, separate
      //    from our Rust-managed SQLite/settings.json which are inside
      //    `<id>` directly).
      rmSync(userDataDir, { recursive: true, force: true });
      mkdirSync(webview2Dir, { recursive: true });

      // 1b. Clean per-worker SQLite DB from Tauri app data dir.
      //     `db::connect()` stores `codeman-agent.w{idx}.db` in Tauri's
      //     `app_data_dir` (`%APPDATA%/<bundle_identifier>/` on Windows).
      //     This is SEPARATE from `userDataDir` (WebView2 state only), so the
      //     rmSync(userDataDir) above does NOT touch it. Without this cleanup,
      //     `sqlx::migrate!` detects the migration file hash changed between
      //     builds (binary rebuild changes the embedded migration hash) and
      //     panics with "migration N was previously applied but has been modified".
      const tauriAppData = join(
        process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"),
        "com.zcati.codeman-agent",
      );
      for (const suffix of [`.w${idx}.db`, `.w${idx}.db-wal`, `.w${idx}.db-shm`]) {
        try { rmSync(join(tauriAppData, `codeman-agent${suffix}`), { force: true }); } catch {}
      }

      // 2. Spawn the compiled Tauri binary directly with per-worker env vars.
      //    CODEMAN_TEST_WORKER → Rust suffixes SQLite/settings/window-state files.
      //    WEBVIEW2_USER_DATA_FOLDER → WebView2 isolates cookies/IndexedDB.
      //    TAURI_DEV_SERVER_URL → Tauri 2 debug binaries look for this env var
      //    (set automatically by `tauri dev`) to know the dev server URL when
      //    launched outside of `tauri dev`. Without it, the webview stays on
      //    `about:blank` even though the embedded config has `devUrl` set.
      //    Without dev server: ignore — frontendDist path is loaded via
      //    tauri:// protocol. But for our e2e setup, the globalSetup-started
      //    Vite dev server is at 1420, so we point the binary there.
      const child: ChildProcess = spawn(
        TAURI_BIN,
        [],
        {
          env: {
            ...process.env,
            CODEMAN_TEST_WORKER: `w${idx}`,
            TAURI_DEV_SERVER_URL: `http://127.0.0.1:${STATIC_SERVER_PORT_FOR_WORKER}`,
            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
            WEBVIEW2_USER_DATA_FOLDER: webview2Dir,
            RUST_LOG: process.env.RUST_LOG ?? "info",
          },
          stdio: ["ignore", "pipe", "pipe"],
          cwd: process.cwd(),
        },
      );

      // Mirror Tauri stdout/stderr to a per-worker log file for debugging.
      const logStream = createWriteStream(logPath);
      child.stdout?.on("data", (chunk) => logStream.write(chunk));
      child.stderr?.on("data", (chunk) => logStream.write(chunk));

      let tauriExitCode: number | null = null;
      child.once("exit", (code) => {
        tauriExitCode = code;
      });

      try {
        // 3. Wait for CDP endpoint.
        await waitForUrl(`${cdpUrl}/json/version`, 60_000);

        // 4. Connect via CDP. The webview URL is `tauri://localhost/index.html`
        //    (Tauri custom protocol); we accept any `type === "page"` target.
        const page = await connectTauri({
          cdpUrl,
          pageUrlPattern: /.*/,
        });

        // Diagnostic: print page URL + body innerText snippet so we can
        // see what the webview actually rendered.
        try {
          const probe = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            bodyChars: document.body?.innerText?.length ?? 0,
            bodySample: document.body?.innerText?.slice(0, 200) ?? "",
            asideExists: !!document.querySelector("aside"),
          }));
          console.log(
            `[tauriEnv w${idx}] page probe: ${JSON.stringify(probe)}`,
          );
        } catch (probeErr) {
          console.log(`[tauriEnv w${idx}] page probe failed: ${String(probeErr)}`);
        }

        const env: TauriEnv = {
          page,
          workerIndex: idx,
          cdpUrl,
          workerDataDir: userDataDir,
        };

        // 5. Provide to specs.
        await use(env);
      } catch (e) {
        if (tauriExitCode !== null) {
          throw new Error(
            `Tauri exited with code ${tauriExitCode} before fixtures were ready. ` +
              `Log: ${logPath}\nOriginal error: ${String(e)}`,
          );
        }
        throw e;
      } finally {
        // 6. Teardown (always runs). SIGKILL directly — SIGTERM on Tauri
        //    windows can hang on Windows because the WebView2 child holds
        //    open file handles.
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
        await sleep(500);
        // Save the Tauri log to a known location BEFORE cleanup so we
        // can inspect it after a failure. The WebView2 dir is too large
        // to copy reliably, so skip it.
        try {
          logStream.end();
        } catch {
          // ignore
        }
        console.log(`[tauriEnv w${idx}] log preserved at ${logPath}`);
        // DON'T rmSync the userDataDir yet — leave logs inspectable.
        // The next test run's fixture will rmSync on entry (step 1).
      }
    },
    { scope: "worker", auto: true },
  ],
});

export { expect };

// Re-export the common helpers from helpers.ts so specs can import everything
// from a single entry point. Note: helpers.ts no longer holds the page
// singleton — all page-dependent functions take page as the first arg.
export {
  invoke,
  assert,
  TauriLocator,
  TauriPage,
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