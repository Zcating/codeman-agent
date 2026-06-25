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
  if (page) {
    return page;
  }
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
 *
 * 实现注意：内层函数必须是 `async`,以便在调用方视角把 invoke promise 的
 * rejection 包装成同步的 throw。如果直接 `return w.__TAURI_INTERNALS__.invoke(...)`,
 * Tauri webview 内部对 IPC 失败的 catch 会在我们看见之前消费它,
 * 把 rejection 暴露为未捕获的 "Uncaught (in promise)" 事件 — 而不是
 * 干净的 Rust 错误消息。`await` + `try/catch` + `throw new Error`
 * 显式重抛确保 CDP `Runtime.evaluate` 收到的 `exceptionDetails.text`
 * 是真实的 Rust 错误。
 */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const p = page ?? (await getTauriPage());
  const result = await p.evaluate(
    async ([c, a]) => {
      const w = window as unknown as {
        __TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
      };
      if (!w.__TAURI_INTERNALS__) {
        throw new Error(
          "window.__TAURI_INTERNALS__ is missing — is the Tauri webview actually loaded?",
        );
      }
      try {
        return await w.__TAURI_INTERNALS__.invoke(c, a ?? {});
      } catch (e) {
        // 重抛为 Error 实例,让 cdp-driver 的 exceptionDetails 拿到干净的
        // 消息字符串(原生的 Tauri rejection 会变成 "Uncaught (in promise)")。
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Tauri invoke(${c}) failed: ${msg}`);
      }
    },
    [cmd, args ?? {}] as const,
  );
  return result as T;
}

/**
 * 触发 chat 输入框的提交。
 *
 * 实现:直接调用 ChatView 给 Send button 装的 onClick handler —
 * 不依赖 form onSubmit + button click 隐式链。原因:
 *  WebView2 + Solid 组合下,form 的 submit event 派发链
 * (click → 默认 submit → submit event → Solid listener)不可靠 — 三层
 * capture/bubble/document listener 都 fire,但 Solid 的 onSubmit 没反应。
 *  显式 button.onClick 是直接的 click → handler 路径,跟 form 解耦。
 *
 * 函数化是因为 4 个 spec (03 / 04-llm-stream / 05 #1 / 05 #2) 都用同一行
 * page.locator('button[type="submit"]').click(),这里抽出来便于追踪。
 */
export async function submitForm(p: TauriPage): Promise<void> {
  await p.locator('button[type="submit"]').click();
}

/** 重置对话 + 消息历史。Spec 间清理用,失败不抛。 */
export async function clearAllHistory(): Promise<void> {
  try {
    await invoke("clear_all_history");
  } catch {
    // best-effort
  }
}

/**
 * 取消任何 in-flight LLM 调用。Spec beforeEach 调用,防止前 spec 的
 * 慢 LLM 响应让 Send 按钮卡在 Cancel 状态。
 *
 * 实现:
 *   1. 等 Cancel 按钮出现(如有)— 点击它 abort in-flight run
 *   2. 等 Send 按钮(`button[type="submit"]`)重新出现,running=false
 *   3. textarea 重新 enabled
 * 这保证下一个 spec 提交时,Submit button 可点。
 */
export async function cancelRunningAgent(): Promise<void> {
  const p = page ?? (await getTauriPage());
  try {
    const cancelBtn = p.locator("button").filter({ hasText: /^取消$/ });
    await cancelBtn.first().click({ timeout: 2_000 });
  } catch {
    // 没 cancel 按钮或已经不在 running,no-op
    return;
  }
  // 等 Send 按钮(type="submit") 重新出现 — 严格证明 running=false
  try {
    await p.locator('button[type="submit"]').waitFor({
      state: "visible",
      timeout: 5_000,
    });
  } catch {
    // 5s 内 Send 没出现,可能是 runtime 死锁,继续让 test fail
  }
}

/**
 * 重置 chat 域到干净状态 — 彻底 dispose chat-view,清空所有 in-flight agent,
 * 然后等用户进入聊天页面。
 *
 * 比 cancelRunningAgent 更激进 — 适用 spec 间需要彻底重置的场景。
 * 实现:先 cancel in-flight LLM → 清空 DB → reload 页面让 Solid 重 mount
 * chat-view(runtime singleton 仍然存在,但 agentRef 通过 abort 释放)。
 *
 * 关键:reload 后等 ~1s 让 Solid signal 初始化 + Effect build,避免 race。
 *
 * 还提供 waitForNewConversationReady(): click new conv 后等 loadMessages
 * 完成,避免 race(loadMessages 完成后才让 appendUserMessage 加用户消息)。
 */
export async function resetChatState(): Promise<void> {
  const p = page ?? (await getTauriPage());
  try {
    // 先 cancel in-flight
    await cancelRunningAgent();
    // 再清空 DB,避免跨 spec 数据残留
    await invoke("clear_all_history");
  } catch {
    // best-effort
  }
  // 硬 reload 页面让 Solid 重 mount chat-view。goto 同一 URL 不一定触发 reload,
  // 所以用 evaluate 强制调 window.location.reload。
  try {
    await p.evaluate(() => {
      window.location.reload();
    });
  } catch {
    // goto 作为兜底
    await p.goto("/");
  }
  // 重新注入 __cdp helper(reload 会清掉 cdp-driver 注入的 __cdp)。
  // 等 page reload 完成,然后 inject。
  await new Promise((r) => setTimeout(r, 800));
  try {
    await p.reinjectCdp();
  } catch {
    // inject 失败可能 page 还没 ready
    await new Promise((r) => setTimeout(r, 500));
    await p.reinjectCdp();
  }
  await assert.visible(p.locator('textarea[placeholder="发条消息\u2026"]'), {
    timeout: 15_000,
  });
  // 等 Solid signal 完全初始化 + Effect build 完成,避免 race。
  // 1s 经验值:足够让 Module 层初始化 + conversations$ 从 DB 加载完成。
  await new Promise((r) => setTimeout(r, 1_000));
}

/**
 * Click "New conversation" 按钮,等 active item + messages load 完成,
 * 保证下一步 submit 不会跟 loadMessages IPC race。
 */
export async function clickNewConversationAndWait(p: TauriPage): Promise<void> {
  await p.locator('button[title="新建会话"]').click();
  const activeItem = p.locator("aside li.bg-primary").first();
  await assert.visible(activeItem, { timeout: 5_000 });
  // 等 ~500ms 让 create_conversation IPC + loadMessages IPC 都完成,
  // 避免 race:loadMessages 完成后才让 appendUserMessage 加用户消息。
  await new Promise((r) => setTimeout(r, 500));
}
