//! e2e/global-setup.ts — launch the Tauri app once before all specs run.
//!
//! Order of operations:
//!  0. Pre-warm the Rust debug cache (`cd src-tauri && cargo build`) so
//!     tauri:dev starts fast. Cargo output is discarded (stdio: "ignore")
//!     so the test reporter's stdout stays clean — the user is here for
//!     test results, not 5MB of compile noise.
//!  1. Free ports (1420, 1421, 9222) — same script the dev path uses.
//!  2. Spawn `pnpm tauri:dev` with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS set,
//!     so WebView2 exposes a CDP endpoint on 9222. Output discarded for the
//!     same reason; check exit code on failure.
//!  3. Wait for the Vite dev server (1420) and the CDP /json/version endpoint.
//!     We use `localhost` (not `127.0.0.1`) because on this Windows host the
//!     OS resolver maps `localhost` → `::1` (IPv6 loopback), which is the
//!     address Vite actually binds to when `server.host` is unset. Using
//!     `127.0.0.1` silently times out.
//!  4. Stash the Tauri child PID in a global so global-teardown can kill it.
//!
//! We do NOT use tauri-driver: connecting via CDP is simpler, faster, and
//! matches the W3C debugging protocol that Playwright already speaks.

import { spawn, type ChildProcess, execSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PORTS } from "../playwright.config";

// Path to the port-killer so we don't depend on a separate `predev` step.
// Mirrors what `pnpm tauri:dev` does on its own (see package.json#tauri:dev).
const KILL_PORT = "node scripts/kill-port.mjs";

// 90s is plenty: with the prewarm done, tauri:dev's only remaining work is
// Vite startup (~0.5s) + the codeman-agent binary launch + WebView2 window
// open. On a healthy machine everything is ready in <20s. We give it a
// generous budget so transient slowness doesn't false-positive; anything
// longer than 90s is a real failure that needs human attention.
const READY_TIMEOUT_MS = 90_000;

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 404 /* /json/version is 200; tolerate others */) {
        return;
      }
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

