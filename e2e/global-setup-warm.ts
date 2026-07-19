//! e2e/global-setup-warm.ts — V3 Electron shared warm-up.
//!
//! Runs ONCE before any worker starts. After this, each worker spawns its
//! own V3 Electron instance via `e2e/fixtures.ts` (worker-scoped fixture).
//!
//! Responsibilities:
//!   1. `pnpm run build` (= electron-vite build) — produces `dist-electron/`
//!      (main + preload + renderer). Does NOT run electron-builder: the
//!      per-worker fixture spawns the local Electron binary directly.
//!   2. Kill stale CDP ports from any previous run.
//!   3. Sanity-check the build output exists.
//!
//! V3 difference from V2: NO shared Vite dev server. V3 Electron loads the
//! bundled renderer via file:// (no devUrl). This eliminates the port-1420
//! dependency that V2 had.

import { execSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
  // 1. Build V3 Electron renderer + main process code (dist-electron/*).
  //    Uses `pnpm run build` (= electron-vite build). Does NOT run
  //    electron-builder --dir — the per-worker fixture falls back to
  //    LOCAL_BIN mode (node_modules/electron + dist-electron/main/index.js).
  //    Skip if dist-electron/ already exists AND migrations are present
  //    (dev shortcut; rebuild if migrations are missing — e.g. old build
  //    that predates the copy-migrations-plugin).
  const mainEntry = resolve(process.cwd(), "dist-electron", "main", "index.js");
  const migrationsDir = resolve(process.cwd(), "dist-electron", "main", "db", "migrations");
  if (existsSync(mainEntry) && existsSync(migrationsDir)) {
    console.log(`[e2e warm] skip pnpm run build — dist-electron/ ready`);
  } else {
    runStep("pnpm run build", () => {
      execSync("pnpm run build", {
        stdio: "ignore",
      });
    });
  }

  // 2. Free stale CDP ports.
  console.log(`[e2e warm] killing stale CDP ports ${CDP_PORTS_TO_KILL.join(", ")}`);
  spawnSync("node", ["scripts/kill-port.mjs", ...CDP_PORTS_TO_KILL.map(String)], {
    stdio: "inherit",
  });

  // 3. Sanity: confirm local Electron binary + dist-electron/ entry exist.
  const localBin = resolve(
    process.cwd(),
    "node_modules",
    "electron",
    "dist",
    process.platform === "win32" ? "electron.exe" : "electron",
  );
  const localEntry = resolve(process.cwd(), "dist-electron", "main", "index.js");
  const localExists = existsSync(localBin) && existsSync(localEntry);
  if (!localExists) {
    throw new Error(
      `[e2e warm] No Electron build available. ` +
        `Expected ${localBin} + ${localEntry}. ` +
        `Run \`pnpm run build\` (= electron-vite build) first.`,
    );
  }
  console.log(`[e2e warm] Electron binary ready: ${localBin} (entry: ${localEntry})`);

  // 4. Brief settle (electron-vite build can leave file handles open briefly
  //    after exit).
  await sleep(500);
}
