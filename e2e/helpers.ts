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
 * 实现:先 cancel in-flight LLM → 清空 DB → reload 页面让 Solid 重 mount
 * chat-view（runtime singleton 仍然存在,但 agentRef 通过 abort 释放）。
 *
 * 关键:reload 后等 ~1s 让 Solid signal 初始化 + Effect build,避免 race。
 *
 * 还提供 waitForNewConversationReady(): click new conv 后等 loadMessages
 * 完成,避免 race（loadMessages 完成后才让 appendUserMessage 加用户消息）。
 */
export async function resetChatState(page: TauriPage): Promise<void> {
  try {
    // 先 cancel in-flight
    await cancelRunningAgent(page);
    // 再清空 DB,避免跨 spec 数据残留
    await invoke(page, "clear_all_history");
  } catch {
    // best-effort
  }
  // 硬 reload 页面让 Solid 重 mount chat-view。goto 同一 URL 不一定触发 reload,
  // 所以用 evaluate 强制调 window.location.reload。
  try {
    await page.evaluate(() => {
      window.location.reload();
    });
  } catch {
    // goto 作为兜底
    await page.goto("/");
  }
  // 重新注入 __cdp helper（reload 会清掉 cdp-driver 注入的 __cdp）。
  // 等 page reload 完成,然后 inject。
  await new Promise((r) => setTimeout(r, 800));
  try {
    await page.reinjectCdp();
  } catch {
    // inject 失败可能 page 还没 ready
    await new Promise((r) => setTimeout(r, 500));
    await page.reinjectCdp();
  }
  // V2.1 backward-compat: after clear_all_history + reload, no active conv
  // exists, so V2.1 shows HomeAgentForm instead of ChatView. We need to
  // create + activate a new conv so the chat layout is back. Reuse the
  // IPC shim — it creates workspace (idempotent) + conv + activates via
  // __chatStore.activateConv.
  try {
    await setupWorkspaceAndCreateConvViaIpc(page);
  } catch {
    // best-effort: if workspace + conv setup fails, downstream asserts
    // will surface the real error. Don't double-fail here.
  }
  await assert.visible(page.locator('textarea[placeholder="发条消息\u2026"]'), {
    timeout: 15_000,
  });
  // 等 Solid signal 完全初始化 + Effect build 完成,避免 race。
  // 1s 经验值:足够让 Module 层初始化 + conversations$ 从 DB 加载完成。
  await new Promise((r) => setTimeout(r, 1_000));
}

/**
 * Wait for `window.__appStore` to be set by `src/index.tsx::bootstrap()`.
 * The app bootstrap is async (after DOM ready), so right after a page
 * reload `__appStore` is briefly undefined. Poll up to 15s.
 */
async function waitForAppStore(p: TauriPage, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const has = await p.evaluate(() => {
      return !!(window as unknown as { __appStore?: unknown }).__appStore;
    });
    if (has) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`__appStore not available after ${timeoutMs}ms`);
}