export default async function globalSetup(): Promise<void> {
  // 0. Pre-warm the Rust debug cache. Done synchronously so the test phase
  //    never sees cargo compile output. `RUSTFLAGS=-A dead_code` silences
  //    the pre-existing `methods never used` warnings in src/db/* that
  //    otherwise flood the first-run output. On warm cache this is <1s.
  console.log("[e2e setup] step 0/4 — pre-warming Rust debug cache");
  const prewarmStart = Date.now();
  try {
    execSync("cargo build", {
      cwd: "src-tauri",
      stdio: "ignore",
      env: { ...process.env, RUSTFLAGS: "-A dead_code" },
    });
  } catch (e) {
    // Output is discarded, so we can't show the cargo log on failure.
    // Tell the user to run cargo manually for full diagnostic.
    const err = e as { status?: number | null; signal?: string; stderr?: Buffer; message?: string };
    const stderr = err.stderr ? err.stderr.toString() : "(no stderr captured — stdio: ignore)";
    throw new Error(
      `[e2e setup] cargo build failed (status=${err.status ?? "?"}, signal=${err.signal ?? "none"})\n` +
        `cwd: ${process.cwd()}\n` +
        `--- stderr ---\n${stderr}\n--- end ---\n` +
        `${err.message ?? String(e)}\n` +
        `Run \`cd src-tauri && cargo build\` manually for interactive output.`,
    );
  }
  const prewarmMs = Date.now() - prewarmStart;
  console.log(`[e2e setup] step 0/4 — Rust cache warm (${(prewarmMs / 1000).toFixed(1)}s)`);

  // Warn if .env is missing or has no key (spec 04 needs it; other specs are key-agnostic).
  // .env 是测试用例来源,包含 MINIMAX_CN_API_KEY + MINIMAX_CN_API_BASE_URL。
  // 跟之前 MINIMAX_API_KEY 走 PowerShell session env 的方式不同。
  const envFileExists = existsSync(resolve(process.cwd(), ".env"));
  if (!envFileExists) {
    console.warn(
      "[e2e setup] ⚠ .env not found in cwd — " +
        "spec 04 will fail unless MiniMax key is manually configured in Settings UI. " +
        "Create .env with MINIMAX_CN_API_KEY=... + MINIMAX_CN_API_BASE_URL=..., then re-run.",
    );
  }

  // 1. Free the dev ports in case a previous run left them bound.
  //    Use the same script the user-facing dev path uses. Its output is
  //    small (one line per port) so we keep it inline.
  console.log("[e2e setup] step 1/4 — freeing ports");
  spawnSync(KILL_PORT, [String(PORTS.VITE_PORT), "1421", String(PORTS.TAURI_DRIVER_PORT)], {
    stdio: "inherit",
  });

  // 2. Spawn tauri dev with CDP enabled. The env var is read by WebView2
  //    itself, not Tauri, so it works whether tauri dev shells out or not.
  //    stdio is fully discarded — the test reporter owns the user-facing
  //    stdout. To watch the raw stream during a run, spawn tauri:dev
  //    manually in another terminal.
  //
  //    使用 vp (vite-plus) 而不是 pnpm — 项目包管理器已迁到 vp (V2+)。
  //    Vite、Tauri、Cargo 走 vp run 链,但 beforeDevCommand / beforeBuildCommand
  //    在 tauri.conf.json 里仍是 pnpm — 这是已知的迁移 gap,见下。
  console.log("[e2e setup] step 2/4 — spawning vp run tauri:dev (output discarded)");
  const child: ChildProcess = spawn("vp", ["run", "tauri:dev"], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORTS.TAURI_DRIVER_PORT}`,
    },
    stdio: "ignore",
    shell: true,
    // detached so killing the parent doesn't necessarily take the whole
    // tree — teardown is responsible for reaping it explicitly.
    detached: false,
  });

  // Track exit state on a closure-scoped variable. We cannot `throw` from
  // inside a `.once("exit")` listener — that becomes an unhandled exception
  // and the globalSetup function never sees it, leading to a port-wait
  // timeout instead of a fast, clear failure.
  let tauriExitCode: number | null = null;
  child.once("exit", (code) => {
    tauriExitCode = code;
  });

  // Park the PID on globalThis for the teardown hook to find.
  (globalThis as Record<string, unknown>).__TAURI_E2E_PID = child.pid;
  (globalThis as Record<string, unknown>).__TAURI_E2E_CHILD = child;

  // 3. Wait for both endpoints. Use `127.0.0.1` (IPv4) — Vite's
  //    `host: '127.0.0.1'` in vite.config.ts binds to IPv4 loopback, and
  //    WebView2's CDP also binds to IPv4. Node's DNS resolver on this
  //    Windows host prefers `::1` for `localhost`, which causes the
  //    fetch to hit ECONNREFUSED against the IPv4-only services. See
  //    e2e/helpers.ts:24 for the matching CDP fix.
  console.log(
    `[e2e setup] step 3/4 — waiting for Vite (127.0.0.1:${PORTS.VITE_PORT}) and CDP (127.0.0.1:${PORTS.TAURI_DRIVER_PORT}) — up to 90s`,
  );
  try {
    await waitForUrl(`http://127.0.0.1:${PORTS.VITE_PORT}/`, READY_TIMEOUT_MS);
    await waitForUrl(`http://127.0.0.1:${PORTS.TAURI_DRIVER_PORT}/json/version`, READY_TIMEOUT_MS);
  } catch (e) {
    // If tauri:dev crashed, surface that first — the port-wait is a
    // symptom, the real cause is in tauri:dev's output (which we've
    // discarded, so the user has to re-run manually).
    if (tauriExitCode !== null && tauriExitCode !== 0) {
      throw new Error(
        `[e2e setup] tauri:dev exited with code ${tauriExitCode} before tests could start. ` +
          `Run \`pnpm tauri:dev\` manually for full diagnostic output.`,
      );
    }
    // Otherwise tauri:dev is hung (most likely a compile or window-open
    // issue). Same advice — run manually.
    throw new Error(
      `[e2e setup] port-wait failed: ${String(e)}. ` +
        `Run \`pnpm tauri:dev\` manually for full diagnostic output.`,
    );
  }

  // 4. Belt-and-braces: if the child exited 0 between the last wait and
  //    now (e.g. immediately after binding the ports, the test reporter
  //    is going to be very confused).
  if (tauriExitCode !== null && tauriExitCode !== 0) {
    throw new Error(
      `[e2e setup] tauri:dev exited with code ${tauriExitCode} right after becoming ready. ` +
        `Run \`pnpm tauri:dev\` manually for full diagnostic output.`,
    );
  }

  console.log("[e2e setup] step 4/4 — ready, handing off to Playwright");
}
