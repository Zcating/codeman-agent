//! Playwright config for Tauri 2 e2e tests.
//!
//! Strategy (multi-worker): per-worker Tauri instance, driven via CDP.
//! - Each Playwright worker spawns its own Tauri instance in `e2e/fixtures.ts`
//!   (worker-scoped fixture). Workers do NOT share Tauri state.
//! - globalSetup is shared warm-up only: cargo build + pnpm build (frontend
//!   dist). No Vite per worker — tests load from `frontendDist` directly.
//! - Each worker uses its own CDP port (BASE_TAURI_DRIVER_PORT + parallelIndex)
//!   and its own Tauri identifier (com.zcati.codeman-agent.w{N}) so SQLite,
//!   settings.json, and window-state.json are isolated per worker.
//! - WEBVIEW2_USER_DATA_FOLDER is set per worker so WebView2's own state
//!   (cookies, IndexedDB) doesn't collide either.
//!
//! Local-only for now; CI wiring is intentionally not set up.

import { defineConfig, devices } from "@playwright/test";

// Base ports. Per-worker = BASE + parallelIndex (e.g. w0=9333, w1=9334).
// WebView2's CDP binds to `127.0.0.1`; callers must use IPv4 explicitly —
// Node's DNS resolver prefers `::1` on this Windows host and the IPv6
// attempt hits ECONNREFUSED instead of falling through to IPv4.
const BASE_TAURI_DRIVER_PORT = 9333;
const BASE_VITE_PORT = 1420;

export default defineConfig({
  testDir: "./e2e",
  // Workers run in parallel; each owns its own Tauri instance (see
  // e2e/fixtures.ts). Tune up/down via the `e2e` script if the machine
  // can't handle N concurrent Tauri processes.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup-warm.ts",
  globalTeardown: "./e2e/global-teardown-warm.ts",

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    // baseURL is set per worker by the fixture (each worker may use a
    // different Vite port). Specs should not rely on this directly.
    baseURL: `http://127.0.0.1:${BASE_VITE_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },

  projects: [
    {
      // The "browser" is the Tauri WebView2; Desktop Chrome is the closest
      // device descriptor for layout assertions.
      name: "tauri-webview2",
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
export const BASE_PORTS = { BASE_TAURI_DRIVER_PORT, BASE_VITE_PORT } as const;
