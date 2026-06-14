//! e2e/global-setup.ts — launch the Tauri app once before all specs run.
//!
//! Order of operations:
//!  1. Free ports (1420, 1421, 9222) — same script the dev path uses.
//!  2. Spawn `pnpm tauri:dev` with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS set,
//!     so WebView2 exposes a CDP endpoint on 9222.
//!  3. Wait for the Vite dev server (1420) and the CDP /json/version endpoint.
//!  4. Stash the Tauri child PID in a global so global-teardown can kill it.
//!
//! We do NOT use tauri-driver: connecting via CDP is simpler, faster, and
//! matches the W3C debugging protocol that Playwright already speaks.

import { spawn, type ChildProcess } from "node:child_process";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PORTS } from "../playwright.config";

// Path to the port-killer so we don't depend on a separate `predev` step.
// Mirrors what `pnpm tauri:dev` does on its own (see package.json#tauri:dev).
const KILL_PORT = "node scripts/kill-port.mjs";

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
	throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms (last error: ${String(lastErr)})`);
}

export default async function globalSetup(): Promise<void> {
	// 1. Free the dev ports in case a previous run left them bound.
	//    Use the same script the user-facing dev path uses.
	spawnSync(KILL_PORT, [String(PORTS.VITE_PORT), "1421", String(PORTS.TAURI_DRIVER_PORT)], {
		stdio: "inherit",
	});

	// 2. Spawn tauri dev with CDP enabled. The env var is read by WebView2
	//    itself, not Tauri, so it works whether tauri dev shells out or not.
	const child: ChildProcess = spawn("pnpm", ["tauri:dev"], {
		env: {
			...process.env,
			WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORTS.TAURI_DRIVER_PORT}`,
		},
		stdio: ["ignore", "inherit", "inherit"],
		shell: true,
		// detached so killing the parent doesn't necessarily take the whole
		// tree — teardown is responsible for reaping it explicitly.
		detached: false,
	});

	// 3. Park the PID on globalThis for the teardown hook to find.
	//    Playwright passes globalSetup's return value to globalTeardown via
	//    the test config; we also use globalThis as a fallback safety net.
	(globalThis as Record<string, unknown>).__TAURI_E2E_PID = child.pid;
	(globalThis as Record<string, unknown>).__TAURI_E2E_CHILD = child;

	// Handle early exit — fail fast with a useful message rather than timing
	// out on the port-wait below.
	child.once("exit", (code) => {
		if (code !== null && code !== 0) {
			throw new Error(`tauri:dev exited with code ${code} before tests could start`);
		}
	});

	// 4. Wait for both endpoints. Tauri compile + window open is the long pole
	//    on a cold cache; allow up to 5 minutes for the first run.
	const READY_TIMEOUT_MS = 5 * 60_000;
	await waitForUrl(`http://127.0.0.1:${PORTS.VITE_PORT}/`, READY_TIMEOUT_MS);
	await waitForUrl(`http://127.0.0.1:${PORTS.TAURI_DRIVER_PORT}/json/version`, READY_TIMEOUT_MS);

	// Return value is forwarded to globalTeardown as its first arg, but we
	// don't need it — we read the PID from globalThis above.
}
