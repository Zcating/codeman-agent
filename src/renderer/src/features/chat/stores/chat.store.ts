//! Effect → Solid 会话桥接层 (V2 ADR-0019: 吸收 messages.store + agent.store)。
//!
//! 唯一响应式源: Solid `createStore<{ activeId, byId: Record<ConvId, ConversationState> }>`。
//! ConversationState = DB fields + messages + streamingMessageId + runtime。
//! UI 读 store.byId[activeId()].messages,Solid proxy 按路径细粒度反应式。
//!
//! Task 4 范围: ConversationState 类型 + createStore + setupConvState + accessors。
//! 后续 Task 5/6/7 加 sendMessage / cancel / archive / delete / loadConversations / createConversation。

import { createSignal, type Accessor } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { Effect, Stream } from "effect";
import type { Conversation, Message, SkillManifest, Workspace } from "@codeman-frontend/shared/lib/types";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import {
  createAgentRuntime,
  type AgentRuntime,
  type RuntimeEvent,
  type ProviderConfig,
} from "@codeman-frontend/features/chat/lib/runtime";
import {
  ConversationApi,
  ConversationApiLive,
  MessageApi,
  MessageApiLive,
} from "@codeman-frontend/shared/apis";
import {
  WorkspaceService,
  WorkspaceServiceLive,
} from "@codeman-frontend/shared/lib/workspace-service";
import { deriveLabelFromPath } from "@codeman-frontend/shared/lib/derive-label-from-path";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { skillsManifests$ } from "@codeman-frontend/plugins/skills/stores/skills.store";

// ─── ConversationState 类型 (inline 在 chat.store) ──────

export interface ConversationState {
  // DB-backed fields (mirror shared/lib/types.ts Conversation)
  id: string;
  title: string;
  systemPrompt: string | null;
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  // Per-conv reactive state
  messages: Message[];
  streamingMessageId: string | null;
  // Bug B: 上次 runtime error 的人读消息，null 表示无错误。
  // 任何 send 成功（type:'done'）后清空。
  lastError: string | null;
  // Per-conv runtime (createAgentRuntime 工厂产物)
  runtime: AgentRuntime;
}

// ─── 单一响应式源: Solid createStore ──────────────────────────

const [store, setStore] = createStore<{
  byId: Record<string, ConversationState>;
  workspaces: Workspace[];
}>({
  byId: {},
  workspaces: [],
});

export { store, setStore };

// ─── Accessors (for UI components) ─────────────────────────────

const [conversations, setConversationsSignal] = createSignal<ConversationState[]>([]);
export const conversations$: Accessor<ConversationState[]> = conversations;

// ─── Workspace state (D8-W) ──────────────────────────────────────────

const [workspaces, setWorkspacesSignal] = createSignal<Workspace[]>([]);
export const workspaces$: Accessor<Workspace[]> = workspaces;

const [selectedWorkspaceId, setSelectedWorkspaceIdSignal] = createSignal<string | null>(null);
export const selectedWorkspaceId$: Accessor<string | null> = selectedWorkspaceId;

export function setSelectedWorkspaceId(id: string | null): void {
  setSelectedWorkspaceIdSignal(id);
}

// ─── setupConvState: 初始化 ConvState ────────────────────────

export function setupConvState(conv: Conversation, history: Message[]): ConversationState {
  const runtime = createAgentRuntime();
  const cs: ConversationState = {
    id: conv.id,
    title: conv.title,
    systemPrompt: conv.systemPrompt,
    workspaceId: conv.workspaceId,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    archivedAt: conv.archivedAt,
    messages: history,
    streamingMessageId: null,
    lastError: null,
    runtime,
  };
  setStore("byId", conv.id, cs);
  // 同步 conversations$ accessor
  setConversationsSignal(Object.values(store.byId));
  return cs;
}

// ─── DB 持久化辅助 (Effect.fnUntraced) ───────────────────────────────
//
// 与公共 store API (sendMessage / archiveConversation / ...) 不同,这两个是
// sendMessage 的紧耦合内部分支,嵌套在已 traced 的 sendMessage span 内。
// 按上游 .repos/effect/.patterns/effect.md "Prefer Effect.fnUntraced over
// functions that only return Effect.gen" 改写:
//  - 复用 generator body(避免每次 sendMessage 重新分配 closure)
//  - 跳过 trace span(嵌套 span 价值低,加 span 是 noise)
//  - 提供 MessageApiLive 通过 fnUntraced 第二参数 transform,与 Effect.provide 同效
//
// 注意:必须 const + module-top,不能 function 声明 — sendMessage 在 line 110
// 引用这俩,const 没有 hoisting,TDZ 会炸。

