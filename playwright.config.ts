//! Playwright config for Tauri 2 e2e tests.
//!
//! Strategy: real webview + real Rust backend, driven via CDP.
//! - Playwright does NOT spawn a browser; it connects to WebView2's CDP endpoint
//!   (port 9333, enabled by WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS env var).
//! - globalSetup starts `tauri dev` in the background and waits for both the
//!   Vite dev server (1420) and the CDP endpoint (9333) to be live.
//! - Single worker — Tauri is a single-instance desktop app; parallel tests
//!   would collide on the same window/Rust state.
//! - Local-only for now; CI wiring is intentionally not set up (see ADR-NNNN).

import { defineConfig, devices } from "@playwright/test";

// Port for the WebView2 CDP endpoint. We use 9333 instead of the Chromium
// default 9222 to dodge a clash with the user's Edge browser, which on this
// host already binds 9222 (with a stub HTTP server returning 404 for
// `/json/version`, so the Chrome DevTools Protocol can't be served there).
// WebView2's CDP binds to `127.0.0.1`, so callers must use IPv4 explicitly
// — Node's DNS resolver prefers `::1` first on this host, and the IPv6
// attempt hits ECONNREFUSED instead of falling through to IPv4. Specs
// read this via `PORTS.TAURI_DRIVER_PORT`.
const TAURI_DRIVER_PORT = 9333;
const VITE_PORT = 1420;

export default defineConfig({
  testDir: "./e2e",
  // Tests share the same Tauri window — must run serially.
  workers: 1,
  fullyParallel: false,
  // The Tauri process is launched in globalSetup, not by Playwright.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    baseURL: `http://127.0.0.1:${VITE_PORT}`,
    // Trace on first retry; we keep failures for debugging.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      // The "browser" is the Tauri WebView2; we use Desktop Chrome as the
      // closest device descriptor for layout assertions. No executablePath
      // is set — connectOverCDP is what actually wires the connection.
      name: "tauri-webview2",
      use: { ...devices["Desktop Chrome"], viewport: { width: 800, height: 600 } },
    },
  ],

  // NOTE: outputDir must live OUTSIDE the HTML reporter folder. Playwright
  // refuses to run when the two collide ("HTML reporter output folder
  // clashes with the tests output folder") because the HTML reporter
  // wipes its own folder on each run, which would nuke the artifacts.
  outputDir: "test-results",
});

// Tell specs about the ports without re-declaring them.
export const PORTS = { TAURI_DRIVER_PORT, VITE_PORT } as const;
