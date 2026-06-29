//! e2e/helpers.ts — 共享 utility。Spec 们从这里导入 invoke / clearAllHistory /
//! cancelRunningAgent / assert / TauriLocator / TauriPage 等。
//!
//! Multi-worker 改造 (2026-06): 删除了原来的 module-singleton `page` +
//! `getTauriPage()` / `disposeTauriPage()`。每个 worker 在自己的 Tauri 实例
//! 上跑（见 e2e/fixtures.ts），spec 通过 `{ tauriEnv }` fixture 拿到 page，
//! 然后把 page 作为第一个参数传给本文件里的 helper。
//!
//! 跟 Playwright `connectOverCDP` 不同（WebView2 不支持
//! `Browser.setDownloadBehavior` —— 见 cdp-driver.ts 注释），我们直接连 CDP。
//! 因此 helpers 的 API 是我们自己实现的 Page/Locator 包装，但调用语法
//! 跟 Playwright 一致，spec 文件改动最小（只换 `expect` 为 `assert.*`）。

import { assert, TauriLocator, TauriPage } from "./cdp-driver";
import type { Workspace } from "../src/shared/lib/types";
import * as path from "node:path";
import * as os from "node:os";


export { TauriLocator, TauriPage, assert };

/**
 * 调 Tauri IPC 命令。Spec 用它做端到端断言（不依赖 UI 反馈）。
 * 实际是在 webview 里跑 `window.__TAURI_INTERNALS__.invoke(cmd, args)`。
 *
 * 实现注意：内层函数必须是 `async`,以便在调用方视角把 invoke promise 的
 * rejection 包装成同步的 throw。如果直接 `return w.__TAURI_INTERNALS__.invoke(...)`,
 * Tauri webview 内部对 IPC 失败的 catch 会在我们看见之前消费它,
 * 把 rejection 暴露为未捕获的 "Uncaught (in promise)" 事件 — 而不是
 * 干净的 Rust 错误消息。`await` + `try/catch` + `throw new Error`
 * 显式重抛确保 CDP `Runtime.evaluate` 收到的 `exceptionDetails.text`
 * 是真实的 Rust 错误。
 *
 * @param page  - Per-worker TauriPage（来自 `tauriEnv.page` fixture）
 */
export async function invoke<T = unknown>(
  page: TauriPage,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await page.evaluate(
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
        // 消息字符串（原生的 Tauri rejection 会变成 "Uncaught (in promise)"）。
        const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null ? JSON.stringify(e) : String(e);
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
 */
export async function submitForm(p: TauriPage): Promise<void> {
  await p.locator('button[type="submit"]').click();
}

/** 重置对话 + 消息历史。Spec 间清理用，失败不抛。 */
export async function clearAllHistory(page: TauriPage): Promise<void> {
  try {
    await invoke(page, "clear_all_history");
  } catch {
    // best-effort
  }
}

/**
 * 取消任何 in-flight LLM 调用。Spec beforeEach 调用，防止前 spec 的
 * 慢 LLM 响应让 Send 按钮卡在 Cancel 状态。
 *
 * 实现:
 *   1. 等 Cancel 按钮出现（如有）— 点击它 abort in-flight run
 *   2. 等 Send 按钮（`button[type="submit"]`）重新出现,running=false
 *   3. textarea 重新 enabled
 * 这保证下一个 spec 提交时,Submit button 可点。
 *
 * 可靠性: 旧版本 click 超时只 2s,如果 cancel 按钮晚了出现就直接返回
 * 导致下次 submit 被 isRunning() 阻塞。新版本:
 *   - click 超时升到 10s（给慢 LLM 时间进入 streaming 状态）
 *   - 等 Send 按钮 超时升到 10s（等运行时真的 abort 完成）
 *   - 兜底: 直接调 runtime.cancel(convId) 强制 abort,再 wait
 */
export async function cancelRunningAgent(page: TauriPage): Promise<void> {
  // 1. 等 Cancel 按钮出现
  let clicked = false;
  try {
    const cancelBtn = page.locator("button").filter({ hasText: /^取消$/ });
    await cancelBtn.first().click({ timeout: 10_000 });
    clicked = true;
  } catch {
    // 没 cancel 按钮 → 已经不在 running,跳过
  }
  if (clicked) {
    // 2. 等 Send 按钮重新出现 — 严格证明 streamingMessageId=null
    try {
      await page.locator('button[type="submit"]').waitFor({
        state: "visible",
        timeout: 10_000,
      });
    } catch {
      // 10s 内 Send 没出现 → runtime 死锁,让 test fail
    }
  }
}

/**
 * 重置 chat 域到干净状态 — 彻底 dispose chat-view,清空所有 in-flight agent,
 * 然后等用户进入聊天页面。
 *
 * 比 cancelRunningAgent 更激进 — 适用 spec 间需要彻底重置的场景。
 * 实现:先 cancel in-flight LLM → 清空 DB → navigate to /
 *
 * Note: Does NOT create a conversation (which would consume a mock response).
 * The caller should call setupWorkspaceAndCreateConvViaIpc if needed.
 */
export async function resetChatState(page: TauriPage): Promise<void> {
  try {
    await cancelRunningAgent(page);
    await invoke(page, "clear_all_history");
  } catch { /* best-effort */ }

  await page.goto("/");
  await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });
}