const persistUserMessage = Effect.fnUntraced(
  function* (msg: Message) {
    const svc = yield* MessageApi;
    yield* svc.append({
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
    });
  },
  Effect.provide(MessageApiLive),
);

const persistAssistantMessage = Effect.fnUntraced(
  function* (msg: Message) {
    const svc = yield* MessageApi;
    yield* svc.append({
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking ?? undefined,
      toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : undefined,
      toolResults: msg.toolResults ? JSON.stringify(msg.toolResults) : undefined,
      model: msg.model ?? undefined,
    });
  },
  Effect.provide(MessageApiLive),
);

// ─── sendMessage: append user msg + run + subscribe ───────────

export const sendMessage = Effect.fnUntraced(
  function* (convId: string, content: string, provider: ProviderConfig) {
    const cs = store.byId[convId];
    if (!cs) {
      return;
    }

    // 1. Append user message to local + DB
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user",
      content,
      thinking: null,
      toolCalls: null,
      toolResults: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      createdAt: Date.now(),
    };
    setStore("byId", convId, "messages", (msgs) => [...msgs, userMsg]);
    yield* persistUserMessage(userMsg);

    // 2. Build context (浅拷贝,含最新 user msg)
    const context = [...store.byId[convId]!.messages];

    // 3. Augment system prompt with real workspaceId so the LLM uses the
    //    UUID (not a hallucinated label/path it saw in the user message) when
    //    calling file tools. Without this, LLM picks e.g. "miniMax-workspace"
    //    (the workspace label derived from the folder name) and the IPC
    //    write_file/read_file/etc. fails with "Workspace not found: <label>".
    //    T27: 同时把 workspaceId 通过 ProviderConfig 传给 runtime,作为兜底 —
    //    即使 LLM 没传 workspaceId(系统 prompt 是 hint,不是 contract),
    //    `createFileTools(workspaceId)` 包装层会在 schema 校验后注入到 args。
    //
    //    V3.1 ADR-0031 D3: 同时附 enabled skills manifest。Runtime 会拼成
    //    `<available_skills>...</available_skills>` 段注入 system prompt,
    //    LLM 读 manifest 后主动 `_load_skill` 拉全文。
    const enabledNames = appStore.state.value.enabledSkills ?? [];
    const enabledSkills: readonly SkillManifest[] = skillsManifests$().filter(
      (m) => enabledNames.includes(m.name),
    );

    const augmentedProvider: ProviderConfig = cs.workspaceId
      ? {
        ...provider,
        workspaceId: cs.workspaceId,
        enabledSkills,
        systemPrompt:
          `${provider.systemPrompt}\n\n` +
          `[Workspace context]\n` +
          `You are operating inside workspaceId="${cs.workspaceId}".\n` +
          `You MUST pass this exact id as the workspaceId parameter for ALL file tools ` +
          `(read_file, write_file, edit_file, search_files, delete_file).\n` +
          `Do NOT infer the id from user messages, folder names, or any other context — ` +
          `use ONLY the id given above.`,
      }
      : { ...provider, enabledSkills };

    // 4. Run runtime + subscribe
    const stream = cs.runtime.run({ context, provider: augmentedProvider });
    yield* Stream.runForEach(stream, (evt) =>
      Effect.sync(() => handleEvent(convId, evt)),
    ).pipe(Effect.scoped);
  },
  Effect.catchAll((err) =>
    Effect.sync(() => {
      logger.error("[chat.store] sendMessage stream failure:", err);
    }),
  ),
);

// ─── handleEvent: RuntimeEvent → setStore ─────────────────────

