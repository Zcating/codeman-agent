//! Playwright config for Tauri 2 e2e tests.
//!
//! Strategy: real webview + real Rust backend, driven via CDP.
//! - Playwright does NOT spawn a browser; it connects to WebView2's CDP endpoint
//!   (port 9222, enabled by WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS env var).
//! - globalSetup starts `tauri dev` in the background and waits for both the
//!   Vite dev server (1420) and the CDP endpoint (9222) to be live.
//! - Single worker — Tauri is a single-instance desktop app; parallel tests
//!   would collide on the same window/Rust state.
//! - Local-only for now; CI wiring is intentionally not set up (see ADR-NNNN).

import { defineConfig, devices } from "@playwright/test";

const TAURI_DRIVER_PORT = 9222;
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
		baseURL: `http://localhost:${VITE_PORT}`,
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

	// Exposed for global-setup.ts to read the same port we use above.
	outputDir: "playwright-report/test-results",
});

// Tell specs about the ports without re-declaring them.
export const PORTS = { TAURI_DRIVER_PORT, VITE_PORT } as const;
