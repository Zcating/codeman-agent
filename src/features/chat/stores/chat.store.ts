//! Effect → Solid 会话桥接层 (V2 ADR-0019: 吸收 messages.store + agent.store)。
//!
//! 唯一响应式源: Solid `createStore<{ activeId, byId: Record<ConvId, ConversationState> }>`。
//! ConversationState = DB fields + messages + streamingMessageId + runtime。
//! UI 读 store.byId[activeId()].messages,Solid proxy 按路径细粒度反应式。
//!
//! Task 4 范围: ConversationState 类型 + createStore + setupConvState + accessors。
//! 后续 Task 5/6/7 加 sendMessage / cancel / archive / delete / loadConversations / createConversation。

import { createSignal, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";

import { Effect, Stream } from "effect";
import type { AppError, Conversation, Message, Workspace } from "../../../shared/lib/types";
import {
  createAgentRuntime,
  type AgentRuntime,
  type RuntimeEvent,
  type ProviderConfig,
} from "../lib/runtime";
import {
  ConversationService,
  ConversationServiceLive,
  MessageService,
  MessageServiceLive,
} from "../../../shared/lib/ipc";
import {
  WorkspaceService,
  WorkspaceServiceLive,
} from "../lib/workspace-service";
import { deriveLabelFromPath } from "../../../shared/lib/derive-label-from-path";

// ─── ConversationState 类型 (inline 在 chat.store) ──────

export interface ConversationState {
  // DB-backed fields (mirror shared/lib/types.ts Conversation)
  id: string;
  title: string;
  system_prompt: string | null;
  workspace_id: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
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
    system_prompt: conv.system_prompt,
    workspace_id: conv.workspace_id,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    archived_at: conv.archived_at,
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

// ─── sendMessage: append user msg + run + subscribe ───────────

export function sendMessage(
  convId: string,
  content: string,
  provider: ProviderConfig,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const cs = store.byId[convId];
    if (!cs) {
      return;
    }

    // 1. Append user message to local + DB
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: "user",
      content,
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: Date.now(),
    };
    setStore("byId", convId, "messages", (msgs) => [...msgs, userMsg]);
    yield* persistUserMessageEffect(userMsg);

    // 2. Build context (浅拷贝,含最新 user msg)
    const context = [...store.byId[convId]!.messages];

    // 3. Augment system prompt with real workspace_id so the LLM uses the
    //    UUID (not a hallucinated label/path it saw in the user message) when
    //    calling file tools. Without this, LLM picks e.g. "miniMax-workspace"
    //    (the workspace label derived from the folder name) and the IPC
    //    write_file/read_file/etc. fails with "Workspace not found: <label>".
    const augmentedProvider: ProviderConfig = cs.workspace_id
      ? {
          ...provider,
          systemPrompt:
            `${provider.systemPrompt}\n\n` +
            `[Workspace context]\n` +
            `You are operating inside workspace_id="${cs.workspace_id}".\n` +
            `You MUST pass this exact id as the workspace_id parameter for ALL file tools ` +
            `(read_file, write_file, edit_file, search_files, delete_file).\n` +
            `Do NOT infer the id from user messages, folder names, or any other context — ` +
            `use ONLY the id given above.`,
        }
      : provider;

    // 4. Run runtime + subscribe
    const stream = cs.runtime.run({ context, provider: augmentedProvider });
    yield* Stream.runForEach(stream, (evt) =>
      Effect.sync(() => handleEvent(convId, evt)),
    ).pipe(Effect.scoped);
  }).pipe(
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.error("[chat.store] sendMessage stream failure:", err);
      }),
    ),
  );
}

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
          conversation_id: convId,
          role: "assistant",
          content: "",
          tool_calls: null,
          tool_results: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          created_at: Date.now(),
        };
        setStore("byId", convId, "messages", (msgs) => [...msgs, stub]);
        setStore("byId", convId, "streamingMessageId", stubId);
        // Notify sidebar re: streaming state change (triggers conversations$ update)
        setConversationsSignal(Object.values(store.byId));
      }
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => (m.id === stubId ? { ...m, content: evt.content } : m)),
      );
      break;
    }
    case "tool_call":
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) {
            return m;
          }
          return { ...m, tool_calls: [...(m.tool_calls ?? []), evt.toolCall] };
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
            tool_results: [
              ...(m.tool_results ?? []),
              { tool_call_id: evt.toolCallId, result: evt.result, error: evt.error ?? null },
            ],
          };
        }),
      );
      break;
    case "done": {
      const stubId = store.byId[convId]?.streamingMessageId;
      console.log("[chat.store/diag] done event: stubId=" + stubId + " content.length=" + (evt.message.content ?? "").length + " content_preview=" + String(evt.message.content ?? "").slice(0, 100) + " tool_calls=" + JSON.stringify(evt.message.tool_calls));
      if (stubId) {
        setStore("byId", convId, "messages", (msgs) =>
          msgs.map((m) => (m.id === stubId ? { ...evt.message, id: stubId } : m)),
        );
      } else {
        setStore("byId", convId, "messages", (msgs) => [...msgs, evt.message]);
      }
      setStore("byId", convId, "streamingMessageId", null);
      // Notify sidebar re: streaming ended (triggers conversations$ update → badge removal)
      setConversationsSignal(Object.values(store.byId));
      Effect.runPromise(persistAssistantMessageEffect({ ...evt.message, conversation_id: convId })).catch((err) =>
        console.error("[chat.store] persistAssistantMessage failed:", err),
      );
      break;
    }
    case "error":
      // 不论 cancel 还是真实 LLM 错误,都从 error path 进来。
      // 这里必须清 streamingMessageId,否则 UI 永远 stuck in "running" 状态
      // (Cancel 按钮不消失,Send 按钮不恢复 — e2e spec 09 D2 失败的原因)。
      // Bug B: 同步写 lastError，UI 渲染红色 banner 提示用户 (而非静默)。
      console.error("[chat.store] runtime error:", evt.error);
      setStore("byId", convId, "streamingMessageId", null);
      setStore("byId", convId, "lastError", evt.error.message);
      setConversationsSignal(Object.values(store.byId));
      break;
  }
}