function handleEvent(convId: string, evt: RuntimeEvent): void {
  switch (evt.type) {
    case "token": {
      // 找或创建 streaming stub
      const cs = store.byId[convId];
      if (!cs) {
        return;
      }
      let stubId = cs.streamingMessageId;
      if (!stubId) {
        stubId = crypto.randomUUID();
        const stub: Message = {
          id: stubId,
          conversationId: convId,
          role: "assistant",
          content: "",
          thinking: "",
          toolCalls: null,
          toolResults: null,
          model: null,
          inputTokens: null,
          outputTokens: null,
          createdAt: Date.now(),
        };
        setStore("byId", convId, "messages", (msgs) => [...msgs, stub]);
        setStore("byId", convId, "streamingMessageId", stubId);
        logger.debug(
          "[chat.store/diag] stub created (token path): stubId=" +
          stubId +
          " existingAssistantCount=" +
          (store.byId[convId]?.messages.filter((m) => m.role === "assistant").length ?? 0),
        );
        // Notify sidebar re: streaming state change (triggers conversations$ update)
        setConversationsSignal(Object.values(store.byId));
      }
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) =>
          m.id === stubId ? { ...m, content: (m.content ?? "") + evt.content } : m,
        ),
      );
      break;
    }
    case "thinking": {
      // thinking 在 text 之前可能到达,也可能没有 streaming stub — 也需要 lazy-init
      // (因为 mock-server 的 'think' entry 第一个事件就是 thinking_delta,先于 text)。
      const cs = store.byId[convId];
      if (!cs) {
        return;
      }
      let stubId = cs.streamingMessageId;
      if (!stubId) {
        stubId = crypto.randomUUID();
        const stub: Message = {
          id: stubId,
          conversationId: convId,
          role: "assistant",
          content: "",
          thinking: "",
          toolCalls: null,
          toolResults: null,
          model: null,
          inputTokens: null,
          outputTokens: null,
          createdAt: Date.now(),
        };
        setStore("byId", convId, "messages", (msgs) => [...msgs, stub]);
        setStore("byId", convId, "streamingMessageId", stubId);
        logger.debug(
          "[chat.store/diag] stub created (thinking path): stubId=" +
          stubId +
          " existingAssistantCount=" +
          (store.byId[convId]?.messages.filter((m) => m.role === "assistant").length ?? 0),
        );
        setConversationsSignal(Object.values(store.byId));
      }
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) =>
          m.id === stubId ? { ...m, thinking: (m.thinking ?? "") + evt.content } : m,
        ),
      );
      break;
    }
    case "tool_call":
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) {
            return m;
          }
          return { ...m, toolCalls: [...(m.toolCalls ?? []), evt.toolCall] };
        }),
      );
      break;
    case "tool_result":
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) {
            return m;
          }
          return {
            ...m,
            toolResults: [
              ...(m.toolResults ?? []),
              { toolCallId: evt.toolCallId, result: evt.result, error: evt.error ?? null },
            ],
          };
        }),
      );
      break;
    case "done": {
      const stubId = store.byId[convId]?.streamingMessageId;
      if (stubId) {
        // Normal path: replace the streaming stub with the final message.
        setStore("byId", convId, "messages", (msgs) =>
          msgs.map((m) => (m.id === stubId ? { ...evt.message, id: stubId } : m)),
        );
        logger.debug(
          "[chat.store/diag] done replace stub: stubId=" + stubId +
          " content.length=" + (evt.message.content ?? "").length,
        );
      } else {
        // Resilient path: no stubId (e.g. duplicate done event or no token events fired).
        // Instead of blindly appending (which creates a duplicate assistant message),
        // find the LAST assistant message and replace it. Do NOT replace if the
        // existing message already has content AND the new message is empty — this
        // prevents a duplicate done (from Agent emitting two turn_end events)
        // from erasing correct content with an empty message.
        const msgs = store.byId[convId]?.messages ?? [];
        // Walk backwards to find the last assistant message. Using
        // `length - 1 - findIndex` would yield 0 (not -1) when msgs is empty,
        // which would then access msgs[0] and throw "undefined.content".
        let lastAsstIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i]?.role === "assistant") {
            lastAsstIdx = i;
            break;
          }
        }
        if (lastAsstIdx >= 0) {
          const lastAsst = msgs[lastAsstIdx];
          const newContent = (evt.message.content ?? "").trim();
          const existingContent = (lastAsst.content ?? "").trim();
          // Skip empty duplicate if the existing message is already non-empty.
          if (newContent.length === 0 && existingContent.length > 0) {
            logger.debug("[chat.store/diag] done skip empty duplicate: lastAsstIdx=" + lastAsstIdx);
          } else {
            setStore("byId", convId, "messages", (msgs) =>
              msgs.map((m, i) => (i === lastAsstIdx ? { ...evt.message, id: m.id } : m)),
            );
            logger.debug(
              "[chat.store/diag] done replace last asst (no stubId): idx=" + lastAsstIdx +
              " oldMsgId=" + lastAsst.id + " content.length=" + newContent.length,
            );
          }
        } else {
          setStore("byId", convId, "messages", (msgs) => [...msgs, evt.message]);
          logger.debug(
            "[chat.store/diag] done append (no stubId, no asst to replace): new msgId=" + evt.message.id,
          );
        }
      }
      setStore("byId", convId, "streamingMessageId", null);
      // Notify sidebar re: streaming ended (triggers conversations$ update → badge removal)
      setConversationsSignal(Object.values(store.byId));
      Effect.runPromise(persistAssistantMessage({ ...evt.message, conversationId: convId })).catch((err) =>
        logger.error("[chat.store] persistAssistantMessage failed:", err),
      );
      break;
    }
    case "error":
      // 不论 cancel 还是真实 LLM 错误,都从 error path 进来。
      // 这里必须清 streamingMessageId,否则 UI 永远 stuck in "running" 状态
      // (Cancel 按钮不消失,Send 按钮不恢复 — e2e spec 09 D2 失败的原因)。
      // Bug B: 同步写 lastError，UI 渲染红色 banner 提示用户 (而非静默)。
      logger.error("[chat.store] runtime error:", evt.error);
      setStore("byId", convId, "streamingMessageId", null);
      setStore("byId", convId, "lastError", evt.error.message);
      setConversationsSignal(Object.values(store.byId));
      break;
  }
}

