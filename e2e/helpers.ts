//! e2e/helpers.ts — 共享 utility。Spec 们从这里导入 getTauriPage / invoke /
//! clearAllHistory / disposeTauriPage。
//!
//! 跟 Playwright `connectOverCDP` 不同（WebView2 不支持
//! `Browser.setDownloadBehavior` —— 见 cdp-driver.ts 注释），我们直接连 CDP。
//! 因此 helpers 的 API 是我们自己实现的 Page/Locator 包装，但调用语法
//! 跟 Playwright 一致,spec 文件改动最小（只换 `expect` 为 `assert.*`）。

import { assert, connectTauri, TauriLocator, TauriPage } from "./cdp-driver";

let page: TauriPage | null = null;

export { TauriLocator, TauriPage, assert };

/** 连 WebView2 拿到 Tauri 页面（首次调用建连,后续直接返回缓存）。 */
export async function getTauriPage(): Promise<TauriPage> {
  if (page) return page;
  page = await connectTauri();
  return page;
}

/** 释放 CDP 资源。每个 spec 的 afterAll 调用,避免连接累积。 */
export async function disposeTauriPage(): Promise<void> {
  if (page) {
    page.close();
    page = null;
  }
}

/**
 * 调 Tauri IPC 命令。Spec 用它做端到端断言(不依赖 UI 反馈)。
 * 实际是在 webview 里跑 `window.__TAURI_INTERNALS__.invoke(cmd, args)`。
 */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const p = page ?? (await getTauriPage());
  const result = await p.evaluate(
    ([c, a]) => {
      const w = window as unknown as {
        __TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
      };
      if (!w.__TAURI_INTERNALS__) {
        throw new Error(
          "window.__TAURI_INTERNALS__ is missing — is the Tauri webview actually loaded?",
        );
      }
      return w.__TAURI_INTERNALS__.invoke(c, a ?? {});
    },
    [cmd, args ?? {}] as const,
  );
  return result as T;
}

/** 重置对话 + 消息历史。Spec 间清理用,失败不抛。 */
export async function clearAllHistory(): Promise<void> {
  try {
    await invoke("clear_all_history");
  } catch {
    // best-effort
  }
}
