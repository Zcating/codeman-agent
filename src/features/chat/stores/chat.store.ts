//! Effect → Solid 会话桥接层 (V2 ADR-0019: 吸收 messages.store + agent.store)。
//!
//! 唯一响应式源: Solid `createStore<{ activeId, byId: Record<ConvId, ConversationState> }>`。
//! ConversationState = DB fields + messages + streamingMessageId + runtime。
//! UI 读 store.byId[activeId()].messages,Solid proxy 按路径细粒度反应式。
//!
//! Task 4 范围: ConversationState 类型 + createStore + setupConvState + accessors。
//! 后续 Task 5/6/7 加 sendMessage / cancel / archive / delete / loadConversations / createConversation。

import { createStore } from "solid-js/store";
import { createSignal, type Accessor } from "solid-js";
import { Effect, Stream, Exit } from "effect";
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
} from "../../../shared/lib/tauri";
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
  // Per-conv runtime (createAgentRuntime 工厂产物)
  runtime: AgentRuntime;
}

// ─── 单一响应式源: Solid createStore ──────────────────────────

const [store, setStore] = createStore<{
  activeId: string | null;
  byId: Record<string, ConversationState>;
  workspaces: Workspace[];
}>({
  activeId: null,
  byId: {},
  workspaces: [],
});

export { store, setStore };

// ─── Accessors (for UI components) ─────────────────────────────

const [activeId, setActiveIdSignal] = createSignal<string | null>(null);
export const activeId$: Accessor<string | null> = activeId;

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
    runtime,
  };
  setStore("byId", conv.id, cs);
  // 同步 conversations$ accessor
  setConversationsSignal(Object.values(store.byId));
  return cs;
}

// ─── selectConversation: 切换 active ──────────────────────────

export function selectConversation(id: string): void {
  setActiveIdSignal(id);
  setStore("activeId", id);
}

// ─── clearActiveConversation: 清除 active ─────────────────────

export function clearActiveConversation(): void {
  setActiveIdSignal(null);
  setStore("activeId", null);
}

// ─── sendMessage: append user msg + run + subscribe ───────────

export async function sendMessage(
  convId: string,
  content: string,
  provider: ProviderConfig,
): Promise<void> {
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
  await persistUserMessage(userMsg);

  // 2. Build context (浅拷贝,含最新 user msg)
  const context = [...store.byId[convId]!.messages];

  // 3. Run runtime + subscribe
  const stream = cs.runtime.run({ context, provider });
  const program = Stream.runForEach(stream, (evt) => Effect.sync(() => handleEvent(convId, evt)));
  const result = await Effect.runPromiseExit(program.pipe(Effect.scoped));
  if (Exit.isFailure(result)) {
    console.error("[chat.store] sendMessage stream failure:", result.cause);
  }
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
      void persistAssistantMessage({ ...evt.message, conversation_id: convId });
      break;
    }
    case "error":
      // 不论 cancel 还是真实 LLM 错误,都从 error path 进来。
      // 这里必须清 streamingMessageId,否则 UI 永远 stuck in "running" 状态
      // (Cancel 按钮不消失,Send 按钮不恢复 — e2e spec 09 D2 失败的原因)。
      console.error("[chat.store] runtime error:", evt.error);
      setStore("byId", convId, "streamingMessageId", null);
      setConversationsSignal(Object.values(store.byId));
      break;
  }
}

// ─── DB 持久化辅助 ────────────────────────────────────────────

async function persistUserMessage(msg: Message): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
    });
  }).pipe(Effect.provide(MessageServiceLive));
  await Effect.runPromiseExit(program);
}

async function persistAssistantMessage(msg: Message): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : undefined,
      toolResults: msg.tool_results ? JSON.stringify(msg.tool_results) : undefined,
      model: msg.model ?? undefined,
    });
  }).pipe(Effect.provide(MessageServiceLive));
  await Effect.runPromiseExit(program);
}

// ─── cancel: 调 runtime.cancel() 中断 in-flight stream ───────

export function cancel(convId: string): void {
  store.byId[convId]?.runtime.cancel();
}

// ─── archiveConversation: cancel + 从 store 移除 + DB archive ──

export async function archiveConversation(convId: string): Promise<void> {
  cancel(convId);
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.archive(convId);
  }).pipe(Effect.provide(ConversationServiceLive));
  await Effect.runPromiseExit(program);
  setStore("byId", convId, undefined as unknown as ConversationState);
  if (activeId() === convId) {
    setActiveIdSignal(null);
  }
  setConversationsSignal(Object.values(store.byId));
}

// ─── deleteConversation: cancel + 从 store 移除 + DB delete ───

export async function deleteConversation(convId: string): Promise<void> {
  cancel(convId);
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.delete(convId);
  }).pipe(Effect.provide(ConversationServiceLive));
  await Effect.runPromiseExit(program);
  setStore("byId", convId, undefined as unknown as ConversationState);
  if (activeId() === convId) {
    setActiveIdSignal(null);
  }
  setConversationsSignal(Object.values(store.byId));
}

// ─── loadConversations: DB → byId ─────────────────────────────

export async function loadConversations(includeArchived = false): Promise<void> {
  const listProgram = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.list(includeArchived);
  }).pipe(Effect.provide(ConversationServiceLive));
  const listResult = await Effect.runPromiseExit(listProgram);
  if (Exit.isFailure(listResult)) {
    return;
  }
  const convs = listResult.value;

  for (const conv of convs) {
    const historyProgram = Effect.gen(function* () {
      const svc = yield* MessageService;
      return yield* svc.list(conv.id);
    }).pipe(Effect.provide(MessageServiceLive));
    const historyResult = await Effect.runPromiseExit(historyProgram);
    const history = Exit.isSuccess(historyResult) ? historyResult.value : [];
    setupConvState(conv, history);
  }
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
export async function createConversation(
  workspaceId: string,
  title: string,
  systemPrompt?: string,
): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.create(title, systemPrompt ?? null, workspaceId);
  }).pipe(Effect.provide(ConversationServiceLive));
  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setupConvState(result.value, []);
    selectConversation(result.value.id);
  }
}

// ─── createAndSendConversation: Home send flow ─────────────────

/**
 * Home send flow:
 * 1. createConversation(workspaceId, title) → DB persist + selectConversation
 * 2. activeId is set by createConversation (via selectConversation)
 * 3. sendMessage(id, firstMessage, provider) → LLM streaming
 *
 * @param workspaceId - 用户选定的 workspace id
 * @param title - 会话标题（from firstMessage.slice(0, 30)）
 * @param firstMessage - 用户输入的第一条消息
 * @param provider - ProviderConfig (与 sendMessage 同样的构造)
 */
export async function createAndSendConversation(
  workspaceId: string,
  title: string,
  firstMessage: string,
  provider: ProviderConfig,
): Promise<void> {
  await createConversation(workspaceId, title);
  const id = activeId$();
  if (!id) {
    console.error("[chat.store] createAndSendConversation: activeId is null after createConversation");
    return;
  }
  await sendMessage(id, firstMessage, provider);
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
