//! e2e/global-setup-warm.ts — shared warm-up for all workers.
//!
//! Runs ONCE before any worker starts. After this, each worker spawns its
//! own Tauri instance via `e2e/fixtures.ts` (worker-scoped fixture).
//!
//! Responsibilities:
//!   1. `cargo build` — pre-warm Rust cache so workers share a warm cache.
//!   2. `pnpm run build` — produce `dist/` (production frontend build).
//!   3. Spawn a SHARED static-file server on port 1420 serving `dist/`.
//!      Why: the compiled `codeman-agent.exe` has `devUrl = http://127.0.0.1:1420`
//!      embedded in its config. Without a server at that URL, the webview
//!      can't load anything. We use Vite's preview mode to serve `dist/` —
//!      it gives all 4 workers a single shared, stateless static server.
//!   4. Kill stale ports from any previous run.
//!   5. Stash the server PID on `globalThis` so global-teardown can kill it.
//!
//! Per-worker Tauri startup (with CODEMAN_TEST_WORKER env var for SQLite /
//! settings.json / window-state.json isolation) lives in `e2e/fixtures.ts`.

import { execSync, spawnSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const WARM_TIMEOUT_MS = 5 * 60_000; // cargo build can be slow on cold cache
const STATIC_SERVER_PORT = 1420;
const STATIC_SERVER_READY_TIMEOUT_MS = 30_000;

// Per-worker CDP ports range + dev ports from any leftover Vite (1420/1421).
// We kill leftover processes from previous runs so workers can bind cleanly.
// Adjust MAX_WORKERS if you change the worker count.
const MAX_WORKERS = Number(process.env.E2E_MAX_WORKERS ?? 8);
const CDP_BASE = 9333;
const VITE_PORTS_TO_KILL = [STATIC_SERVER_PORT, 1421]; // leftover Vite / HMR socket
const CDP_PORTS_TO_KILL = [
  ...VITE_PORTS_TO_KILL,
  ...Array.from({ length: MAX_WORKERS }, (_, i) => CDP_BASE + i),
];

// Some specs (04-llm-stream, 06) inject MINIMAX_CN_API_KEY from .env. Warn
// the user if it's missing so they can pre-configure before running.
function warnIfNoEnv(): void {
  const envFileExists = existsSync(resolve(process.cwd(), ".env"));
  if (!envFileExists) {
    console.warn(
      "[e2e warm] .env not found — specs 04/06 (real LLM) will skip " +
        "unless MiniMax key is manually configured in Settings UI.",
    );
  }
}

function runStep(name: string, fn: () => void): void {
  const start = Date.now();
  console.log(`[e2e warm] ${name}…`);
  try {
    fn();
  } catch (e) {
    const err = e as { status?: number | null; stderr?: Buffer; message?: string };
    const stderr = err.stderr ? err.stderr.toString() : "(no stderr captured)";
    throw new Error(
      `[e2e warm] ${name} failed (status=${err.status ?? "?"})\n` +
        `--- stderr ---\n${stderr}\n--- end ---\n` +
        `${err.message ?? String(e)}`,
    );
  }
  console.log(`[e2e warm] ${name} done (${((Date.now() - start) / 1000).toFixed(1)}s)`);
}

/** Wait for a URL to respond. */
async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      // Vite preview returns 200 for /; tolerate any non-error response.
      if (res.status < 500) return;
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
  warnIfNoEnv();

  // 1. Pre-warm Rust cache.
  runStep("cargo build", () => {
    execSync("cargo build", {
      cwd: "src-tauri",
      stdio: "ignore",
      env: { ...process.env, RUSTFLAGS: "-A dead_code" },
    });
  });

  // 2. Build the frontend to dist/.
  runStep("pnpm run build", () => {
    execSync("pnpm run build", { stdio: "ignore" });
  });

  // 3. Sanity check: dist/index.html exists.
  const distIndex = resolve(process.cwd(), "dist", "index.html");
  if (!existsSync(distIndex)) {
    throw new Error(
      `[e2e warm] dist/index.html not found at ${distIndex} — pnpm build did not produce output`,
    );
  }

  // 4. Free stale ports from previous runs.
  console.log(`[e2e warm] killing stale ports ${CDP_PORTS_TO_KILL.join(", ")}`);
  spawnSync("node", ["scripts/kill-port.mjs", ...CDP_PORTS_TO_KILL.map(String)], {
    stdio: "inherit",
  });

  // 5. Sanity: confirm the binary actually got built.
  const tauriBin = resolve(process.cwd(), "src-tauri", "target", "debug", "codeman-agent.exe");
  if (!existsSync(tauriBin)) {
    throw new Error(
      `[e2e warm] Tauri binary not found at ${tauriBin} — cargo build did not produce it`,
    );
  }
  console.log(`[e2e warm] Tauri binary ready: ${tauriBin}`);

  // 6. Spawn a SHARED Vite dev server on 1420. The compiled Tauri binary
  //    has `devUrl = http://127.0.0.1:1420` embedded; without a server here,
  //    every worker's webview sits on `about:blank`.
  //
  //    We use `vp run dev` (existing npm script: `vite` + port-kill) which
  //    starts the Vite dev server. Dev mode has HMR but workers don't load
  //    code that changes during a run, so HMR doesn't interfere. The frontend
  //    served is dev mode (source files), not the production `dist/` we just
  //    built — that's a deliberate trade-off: it matches the original
  //    pre-refactor setup where Vite was always used.
  //
  //    Alternative considered: `vite preview` (serves dist/) — couldn't use
  //    it because no `vp run vite` script exists; calling `vite` binary
  //    directly works but loses vp's port-killing behavior.
  console.log(`[e2e warm] starting vite dev server on :${STATIC_SERVER_PORT}…`);
  const vitePreview = spawn(
    "vp",
    ["run", "dev"],
    {
      stdio: ["ignore", "inherit", "inherit"],
      cwd: process.cwd(),
    },
  );

  // Stash for globalTeardown to kill.
  (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_PID = vitePreview.pid;
  (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_CHILD = vitePreview;

  let viteExitCode: number | null = null;
  vitePreview.once("exit", (code) => {
    viteExitCode = code;
  });

  // Wait for Vite preview to be ready.
  try {
    await waitForUrl(`http://127.0.0.1:${STATIC_SERVER_PORT}/`, STATIC_SERVER_READY_TIMEOUT_MS);
    console.log(`[e2e warm] vite preview ready on :${STATIC_SERVER_PORT}`);
  } catch (e) {
    if (viteExitCode !== null) {
      throw new Error(
        `[e2e warm] vite preview exited with code ${viteExitCode} before becoming ready: ${String(e)}`,
      );
    }
    throw e;
  }
}