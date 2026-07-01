//! e2e/global-setup-warm.ts — V3 Electron shared warm-up.
//!
//! Runs ONCE before any worker starts. After this, each worker spawns its
//! own V3 Electron instance via `e2e/fixtures.ts` (worker-scoped fixture).
//!
//! Responsibilities:
//!   1. `pnpm run build:dir` — produces `dist-electron/` (main + preload +
//!      renderer) AND `release/win-unpacked/codeman-agent.exe` (via
//!      electron-builder --dir). Single command covers both.
//!   2. Kill stale CDP ports from any previous run.
//!   3. Sanity-check the binary exists.
//!
//! V3 difference from V2: NO shared Vite dev server. V3 Electron loads the
//! bundled renderer via file:// (no devUrl). This eliminates the port-1420
//! dependency that V2 had.

import { execSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const WARM_TIMEOUT_MS = 10 * 60_000; // electron-vite + electron-builder can be slow on cold cache
const ELECTRON_BIN_REL = resolve(
  process.cwd(),
  "release",
  "win-unpacked",
  process.platform === "win32" ? "codeman-agent.exe" : "codeman-agent",
);

// Per-worker CDP ports: 9222 + parallelIndex. Kill any leftover processes
// from previous runs so workers can bind cleanly. MAX_WORKERS must match
// playwright.config.ts workers count.
const MAX_WORKERS = Number(process.env.E2E_MAX_WORKERS ?? 4);
const CDP_BASE = 9222;
const CDP_PORTS_TO_KILL = Array.from(
  { length: MAX_WORKERS },
  (_, i) => CDP_BASE + i,
);

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
  console.log(
    `[e2e warm] ${name} done (${((Date.now() - start) / 1000).toFixed(1)}s)`,
  );
}

export default async function globalSetup(): Promise<void> {
  // 1. Build V3 Electron: electron-vite build (dist-electron/*) + electron-builder
  //    --dir (release/win-unpacked/codeman-agent.exe). The npm script
  //    `build:dir` chains both.
  runStep("pnpm run build:dir", () => {
    execSync("pnpm run build:dir", {
      stdio: "ignore",
      env: { ...process.env, ELECTRON_BUILDER_CACHE: resolve(process.cwd(), ".electron-builder-cache") },
    });
  });

  // 2. Free stale CDP ports.
  console.log(`[e2e warm] killing stale CDP ports ${CDP_PORTS_TO_KILL.join(", ")}`);
  spawnSync("node", ["scripts/kill-port.mjs", ...CDP_PORTS_TO_KILL.map(String)], {
    stdio: "inherit",
  });

  // 3. Sanity: confirm the binary actually got built.
  if (!existsSync(ELECTRON_BIN_REL)) {
    throw new Error(
      `[e2e warm] V3 Electron binary not found at ${ELECTRON_BIN_REL} — ` +
        `pnpm run build:dir did not produce output. Check that electron-builder --dir ` +
        `finished successfully (look for "building target=nsis ... target=msi" lines).`,
    );
  }
  console.log(`[e2e warm] V3 Electron binary ready: ${ELECTRON_BIN_REL}`);

  // 4. Brief settle (electron-vite + electron-builder can leave file handles
  //    open briefly after exit).
  await sleep(500);
}
