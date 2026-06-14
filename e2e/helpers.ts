//! e2e/helpers.ts — spec 文件间共享的工具函数。
//!
//! 三样东西在 spec 间重用：
//!  - getTauriPage()：连接 CDP，获取主窗口的 page。
//!  - invoke()：window.__TAURI_INTERNALS__.invoke 的薄封装，以便 spec
//!    不用通过 UI 就能调用后端命令。
//!  - clearAllHistory()：重置 spec 之间的 SQLite store（纵深防御 — spec
//!    顺序仍应独立，但调度器的 active provider 可能跨运行泄漏状态）。

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PORTS } from "../playwright.config";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/** 连接到 Tauri WebView2 CDP 端点并返回主窗口 page。*/
export async function getTauriPage(): Promise<Page> {
	if (page) return page;

	// 使用 `localhost` 而非 `127.0.0.1` — WebView2 的 CDP 服务（与 Vite 一样）
	// 在此主机上绑定到系统解析的 loopback（可能是 `::1` IPv6），用 `127.0.0.1`
	// 会撞上 ECONNREFUSED。与 `e2e/global-setup.ts` 里 Vite 侧的修复对应。
	browser = await chromium.connectOverCDP(`http://localhost:${PORTS.TAURI_DRIVER_PORT}`);
	context = browser.contexts()[0] ?? (await browser.newContext());

	// Tauri 启动时打开一个窗口。devtools page（如果打开）始终是主 page 的
	// *子级*；选择第一个非 devtools page 是实践中的正确启发式。
	const allPages = context.pages();
	page =
		allPages.find((p) => !p.url().includes("devtools")) ??
		allPages[0] ??
		(await context.newPage());

	// 在 spec 操作 DOM 前确保 DOM 就绪。
	await page.waitForLoadState("domcontentloaded");
	return page;
}

/** 断开 CDP 并关闭 context。global-teardown 杀死 Tauri 进程。*/
export async function disposeTauriPage(): Promise<void> {
	try {
		await page?.close();
	} catch {
		// 忽略 — page 可能已被 tauri 退出关闭
	}
	try {
		await context?.close();
	} catch {
		// 忽略
	}
	try {
		await browser?.close();
	} catch {
		// 忽略
	}
	page = null;
	context = null;
	browser = null;
}

/**
 * 从 webview 内部调用 Tauri IPC 命令。
 * 镜像 "@tauri-apps/api/core" 中 `invoke()` 内部所做的。
 * 如果命令拒绝则抛错 — 让 spec 决定如何断言。
 */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	const target = page ?? (await getTauriPage());
	return target.evaluate(
		([c, a]) => {
			// Tauri 2 在 window.__TAURI_INTERNALS__ 上暴露 IPC 桥接。
			// webview 与应用运行在相同上下文中，所以这是
			// 到 Rust 的真正端到端调用 — 不是 mock。
			const w = window as unknown as {
				__TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
			};
			if (!w.__TAURI_INTERNALS__) {
				throw new Error("window.__TAURI_INTERNALS__ 缺失 — Tauri webview 实际加载了吗？");
			}
			return w.__TAURI_INTERNALS__.invoke(c, a ?? {}) as Promise<T>;
		},
		[cmd, args ?? {}] as const,
	);
}

/** 清除会话 + 消息历史。对不想泄漏状态的 spec 之间有用。*/
export async function clearAllHistory(): Promise<void> {
	try {
		await invoke("clear_all_history");
	} catch {
		// 尽最大努力 — 如果此构建中命令不存在，没关系。
	}
}