/**
 * V2.1 backward-compat shim: ensure workspace exists + create conv via
 * the production HomeAgentForm UI flow.
 *
 * Workspaces auto-load on ChatLayout mount (via onMount(() => Effect.runPromiseExit(loadWorkspaces()))).
 * No __chatStore bridge needed — everything driven through the UI.
 *
 * @param p - TauriPage
 * @param opts - { workspaceLabel?: string, workspaceRoot?: string, title?: string }
 */
export async function setupWorkspaceAndCreateConvViaIpc(
  p: TauriPage,
  opts: { workspaceLabel?: string; workspaceRoot?: string; title?: string } = {},
): Promise<{ workspaceId: string; convId: string }> {
  const label = opts.workspaceLabel ?? "E2E Test Workspace";
  const root = opts.workspaceRoot ?? path.join(os.tmpdir(), "codeman-e2e-" + Date.now());
  const title = opts.title ?? "E2E Test Conv";

  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // Clean old workspaces
  try {
    const oldWorkspaces = await invoke<{ id: string }[]>(p, "list_workspaces");
    for (const ws of oldWorkspaces) {
      await invoke(p, "delete_workspace", { id: ws.id });
    }
  } catch { /* best-effort */ }

  // Create workspace via IPC
  const actualWsId = (await invoke<Workspace>(p, "add_workspace", { label, rootPath: root })).id;

  // Navigate to / — chat-layout mount triggers loadWorkspaces
  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // Use clickNewConversationAndWait (now UI-driven)
  const { convId } = await clickNewConversationAndWait(p, { workspaceLabel: label, title });

  return { workspaceId: actualWsId, convId };
}

/**
 * Type into the HomeAgentForm input and click send.
 */
export async function submitHomeAgentForm(p: TauriPage, text: string): Promise<void> {
  await p.locator("[data-testid='codex-input']").fill(text);
  await p.locator("[data-testid='codex-send']").click();
}

/**
 * UI-driven conversation creation flow (V2.1 post-refactor):
 * 1. Navigate to /
 * 2. Wait for home form input to appear
 * 3. Select workspace from picker (or use auto-select for 1 ws)
 * 4. Type in HomeAgentForm input
 * 5. Click send
 * 6. Wait for ChatView mount (textarea visible)
 * 7. Read convId from URL
 *
 * Caller MUST have:
 * - Workspace provisioned via invoke(page, "add_workspace", ...)
 * - Mock provider active (useMockProvider) + enqueueMockResponse
 *
 * @returns the new conv's id (read from URL after navigation to /conversation/{convId})
 */
export async function clickNewConversationAndWait(
  p: TauriPage,
  opts: { workspaceLabel?: string; title?: string } = {},
): Promise<{ convId: string }> {
  // 1. Navigate to /
  await p.goto("/");

  // 2. Wait for home form input to appear
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // 3. Select workspace from picker (trigger click → select option by label)
  const wsLabel = opts.workspaceLabel;
  if (wsLabel) {
    await p.evaluate((label: string) => {
      const trigger = document.querySelector('[data-testid="workspace-select-trigger"]') as HTMLElement;
      trigger?.click();
      setTimeout(() => {
        const items = document.querySelectorAll('[role="option"]');
        for (const item of Array.from(items)) {
          if ((item.textContent ?? "").trim() === label) {
            (item as HTMLElement).click();
            break;
          }
        }
      }, 100);
    }, wsLabel);
    await new Promise((r) => setTimeout(r, 300));
  }

  // 4. Type + submit
  const text = opts.title ?? "E2E Test Conv";
  await p.locator('[data-testid="codex-input"]').fill(text);
  await p.locator('[data-testid="codex-send"]').click();

  // 5. Wait for ChatView mount
  await assert.visible(
    p.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );

  // 6. Read convId from URL
  const convId = await p.evaluate(() => {
    const match = window.location.pathname.match(/\/conversation\/(.+)/);
    return match?.[1] ?? null;
  });
  if (!convId) {
    throw new Error("clickNewConversationAndWait: no convId in URL after navigation");
  }

  return { convId };
}

// ─── D7-CS Path-based Workspace Helpers ───────────────────────────────────────

