//! e2e/helpers.ts — 共享 utility。Spec 们从这里导入 invoke / clearAllHistory /
//! cancelRunningAgent / assert / ElectronLocator / ElectronPage 等。
//!
//! Multi-worker 改造 (2026-06): 删除了原来的 module-singleton `page` +
//! `getTauriPage()` / `disposeTauriPage()`。每个 worker 在自己的 V3 Electron 实例
//! 上跑（见 e2e/fixtures.ts），spec 通过 `{ electronEnv }` fixture 拿到 page，
//! 然后把 page 作为第一个参数传给本文件里的 helper。
//!
//! 跟 Playwright `connectOverCDP` 不同(Chromium 的 remote-debugging 限制),
//! 我们直接连 CDP。因此 helpers 的 API 是我们自己实现的 Page/Locator 包装,
//! 但调用语法 跟 Playwright 一致,spec 文件改动最小。

import { assert, ElectronLocator, ElectronPage } from "./cdp-driver";
import type { Workspace } from "../src/shared/lib/types";
import * as path from "node:path";
import * as os from "node:os";

// Re-export V3 names + V2 deprecated aliases.
export { ElectronLocator, ElectronPage, assert };
/** @deprecated Use ElectronLocator (V3). */
export type TauriLocator = ElectronLocator;
/** @deprecated Use ElectronPage (V3). */
export type TauriPage = ElectronPage;

/**
 * 调 V3 Electron IPC 命令。Spec 用它做端到端断言（不依赖 UI 反馈）。
 * 实际是在 webview 里跑 `window.codeman.invoke(channel, args)` — 由
 * electron/preload/index.ts 通过 contextBridge 暴露的通用 escape hatch。
 *
 * 实现注意：内层函数必须是 `async`,以便在调用方视角把 invoke promise 的
 * rejection 包装成同步的 throw。`await` + `try/catch` + `throw new Error`
 * 显式重抛确保 CDP `Runtime.evaluate` 收到的 `exceptionDetails.text`
 * 是真实的 main 端错误（不被吞为 "Uncaught (in promise)"）。
 *
 * @param page  - Per-worker ElectronPage（来自 `electronEnv.page` fixture）
 */