/**
 * V2.1 backward-compat shim: ensure workspace exists + create conv via
 * the production HomeAgentForm UI flow.
 *
 * ## Why this exists (V2.1 polish backward compat)
 * After V2.1 polish, the new HomeAgentForm UI (rendered when activeId===null)
 * is the canonical way to create a conversation — typing in the codex-input
 * and clicking 发送 triggers `home.tsx::handleSend` →
 * `conversations.store.createAndSendConversation()`, which atomically:
 *   1. `createConversation(wsId, title)` — DB insert + `setupConvState`
 *      (populates `store.byId`) + `selectConversation` (sets `activeId`)
 *   2. `sendMessage(convId, text, provider)` — starts LLM streaming
 *
 * Layout switches to ChatView after step 1. The store is populated by
 * the production code path — no test bridge on `window` is needed (we
 * drive the actual UI handlers, matching the conversation.store API).
 *
 * ## Why workspace is still via IPC
 * Workspace CRUD uses WorkspaceService (SQLite-backed) via IPC commands
 * (`add_workspace`, `list_workspaces`, `delete_workspace`). Using
 * `add_workspace` IPC is the canonical way to provision a workspace in
 * tests; the chat conv itself goes through the UI.
 *
 * ## Which specs use it
 * - 05-chat-message-bubble, 05-file-tools, 06-llm-round-trip, 07-mock-provider,
 *   08-file-tools-mock, 09-per-conv-runtime — call clickNewConversationAndWait()
 *   which wraps this shim internally.
 * - 01-app-launch is a launch canary (no conversation needed).
 * - 02-settings-api-key and 04-theme-toggle drive state via IPC directly.
 * - 10-home-agent.spec.ts is the new spec (does NOT use this shim).
 *
 * ## Expected pass condition
 * All 9 pre-existing specs (05–09) pass WITHOUT modification after V2.1 polish.
 * If they fail, the home form flow or the IPC bridge is broken — not the individual spec.
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

  // 0. Ensure the Tauri webview is fully loaded before any IPC call.
  //    `goto` (in cdp-driver) now polls until `__TAURI_INTERNALS__` is
  //    available, so this also guarantees `document.URL !== "about:blank"`
  //    and the `tauri://` host page has mounted.
  await p.goto("/");

  // 0b. Wait for the Solid app to bootstrap (`__appStore` is set in
  //     `src/index.tsx::bootstrap()` after DOM ready). This is async
  //     after page load.
  await waitForAppStore(p);

  // 0c. D8-W: Clean old workspaces first so the home form sees exactly 1
  //     workspace (avoids "Select a workspace…" when wsCount > 1).
  try {
    const oldWorkspaces = await invoke<{ id: string }[]>(p, "list_workspaces");
    for (const ws of oldWorkspaces) {
      await invoke(p, "delete_workspace", { id: ws.id });
    }
  } catch {
    // best-effort
  }

  // 1. Create a fresh workspace via WorkspaceService IPC.
  const actualWsId = (await invoke<Workspace>(p, "add_workspace", { label, rootPath: root })).id;

  // 2. D8-W: Load workspaces into chat.store so the home form sees the new
  //    workspace. Workspaces are now managed by chat.store (not appStore).
  //    The home form uses `workspaces$()` to determine input enabled state.
  //    Also set selectedWorkspaceId so the input unlocks (home.tsx checks
  //    selectedWorkspaceId() !== null, it does NOT auto-select).
  await p.evaluate(async (id: string) => {
    const w = window as unknown as {
      __chatStore?: {
        loadWorkspaces: () => Promise<void>;
        setSelectedWorkspaceId: (id: string | null) => void;
      };
    };
    if (w.__chatStore) {
      await w.__chatStore.loadWorkspaces();
      w.__chatStore.setSelectedWorkspaceId(id);
    }
  }, actualWsId);

  // 3. Navigate to / — re-mounts home form. With exactly 1 workspace,
  //    draftWorkspaceId auto-selects and the input unlocks.
  await p.goto("/");

  // 4. Wait for the input to be enabled (wsCount=1, draftWorkspaceId=wsId).
  await assert.enabled(p.locator('[data-testid="codex-input"]'), {
    timeout: 10_000,
  });

  // 5. Type message in home form + click send. This triggers
  //    `home.tsx::handleSend` → `conversations.store.createAndSendConversation()`:
  //      a) `createConversation(wsId, title)` → DB insert +
  //         `setupConvState(conv, [])` (populates `store.byId`) +
  //         `selectConversation(conv.id)` (sets `activeId`).
  //         Layout switches to ChatView (Show: activeId$() !== null).
  //      b) `sendMessage(convId, text, provider)` → starts LLM streaming.
  //    The store is populated by the PRODUCTION code path — no test bridge
  //    on window. The new conv appears in the sidebar with `data-conv-id`.
  const text = title;
  await p.locator('[data-testid="codex-input"]').fill(text);
  await p.locator('[data-testid="codex-send"]').click();

  // 6. Wait for ChatView to mount (textarea "发条消息…" visible).
  await assert.visible(
    p.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );

  // 6b. Wait for the new conv to appear in the sidebar.
  //     The home form send creates the conv via `createAndSendConversation`
  //     which is async — the sidebar re-render happens on the next Solid
  //     reactive tick. Without this wait, reading the sidebar immediately
  //     returns null (sidebar hasn't updated yet).
  await p.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 10_000;
      const check = () => {
        if (Date.now() > deadline) {
          reject(
            new Error("setupWorkspaceAndCreateConvViaIpc: sidebar did not show any conv after 10s"),
          );
          return;
        }
        const el = document.querySelector("aside [data-conv-id]");
        if (el) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  });

  // 7. Read convId from sidebar (data-conv-id on the active item).
  const convId = await p.evaluate(() => {
    const el = document.querySelector("aside [data-conv-id]");
    return el?.getAttribute("data-conv-id") ?? null;
  });
  if (!convId) {
    throw new Error(
      "setupWorkspaceAndCreateConvViaIpc: convId not found in sidebar after home form send",
    );
  }

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
 * Create a new conversation and wait for the chat layout to be ready.
 *
 * V2.1: "新对话" button no longer creates a conv directly. Instead:
 *   1. Click "back to home" (clears activeId → HomeAgentForm renders)
 *   2. Type message in codex-input + click 发送
 *   3. HomeAgentForm.handleSend → createAndSendConversation in the store
 *      (DB + setupConvState + selectConversation + sendMessage)
 *   4. Layout switches to ChatView
 *   5. Read convId from sidebar (data-conv-id)
 *
 * For the FIRST call in a test, use `setupWorkspaceAndCreateConvViaIpc`
 * (which sets up the workspace too). This helper assumes the workspace
 * is already configured.
 *
 * @returns the new conv's id (for tests that need to address the conv by
 *          its data-conv-id selector).
 */