// ─── cancel: 调 runtime.cancel() 中断 in-flight stream ───────

export function cancel(convId: string): void {
  // Bug B fix (e2e spec 09 D2): synchronously clear streamingMessageId so the UI
  // (chat-view's isRunning() + sidebar's isStreaming badge) sees the conv as non-streaming
  // IMMEDIATELY after cancel(), without waiting for the error event to propagate through
  // the Effect fiber. Without this, the textarea stays disabled for ~1 render frame
  // between cancel() and the error event handler, causing D2 ("Cancel → Send 按钮恢复")
  // to flake in CI environments with slower Effect fiber scheduling.
  const cs = store.byId[convId];
  if (!cs) { return; }
  cs.runtime.cancel();
  setStore("byId", convId, "streamingMessageId", null);
  setConversationsSignal(Object.values(store.byId));
}

// ─── archiveConversation: cancel + 从 store 移除 + DB archive ──

export const archiveConversation = Effect.fnUntraced(
  function* (convId: string) {
    cancel(convId);
    const svc = yield* ConversationApi;
    yield* svc.archive(convId);
    setStore("byId", produce(prev => { delete prev[convId]; }));
    setConversationsSignal(Object.values(store.byId));
  },
  Effect.provide(ConversationApiLive),
);

// ─── deleteConversation: cancel + 从 store 移除 + DB delete ───

export const deleteConversation = Effect.fnUntraced(
  function* (convId: string) {
    cancel(convId);
    const svc = yield* ConversationApi;
    yield* svc.delete(convId);
    setStore("byId", produce(prev => { delete prev[convId]; }));
    setConversationsSignal(Object.values(store.byId));
  },
  Effect.provide(ConversationApiLive),
);

// ─── renameConversation: 更新 title + 刷新 conversations$ ───────

export const renameConversation = Effect.fnUntraced(
  function* (convId: string, newTitle: string) {
    const svc = yield* ConversationApi;
    yield* svc.rename(convId, newTitle);
    setStore("byId", produce(prev => { prev[convId].title = newTitle; }));
    setConversationsSignal(Object.values(store.byId));
  },
  Effect.provide(ConversationApiLive),
);

// ─── loadConversations: DB → byId ─────────────────────────────

export const loadConversations = Effect.fnUntraced(
  function* (includeArchived: boolean = false) {
    const svc = yield* ConversationApi;
    const convs = yield* svc.list(includeArchived);
    for (const conv of convs) {
      const msgSvc = yield* MessageApi;
      const history = yield* msgSvc.list(conv.id);
      setupConvState(conv, history);
    }
  },
  Effect.provide(ConversationApiLive),
  Effect.provide(MessageApiLive),
);