// ─── DB 持久化辅助 ────────────────────────────────────────────

function persistUserMessageEffect(msg: Message): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* MessageService;
    yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
    });
  }).pipe(Effect.provide(MessageServiceLive));
}

function persistAssistantMessageEffect(msg: Message): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* MessageService;
    yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : undefined,
      toolResults: msg.tool_results ? JSON.stringify(msg.tool_results) : undefined,
      model: msg.model ?? undefined,
    });
  }).pipe(Effect.provide(MessageServiceLive));
}

// ─── cancel: 调 runtime.cancel() 中断 in-flight stream ───────

export function cancel(convId: string): void {
  store.byId[convId]?.runtime.cancel();
}

// ─── archiveConversation: cancel + 从 store 移除 + DB archive ──

export function archiveConversation(convId: string): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    cancel(convId);
    const svc = yield* ConversationService;
    yield* svc.archive(convId);
    // @ts-expect-error — setStore delete
    setStore("byId", convId, undefined);
    setConversationsSignal(Object.values(store.byId));
  }).pipe(Effect.provide(ConversationServiceLive));
}

// ─── deleteConversation: cancel + 从 store 移除 + DB delete ───

export function deleteConversation(convId: string): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    cancel(convId);
    const svc = yield* ConversationService;
    yield* svc.delete(convId);
    // @ts-expect-error — setStore delete
    setStore("byId", convId, undefined);
    setConversationsSignal(Object.values(store.byId));
  }).pipe(Effect.provide(ConversationServiceLive));
}

// ─── loadConversations: DB → byId ─────────────────────────────

export function loadConversations(includeArchived = false): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* ConversationService;
    const convs = yield* svc.list(includeArchived);
    for (const conv of convs) {
      const msgSvc = yield* MessageService;
      const history = yield* msgSvc.list(conv.id);
      setupConvState(conv, history);
    }
  }).pipe(
    Effect.provide(ConversationServiceLive),
    Effect.provide(MessageServiceLive),
  );
}

// ─── createConversation: DB 新建 + setupConvState ─────────────

/**
 * 创建新 Conversation 并绑定 workspace。
 *
 * @param workspaceId - 用户选定的 workspace id（V2.1 per-Conv binding）。
 *                       V1.x 迁移的旧 conv 才有 workspaceId='' ('Needs workspace')。
 * @param title - 会话标题
 * @param systemPrompt - 可选，覆盖 settings.system_prompt.default
 */
export function createConversation(
  workspaceId: string,
  title: string,
  systemPrompt?: string,
): Effect.Effect<string, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* ConversationService;
    const conv = yield* svc.create(title, systemPrompt ?? null, workspaceId);
    setupConvState(conv, []);
    return conv.id;
  }).pipe(Effect.provide(ConversationServiceLive));
}

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

export const pickWorkspacePath = (): Effect.Effect<string | null, AppError, never> =>
  Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    return yield* svc.pickPath();
  }).pipe(Effect.provide(WorkspaceServiceLive));

export const loadWorkspaces = (): Effect.Effect<void, AppError, never> =>
  Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    const result = yield* svc.list();
    setStore("workspaces", result);
    setWorkspacesSignal(Object.values(store.workspaces));
  }).pipe(Effect.provide(WorkspaceServiceLive));

export const addWorkspace = (): Effect.Effect<Workspace | null, AppError, never> =>
  Effect.gen(function* () {
    const rootPath = yield* pickWorkspacePath();
    if (rootPath === null) return null;
    const label = deriveLabelFromPath(rootPath);
    const svc = yield* WorkspaceService;
    const result = yield* svc.add(label, rootPath);
    setStore("workspaces", (ws) => [...ws, result]);
    setWorkspacesSignal(Object.values(store.workspaces));
    setSelectedWorkspaceIdSignal(result.id);
    return result;
  }).pipe(Effect.provide(WorkspaceServiceLive));

export const removeWorkspace = (id: string): Effect.Effect<void, AppError, never> =>
  Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    yield* svc.remove(id);
    // CASCADE deletes conversations with this workspace_id in SQLite
    setStore("workspaces", (ws) => ws.filter((w) => w.id !== id));
    setWorkspacesSignal(Object.values(store.workspaces));
    if (selectedWorkspaceId() === id) setSelectedWorkspaceIdSignal(null);
  }).pipe(Effect.provide(WorkspaceServiceLive));

export const renameWorkspace = (id: string, label: string): Effect.Effect<void, AppError, never> =>
  Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    yield* svc.rename(id, label);
    setStore("workspaces", (ws) => ws.map((w) => (w.id === id ? { ...w, label } : w)));
    setWorkspacesSignal(Object.values(store.workspaces));
  }).pipe(Effect.provide(WorkspaceServiceLive));
