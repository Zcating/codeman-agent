//! Playwright config for V3 Electron e2e tests.
//!
//! Strategy (multi-worker): per-worker Electron binary instance, driven via CDP.
//! - Each Playwright worker spawns its own V3 Electron binary in
//!   `e2e/fixtures.ts` (worker-scoped fixture). Workers do NOT share Electron
//!   state.
//! - globalSetup is shared warm-up only: `pnpm run build:dir` (electron-vite
//!   build + electron-builder --dir). No Vite per worker — tests load bundled
//!   renderer via file://.
//! - Each worker uses its own CDP port (BASE_ELECTRON_CDP_PORT + parallelIndex)
//!   and its own CODEMAN_TEST_WORKER env var so SQLite, settings.json, and
//!   window-state.json are isolated per worker.
//!
//! Local-only for now; CI wiring is intentionally not set up.

import { defineConfig, devices } from "@playwright/test";

// V3 Electron: per-worker CDP port for Chromium remote-debugging. Base = 9222
// (Electron's default remote-debugging port; +parallelIndex per worker).
// Chromium's CDP binds to `127.0.0.1`; callers must use IPv4 explicitly —
// Node's DNS resolver prefers `::1` on this Windows host and the IPv6
// attempt hits ECONNREFUSED instead of falling through to IPv4.
const BASE_ELECTRON_CDP_PORT = 9222;

// V2 leftover (kept for backward compat in helpers.ts imports).
const BASE_TAURI_DRIVER_PORT = 9333;
const BASE_VITE_PORT = 1420;

export default defineConfig({
  testDir: "./e2e",
  // Workers run in parallel; each owns its own Electron instance (see
  // e2e/fixtures.ts). Tune up/down via the `e2e` script if the machine
  // can't handle N concurrent Electron processes.
  workers: 4,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup-warm.ts",
  globalTeardown: "./e2e/global-teardown-warm.ts",

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    // baseURL retained for V2 backward compat. V3 specs should not rely on
    // baseURL — Electron loads bundled renderer via file://.
    baseURL: `http://127.0.0.1:${BASE_VITE_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },

  projects: [
    {
      // V3: the "browser" is the V3 Electron webview (Chromium 134).
      // Desktop Chrome is the closest device descriptor for layout.
      name: "electron-webview",
      use: { ...devices["Desktop Chrome"], viewport: { width: 800, height: 600 } },
    },
  ],

  // outputDir must live OUTSIDE the HTML reporter folder — see comment
  // block below for the failure mode.
  outputDir: "test-results",
});

// Base ports. Specs that need a port (e.g. env probes) should read
// BASE_PORTS and add workerInfo.parallelIndex; the per-worker fixture
// handles the actual port allocation at runtime.
export const BASE_PORTS = {
  BASE_ELECTRON_CDP_PORT,
  BASE_TAURI_DRIVER_PORT, // V2 leftover
  BASE_VITE_PORT,
} as const;