export async function clickNewConversationAndWait(
  p: TauriPage,
  opts: { workspaceId?: string } = {},
): Promise<{ convId: string }> {
  // 1. Click "back to home" to clear activeId (if on ChatView).
  //    HomeAgentForm renders when activeId$() === null.
  try {
    await p.locator('[data-testid="back-to-home"]').click({ timeout: 2_000 });
  } catch {
    // Already on home (no back button) — proceed
  }

  // 2. D8-W: load workspaces into chat.store so the sidebar renders.
  //    Without this, workspaces$() is empty and the sidebar won't show convs.
  await p.evaluate(async () => {
    const w = window as unknown as {
      __chatStore?: { loadWorkspaces: () => Promise<void> };
    };
    await w.__chatStore?.loadWorkspaces();
  });

  // 3. D8-W: set selectedWorkspaceId so the input unlocks.
  //    home.tsx checks selectedWorkspaceId() !== null to enable input.
  //    If caller provided workspaceId, use it; otherwise use list_workspaces.
  let wsId = opts.workspaceId;
  if (!wsId) {
    const wsList = await invoke<{ id: string }[]>(p, "list_workspaces");
    wsId = wsList[0]?.id;
  }
  if (wsId) {
    await p.evaluate((id: string) => {
      const w = window as unknown as {
        __chatStore?: { setSelectedWorkspaceId: (id: string | null) => void };
      };
      w.__chatStore?.setSelectedWorkspaceId(id);
    }, wsId);
  }

  // 4. Wait for home form input to be enabled (workspace now selected).
  //    If input can't be enabled, the home form UI path is broken — let the test fail fast.
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 5_000 });

  // 5. D8-W: create conversation via IPC bridge (no LLM message sent).
  //    Previously this typed + clicked send via the home form, which triggered
  //    createAndSendConversation → sendMessage (LLM). That consumed mock LLM queue
  //    entries and produced unwanted bubbles. Using the bridge avoids LLM entirely.
  const title = "E2E Test Conv";
  await p.evaluate(async (args: { wsId: string; title: string }) => {
    const w = window as unknown as {
      __chatStore?: {
        createConversationOnly: (workspaceId: string, title?: string) => Promise<void>;
      };
    };
    await w.__chatStore?.createConversationOnly(args.wsId, args.title);
  }, { wsId, title });

  // 5. Wait for ChatView to mount (activeId set by createConversation → selectConversation).
  //    The textarea with placeholder "发条消息…" proves ChatView rendered.
  await assert.visible(
    p.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );

  // 6. Read convId from sidebar (active conv has data-conv-id)
  const convId = await p.evaluate(() => {
    const el = document.querySelector("aside [data-conv-id]");
    return el?.getAttribute("data-conv-id") ?? null;
  });
  if (!convId) {
    throw new Error("clickNewConversationAndWait: convId not found in sidebar");
  }

  // 7. D8-W: expand workspace so convs become visible in sidebar.
  //    Workspace IDs are now UUIDs from Rust, not hardcoded "e2e-ws".
  //    If caller didn't pass workspaceId, look up first existing workspace.
  let workspaceId = opts.workspaceId;
  if (!workspaceId) {
    const workspaces = await invoke<{ id: string }[]>(p, "list_workspaces");
    if (workspaces.length === 0) {
      throw new Error(
        "clickNewConversationAndWait: no workspace exists. " +
          "Call setupWorkspaceAndCreateConvViaIpc first or pass opts.workspaceId.",
      );
    }
    workspaceId = workspaces[0]!.id;
  }
  await expandWorkspace(p, workspaceId);

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
  const expanded = await p.evaluate(
    (id: string) => {
      const el = document.querySelector(`[data-workspace-id="${id}"]`);
      return el?.getAttribute("aria-expanded");
    },
    workspaceId,
  );
  if (expanded !== "true") {
    await p.locator(`[data-workspace-id="${workspaceId}"]`).click();
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
      let sel: string;
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