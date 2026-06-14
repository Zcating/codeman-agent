//! e2e/global-teardown.ts — kill the Tauri process spawned by global-setup.
//!
//! Belt-and-braces: we kill the exact child first, then sweep any leftover
//! processes on the dev ports. This avoids leaving zombie cargo / tauri /
//! webview2 processes when tests fail mid-run.

import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PORTS } from "../playwright.config";

const KILL_PORT = "node scripts/kill-port.mjs";

export default async function globalTeardown(): Promise<void> {
	const child = (globalThis as Record<string, unknown>).__TAURI_E2E_CHILD as
		| { kill: (sig: string) => void; pid?: number }
		| undefined;
	const pid = (globalThis as Record<string, unknown>).__TAURI_E2E_PID as number | undefined;

	// 1. Try the child first — tauri dev is the parent of `cargo run` and the
	//    webview helper, so killing it should cascade.
	if (child?.kill) {
		try {
			child.kill("SIGTERM");
		} catch {
			// already dead
		}
	}

	// 2. Belt-and-braces: nuke anything still bound to the dev ports.
	//    This catches webview2, cargo, and `tauri dev` shells that didn't die
	//    cleanly with the parent.
	await sleep(1000);
	spawnSync(
		KILL_PORT,
		[String(PORTS.VITE_PORT), "1421", String(PORTS.TAURI_DRIVER_PORT)],
		{ stdio: "inherit" },
	);

	// 3. On Windows, occasionally a tauri.exe is left orphaned under a
	//    different parent. taskkill /F /IM tauri.exe is the last resort —
	//    safe here because we're the only consumer of that exe in CI/local.
	if (process.platform === "win32") {
		spawnSync("taskkill", ["/F", "/IM", "tauri.exe", "/T"], { stdio: "ignore" });
		spawnSync("taskkill", ["/F", "/IM", "codeman-agent.exe", "/T"], { stdio: "ignore" });
	}

	// 4. Clear globals so a re-run (e.g. --retries) starts clean.
	(globalThis as Record<string, unknown>).__TAURI_E2E_CHILD = undefined;
	(globalThis as Record<string, unknown>).__TAURI_E2E_PID = undefined;

	// Pid kept for potential future logging; reference so eslint doesn't drop it.
	void pid;
}