export async function invoke<T = unknown>(
  page: ElectronPage,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await page.evaluate(
    async ([c, a]) => {
      const w = window as unknown as {
        codeman?: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
      };
      if (!w.codeman) {
        throw new Error(
          "window.codeman is missing — is the V3 Electron preload actually loaded?",
        );
      }
      try {
        return await w.codeman.invoke(c, a ?? {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null ? JSON.stringify(e) : String(e);
        throw new Error(`V3 invoke(${c}) failed: ${msg}`);
      }
    },
    [cmd, args ?? {}] as const,
  );
  return result as T;
}

/**
 * 触发 chat 输入框的提交。
 *
 * 实现:直接点击 Send button。不依赖 form onSubmit 隐式链,因为
 * V3 Chromium + Solid 组合下 form submit event 派发链不可靠
 * (per V2 经验 — V3 同样 Electron 内 Chromium 内核)。
 */
export async function submitForm(p: ElectronPage): Promise<void> {
  await p.locator('button[type="submit"]').click();
}

/** 重置对话 + 消息历史。Spec 间清理用，失败不抛。 */
export async function clearAllHistory(page: ElectronPage): Promise<void> {
  try {
    await invoke(page, "clearAllHistory");
  } catch {
    // best-effort
  }
}

/**
 * 取消任何 in-flight LLM 调用。Spec beforeEach 调用，防止前 spec 的
 * 慢 LLM 响应让 Send 按钮卡在 Cancel 状态。
 */
export async function cancelRunningAgent(page: ElectronPage): Promise<void> {
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
    await invoke(page, "clearAllHistory");
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
  const root = opts.workspaceRoot ?? path.join(os.tmpdir(), `codeman-e2e-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const title = opts.title ?? "E2E Test Conv";

  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // Clean old workspaces
  try {
    const oldWorkspaces = await invoke<{ id: string }[]>(p, "listWorkspaces");
    for (const ws of oldWorkspaces) {
      await invoke(p, "deleteWorkspace", { id: ws.id });
    }
  } catch { /* best-effort */ }

  // Create workspace via IPC
  const actualWsId = (await invoke<Workspace>(p, "addWorkspace", { label, rootPath: root })).id;

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
 * - Workspace provisioned via invoke(page, "addWorkspace", ...)
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

  // 2. Refresh workspaces from DB (workspaces may have been created via raw
  //    IPC in beforeAll, bypassing the in-memory store).  Without this the
  //    HomeAgentForm shows "No workspaces" and the send button is disabled.
  await p.evaluate(() => {
    const w = window as unknown as { __chatStore?: { loadWorkspacesAsync: () => Promise<void> } };
    return w.__chatStore?.loadWorkspacesAsync() ?? Promise.resolve();
  });

  // 3. Wait for home form input to appear
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // 4. Select workspace from picker (trigger click → select option by label).
  //    V3 e2e: if no label given but 2+ workspaces exist, select the first
  //    one — otherwise the codex-input stays disabled and send is a no-op.
  //    Previous specs' workspaces persist in the DB (state pollution), so
  //    auto-select-via-label is not enough.
  //
  //    ⚠️  Scope option search to [data-testid="workspace-select-content"]
  //    only — document.querySelectorAll('[role="option"]') also matches
  //    options from the LLM picker (CodemanGroupSelect), and without a
  //    label the first match would be the wrong picker, leaving
  //    selectedWorkspaceId null and the send button disabled.
  //    ⚠️  Ark UI renders its dropdown content asynchronously (portal);
  //    100ms setTimeout is not enough — poll for the content element.
  const wsLabel = opts.workspaceLabel;
  await p.evaluate(async (label: string | null) => {
    const trigger = document.querySelector('[data-testid="workspace-select-trigger"]') as HTMLElement;
    if (!trigger) {return;}
    const triggerText = (trigger.textContent ?? "").trim();
    const needsSelect = label !== null || triggerText === "" || triggerText === "Select a workspace…";
    if (!needsSelect) {return;}
    trigger.click();
    // Poll for the workspace select content (Ark UI portal) up to 2s
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const content = document.querySelector('[data-testid="workspace-select-content"]');
      if (content) {
        const items = content.querySelectorAll<HTMLElement>('[role="option"]');
        if (items.length > 0) {
          if (label !== null) {
            for (const item of Array.from(items)) {
              const text = (item.textContent ?? "").trim();
              if (text === label) { item.click(); break; }
            }
          } else {
            items[0]!.click();
          }
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }, wsLabel ?? null);
  await new Promise((r) => setTimeout(r, 300));

  // 4. Type + submit
  const text = opts.title ?? "E2E Test Conv";
  await p.locator('[data-testid="codex-input"]').fill(text);

  await p.locator('[data-testid="codex-send"]').click();

  // 5. Wait for ChatView mount
  await assert.visible(
    p.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );

  // 6. Read convId from the router's internal state (not window.location, which
  //    may lag the navigate() call by a tick or differ in app:// scheme).
  const convId = await p.evaluate(() => {
    const w = window as unknown as {
      __router?: {
        state: {
          location: {
            pathname: string;
            params?: Record<string, unknown>;
          };
        };
      };
    };
    if (w.__router) {
      // Try params first (canonical), then parse pathname.
      const params = w.__router.state.location.params;
      if (params && typeof params === "object" && "convId" in params) {
        return String((params as { convId: unknown }).convId);
      }
      const m = w.__router.state.location.pathname.match(/\/conversation\/(.+)/);
      if (m) {return m[1] ?? null;}
    }
    const m = window.location.pathname.match(/\/conversation\/(.+)/);
    return m?.[1] ?? null;
  });
  if (!convId) {
    throw new Error("clickNewConversationAndWait: no convId in URL after navigation");
  }

  return { convId };
}

// ─── D7-CS Path-based Workspace Helpers ───────────────────────────────────────

/**
 * 通过 rootPath 创建/选中 workspace（D7-CS 1:1 语义）。
 * 用 path 而非 id 作为 workspace 的语义 key。
 *
 * @param p  TauriPage
 * @param opts.rootPath  workspace rootPath（语义 key）
 * @param opts.label     可选 display label
 * @param opts.selectAsLastUsed  是否设为 last_used_workspace_id
 * @returns workspace id
 */
export async function ensureWorkspaceByPath(
  p: TauriPage,
  opts: { rootPath: string; label?: string; selectAsLastUsed?: boolean },
): Promise<string> {
  const workspaces = await invoke<{ id: string; rootPath: string }[]>(p, "listWorkspaces");
  const existing = workspaces.find((ws) => ws.rootPath === opts.rootPath);
  if (existing) {
    return existing.id;
  }
  // Create new workspace via IPC — id is generated on the Rust side
  const label = opts.label ?? opts.rootPath.split(/[/\\]/).pop() ?? "E2E WS";
  const id = (await invoke<Workspace>(p, "addWorkspace", { label, rootPath: opts.rootPath })).id;
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
        if (!ws) {return null;}
        const convs = Array.from(ws.querySelectorAll("[data-conv-id]"));
        const el = convs[args.n];
        if (!el) {return null;}
        return {
          convId: el.getAttribute("data-conv-id")!,
          workspaceId: args.workspaceId,
        };
      } else {
        const convs = Array.from(document.querySelectorAll(`aside [data-conv-id]`));
        const el = convs[args.n];
        if (!el) {return null;}
        const parentWs = el.closest("[data-workspace-id]");
        return {
          convId: el.getAttribute("data-conv-id")!,
          workspaceId: parentWs?.getAttribute("data-workspace-id") ?? "",
        };
      }
    },
    { n, workspaceId: scope?.workspaceId },
  );
  if (!result) {throw new Error(`nthConv(${n}): not found`);}
  return result;
}

/**
 * 清理所有 conv + workspaces（spec 间 reset 用）。
 * 调用 clear_all_history + 写空 workspaces[]。
 */
export async function resetSidebar(p: TauriPage): Promise<void> {
  await clearAllHistory(p);
  try {
    const workspaces = await invoke<{ id: string }[]>(p, "listWorkspaces");
    for (const ws of workspaces) {
      await invoke(p, "deleteWorkspace", { id: ws.id });
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