// ─── createConversation: DB 新建 + setupConvState ─────────────

/**
 * 创建新 Conversation 并绑定 workspace。
 *
 * @param workspaceId - 用户选定的 workspace id（V2.1 per-Conv binding）。
 *                       V1.x 迁移的旧 conv 才有 workspaceId='' ('Needs workspace')。
 * @param title - 会话标题
 * @param systemPrompt - 可选，覆盖 settings.system_prompt.default
 */
export const createConversation = Effect.fnUntraced(
  function* (workspaceId: string, title: string, systemPrompt?: string) {
    const svc = yield* ConversationApi;
    const conv = yield* svc.create(title, systemPrompt ?? null, workspaceId);
    setupConvState(conv, []);
    return conv.id;
  },
  Effect.provide(ConversationApiLive),
);

// ─── createAndSendConversation: Home send flow ─────────────────

/**
 * Home send flow:
 * 1. createConversation(workspaceId, title) → DB persist
 * 2. sendMessage(convId, firstMessage, provider) → LLM streaming
 *
 * @param workspaceId - 用户选定的 workspace id
 * @param title - 会话标题（from firstMessage.slice(0, 30)）
 * @param firstMessage - 用户输入的第一条消息
 * @param provider - ProviderConfig (与 sendMessage 同样的构造)
 */
export function createAndSendConversation(
  workspaceId: string,
  title: string,
  firstMessage: string,
  provider: ProviderConfig,
): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const convId = yield* createConversation(workspaceId, title);
    yield* sendMessage(convId, firstMessage, provider);
  });
}

// ─── Workspace CRUD (D8-W) ──────────────────────────────────────────

export const pickWorkspacePath = Effect.fnUntraced(
  function* () {
    const svc = yield* WorkspaceService;
    return yield* svc.pickPath();
  },
  Effect.provide(WorkspaceServiceLive),
);

export const loadWorkspaces = Effect.fnUntraced(
  function* () {
    const svc = yield* WorkspaceService;
    const result = yield* svc.list();
    setStore("workspaces", result);
    setWorkspacesSignal(Object.values(store.workspaces));
    // Bug-fix (2026-07): app startup with 1 persisted workspace leaves
    // selectedWorkspaceId$ at null, so home.tsx's initialWorkspaceId() falls back
    // to "" and HomeAgentForm's textarea stays permanently disabled. Mirror
    // addWorkspace's pattern: if exactly 1 workspace exists and no current
    // selection, auto-select that one. 0 workspaces: stay null (HomeAgentForm
    // disabled by design, prompting user to add). 2+ workspaces: stay null so
    // user picks via picker.
    if (selectedWorkspaceId() === null && result.length === 1) {
      setSelectedWorkspaceIdSignal(result[0].id);
    }
  },
  Effect.provide(WorkspaceServiceLive),
);

export const addWorkspace = Effect.fnUntraced(
  function* () {
    const rootPath = yield* pickWorkspacePath();
    if (rootPath === null) { return null; }
    const label = deriveLabelFromPath(rootPath);
    const svc = yield* WorkspaceService;
    const result = yield* svc.add(label, rootPath);
    setStore("workspaces", (ws) => [...ws, result]);
    setWorkspacesSignal(Object.values(store.workspaces));
    setSelectedWorkspaceIdSignal(result.id);
    return result;
  },
  Effect.provide(WorkspaceServiceLive),
);

export const removeWorkspace = Effect.fnUntraced(
  function* (id: string) {
    const svc = yield* WorkspaceService;
    yield* svc.remove(id);
    // CASCADE deletes conversations with this workspaceId in SQLite
    setStore("workspaces", (ws) => ws.filter((w) => w.id !== id));
    setWorkspacesSignal(Object.values(store.workspaces));
    if (selectedWorkspaceId() === id) { setSelectedWorkspaceIdSignal(null); }
  },
  Effect.provide(WorkspaceServiceLive),
);

export const renameWorkspace = Effect.fnUntraced(
  function* (id: string, label: string) {
    const svc = yield* WorkspaceService;
    yield* svc.rename(id, label);
    setStore("workspaces", (ws) => ws.map((w) => (w.id === id ? { ...w, label } : w)));
    setWorkspacesSignal(Object.values(store.workspaces));
  },
  Effect.provide(WorkspaceServiceLive),
);