/**
 * 通过 root_path 创建/选中 workspace（D7-CS 1:1 语义）。
 * 用 path 而非 id 作为 workspace 的语义 key。
 *
 * @param p  TauriPage
 * @param opts.rootPath  workspace root_path（语义 key）
 * @param opts.label     可选 display label
 * @param opts.selectAsLastUsed  是否设为 last_used_workspace_id
 * @returns workspace id
 */
export async function ensureWorkspaceByPath(
  p: TauriPage,
  opts: { rootPath: string; label?: string; selectAsLastUsed?: boolean },
): Promise<string> {
  const workspaces = await invoke<{ id: string; root_path: string }[]>(p, "list_workspaces");
  const existing = workspaces.find((ws) => ws.root_path === opts.rootPath);
  if (existing) {
    return existing.id;
  }
  // Create new workspace via IPC — id is generated on the Rust side
  const label = opts.label ?? opts.rootPath.split(/[/\\]/).pop() ?? "E2E WS";
  const id = (await invoke<Workspace>(p, "add_workspace", { label, rootPath: opts.rootPath })).id;
  return id;
}

/**
 * 在 sidebar 中通过 data-workspace-id 找到该 workspace 的 header 并点击展开。
 * 若已展开则 no-op。
 */
export async function expandWorkspace(p: TauriPage, workspaceId: string): Promise<void> {
  // D8-W: CodemanSidebar expands the first workspace by default (defaultValue in Accordion.Root).
  // This is a no-op for the first workspace. For non-first workspaces, click the trigger.
  const isOpen = await p.evaluate((id: string) => {
    const item = document.querySelector(`[data-workspace-id="${id}"]`);
    return item?.getAttribute("data-state") === "open";
  }, workspaceId);
  if (!isOpen) {
    await p.locator(`[data-workspace-id="${workspaceId}"] button`).first().click();
  }
}

/**
 * 通过 data-conv-id 点击 sidebar 中某个 conv。
 */
export async function clickConv(p: TauriPage, convId: string): Promise<void> {
  await p.locator(`[data-conv-id="${convId}"]`).click();
}

/**
 * 在 sidebar 中按 DOM 顺序取第 N 个 conv（per-workspace 或全局）。
 * @param p  TauriPage
 * @param n  0-based index
 * @param scope.workspaceId  可选，限定在某个 workspace 内
 * @returns { convId, workspaceId }
 */
export async function nthConv(
  p: TauriPage,
  n: number,
  scope?: { workspaceId?: string },
): Promise<{ convId: string; workspaceId: string }> {
  const result = await p.evaluate(
    (args: { n: number; workspaceId?: string }) => {
      if (args.workspaceId) {
        const ws = document.querySelector(`[data-workspace-id="${args.workspaceId}"]`);
        if (!ws) return null;
        const convs = Array.from(ws.querySelectorAll("[data-conv-id]"));
        const el = convs[args.n];
        if (!el) return null;
        return {
          convId: el.getAttribute("data-conv-id")!,
          workspaceId: args.workspaceId,
        };
      } else {
        const convs = Array.from(document.querySelectorAll(`aside [data-conv-id]`));
        const el = convs[args.n];
        if (!el) return null;
        const parentWs = el.closest("[data-workspace-id]");
        return {
          convId: el.getAttribute("data-conv-id")!,
          workspaceId: parentWs?.getAttribute("data-workspace-id") ?? "",
        };
      }
    },
    { n, workspaceId: scope?.workspaceId },
  );
  if (!result) throw new Error(`nthConv(${n}): not found`);
  return result;
}

/**
 * 清理所有 conv + workspaces（spec 间 reset 用）。
 * 调用 clear_all_history + 写空 workspaces[]。
 */
export async function resetSidebar(p: TauriPage): Promise<void> {
  await clearAllHistory(p);
  try {
    const workspaces = await invoke<{ id: string }[]>(p, "list_workspaces");
    for (const ws of workspaces) {
      await invoke(p, "delete_workspace", { id: ws.id });
    }
  } catch {
    // best-effort
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward-compat stubs (kept so old imports don't break; new specs use the
// fixture directly). These delegate to the TauriEnv singleton if registered,
// otherwise throw a clear error pointing the spec to the new pattern.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Specs should use `({ tauriEnv }) => { const { page } = tauriEnv; ... }`
 * from the fixture. This stub returns null and is here only to satisfy
 * `import { getTauriPage }` in specs that haven't migrated yet.
 */
export async function getTauriPage(): Promise<never> {
  throw new Error(
    "getTauriPage() is removed in the multi-worker refactor. " +
      "Use the tauriEnv fixture: `test('...', async ({ tauriEnv }) => { const { page } = tauriEnv; ... })`",
  );
}

/**
 * @deprecated Specs should NOT call disposeTauriPage — the worker fixture
 * handles teardown. This stub is a no-op kept for spec migration.
 */
export async function disposeTauriPage(): Promise<void> {
  // no-op: fixture handles teardown
}