//! e2e/helpers.ts — shared utilities for spec files.
//!
//! Three things get reused across specs:
//!  - getTauriPage(): connect to CDP, grab the main window's page.
//!  - invoke(): thin wrapper around window.__TAURI_INTERNALS__.invoke so specs
//!    can call backend commands without going through the UI.
//!  - clearAllHistory(): reset the SQLite store between specs (defence in
//!    depth — spec ordering should still be independent, but the scheduler's
//!    active provider could leak state across runs otherwise).

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PORTS } from "../playwright.config";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/** Connect to the Tauri WebView2 CDP endpoint and return the main window page. */
export async function getTauriPage(): Promise<Page> {
	if (page) return page;

	browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTS.TAURI_DRIVER_PORT}`);
	context = browser.contexts()[0] ?? (await browser.newContext());

	// Tauri opens a single window at boot. The devtools page (if open) is
	// always a *child* of the main page; picking the first non-devtools page
	// is the right heuristic in practice.
	const allPages = context.pages();
	page =
		allPages.find((p) => !p.url().includes("devtools")) ??
		allPages[0] ??
		(await context.newPage());

	// Ensure DOM is ready before the spec touches it.
	await page.waitForLoadState("domcontentloaded");
	return page;
}

/** Disconnect CDP and close the context. global-teardown kills the Tauri process. */
export async function disposeTauriPage(): Promise<void> {
	try {
		await page?.close();
	} catch {
		// ignore — page may already be closed by tauri exit
	}
	try {
		await context?.close();
	} catch {
		// ignore
	}
	try {
		await browser?.close();
	} catch {
		// ignore
	}
	page = null;
	context = null;
	browser = null;
}

/**
 * Call a Tauri IPC command from within the webview.
 * Mirrors what `invoke()` from "@tauri-apps/api/core" does internally.
 * Throws if the command rejects — let the spec decide how to assert.
 */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	const target = page ?? (await getTauriPage());
	return target.evaluate(
		([c, a]) => {
			// Tauri 2 exposes the IPC bridge on window.__TAURI_INTERNALS__.
			// The webview is the same context the app runs in, so this is
			// a true end-to-end call into Rust — not a mock.
			const w = window as unknown as {
				__TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
			};
			if (!w.__TAURI_INTERNALS__) {
				throw new Error("window.__TAURI_INTERNALS__ is missing — is the Tauri webview actually loaded?");
			}
			return w.__TAURI_INTERNALS__.invoke(c, a ?? {}) as Promise<T>;
		},
		[cmd, args ?? {}] as const,
	);
}

/** Wipe conversation + message history. Useful between specs that don't want leaked state. */
export async function clearAllHistory(): Promise<void> {
	try {
		await invoke("clear_all_history");
	} catch {
		// Best-effort — if the command doesn't exist in this build, fine.
	}
}
