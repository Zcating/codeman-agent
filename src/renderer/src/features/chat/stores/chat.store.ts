import { createSignal, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { ThinkingLevel } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { Message, ToolCall, ToolResult } from "@codeman-frontend/shared/lib/types";

declare global {
  interface Window {
    codeman: {
      pi: {
        createSession: (opts?: { cwd?: string }) => Promise<{ sessionId: string; sessionFile: string }>;
        prompt: (opts: { sessionId: string; text: string; thinkingLevel?: ThinkingLevel }) => Promise<{ ok: boolean }>;
        abort: (sessionId: string) => Promise<{ ok: boolean }>;
        openSession: (path: string) => Promise<{ sessionId: string }>;
        listSessions: (opts?: { cwd?: string }) => Promise<readonly { sessionId: string; sessionFile?: string; cwd?: string; createdAt?: number }[]>;
        closeSession: (sessionId: string) => Promise<{ ok: boolean }>;
      };
      onPiEvent: (handler: (event: unknown) => void) => () => void;
    };
  }
}

interface PiEvent {
  type: "token" | "thinking" | "tool_call" | "tool_result" | "done" | "message_stop" | "error";
  sessionId?: string;
  content?: string;
  toolCall?: ToolCall;
  toolCallId?: string;
  result?: unknown;
  error?: { message: string };
  message?: Message;
}

export interface ConversationState {
  id: string;
  title: string;
  systemPrompt: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  messages: Message[];
  streamingMessageId: string | null;
  isAgentActive: boolean;
  lastError: string | null;
  sessionId: string | null;
  sessionProviderId?: string | null;
  sessionModelId?: string | null;
}

const [store, setStore] = createStore<{
  byId: Record<string, ConversationState>;
}>({
  byId: {},
});

export { store, setStore };

const [conversations, setConversationsSignal] = createSignal<ConversationState[]>([]);
export const conversations$: Accessor<ConversationState[]> = conversations;

const [workspaces, setWorkspacesSignal] = createSignal<unknown[]>([]);
export const workspaces$: Accessor<unknown[]> = workspaces;

const [selectedWorkspaceId] = createSignal<string | null>(null);
export const selectedWorkspaceId$: Accessor<string | null> = selectedWorkspaceId;

export function setSelectedWorkspaceId(_id: string | null): void {
}

export function setupConvState(conv: { id: string; title: string; systemPrompt: string | null; createdAt: number; updatedAt: number; archivedAt: number | null }, history: Message[]): ConversationState {
  const cs: ConversationState = {
    id: conv.id,
    title: conv.title,
    systemPrompt: conv.systemPrompt,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    archivedAt: conv.archivedAt,
    messages: history,
    streamingMessageId: null,
    isAgentActive: false,
    lastError: null,
    sessionId: null,
  };
  setStore("byId", conv.id, cs);
  setConversationsSignal(Object.values(store.byId));
  return cs;
}

export function setConvModel(convId: string, providerId: string | null, modelId: string | null): void {
  if (!store.byId[convId]) { return; }
  setStore("byId", convId, "sessionProviderId", providerId);
  setStore("byId", convId, "sessionModelId", modelId);
}

const [homeSelectedProviderId, setHomeSelectedProviderIdSignal] = createSignal<string | null>(null);
export const homeSelectedProviderId$: Accessor<string | null> = homeSelectedProviderId;

const [homeSelectedModelId, setHomeSelectedModelIdSignal] = createSignal<string | null>(null);
export const homeSelectedModelId$: Accessor<string | null> = homeSelectedModelId;

export function selectHomeModel(providerId: string, modelId: string): void {
  setHomeSelectedProviderIdSignal(providerId);
  setHomeSelectedModelIdSignal(modelId);
}

let piEventUnsubscribe: (() => void) | null = null;

function ensurePiEventListener(): void {
  if (piEventUnsubscribe) { return; }
  piEventUnsubscribe = window.codeman.onPiEvent((raw) => {
    const evt = raw as PiEvent;
    if (!evt.sessionId) { return; }
    const convId = Object.keys(store.byId).find(
      (id) => store.byId[id]?.sessionId === evt.sessionId,
    );
    if (!convId) { return; }
    handleEvent(convId, evt);
  });
}

export async function sendMessage(
  convId: string,
  content: string,
  _providerId: string,
  _modelId: string,
  thinkingLevel?: ThinkingLevel,
): Promise<void> {
  const cs = store.byId[convId];
  if (!cs) { return; }

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

  setStore("byId", convId, "isAgentActive", true);
  setConversationsSignal(Object.values(store.byId));

  try {
    ensurePiEventListener();

    const { sessionId } = await window.codeman.pi.createSession({});
    setStore("byId", convId, "sessionId", sessionId);

    await window.codeman.pi.prompt({
      sessionId,
      text: content,
      thinkingLevel,
    });
  } catch (err) {
    logger.error("[chat.store] sendMessage failure:", err);
    setStore("byId", convId, "isAgentActive", false);
    setStore("byId", convId, "lastError", err instanceof Error ? err.message : String(err));
    setConversationsSignal(Object.values(store.byId));
  }
}

function handleEvent(convId: string, evt: PiEvent): void {
  switch (evt.type) {
    case "token": {
      const cs = store.byId[convId];
      if (!cs) { return; }
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
        setConversationsSignal(Object.values(store.byId));
      }
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) =>
          m.id === stubId ? { ...m, content: (m.content ?? "") + (evt.content ?? "") } : m,
        ),
      );
      break;
    }
    case "thinking": {
      const cs = store.byId[convId];
      if (!cs) { return; }
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
          m.id === stubId ? { ...m, thinking: (m.thinking ?? "") + (evt.content ?? "") } : m,
        ),
      );
      break;
    }
    case "tool_call": {
      if (!evt.toolCall) { break; }
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) { return m; }
          const existing = m.toolCalls ?? [];
          return { ...m, toolCalls: [...existing, evt.toolCall as ToolCall] };
        }),
      );
      break;
    }
    case "tool_result": {
      if (!evt.toolCallId) { break; }
      const newResult: ToolResult = {
        toolCallId: evt.toolCallId,
        result: evt.result,
        error: evt.error?.message ?? null,
      };
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) { return m; }
          const existing = m.toolResults ?? [];
          return { ...m, toolResults: [...existing, newResult] };
        }),
      );
      break;
    }
    case "done": {
      const stubId = store.byId[convId]?.streamingMessageId;
      if (stubId && evt.message) {
        setStore("byId", convId, "messages", (msgs) =>
          msgs.map((m) => (m.id === stubId ? { ...evt.message!, id: stubId } : m)),
        );
        logger.debug(
          "[chat.store/diag] done replace stub: stubId=" + stubId +
          " content.length=" + (evt.message?.content ?? "").length,
        );
      } else if (evt.message) {
        const msgs = store.byId[convId]?.messages ?? [];
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
          if (newContent.length === 0 && existingContent.length > 0) {
            logger.debug("[chat.store/diag] done skip empty duplicate: lastAsstIdx=" + lastAsstIdx);
          } else {
            setStore("byId", convId, "messages", (msgs) =>
              msgs.map((m, i) => (i === lastAsstIdx ? { ...evt.message!, id: m.id } : m)),
            );
            logger.debug(
              "[chat.store/diag] done replace last asst (no stubId): idx=" + lastAsstIdx +
              " oldMsgId=" + lastAsst.id + " content.length=" + newContent.length,
            );
          }
        } else {
          setStore("byId", convId, "messages", (msgs) => [...msgs, evt.message!]);
          logger.debug(
            "[chat.store/diag] done append (no stubId, no asst to replace): new msgId=" + evt.message!.id,
          );
        }
      }
      setStore("byId", convId, "streamingMessageId", null);
      setConversationsSignal(Object.values(store.byId));
      break;
    }
    case "message_stop": {
      setStore("byId", convId, "streamingMessageId", null);
      setStore("byId", convId, "isAgentActive", false);
      setConversationsSignal(Object.values(store.byId));
      break;
    }
    case "error": {
      logger.error("[chat.store] runtime error:", evt.error);
      setStore("byId", convId, "streamingMessageId", null);
      setStore("byId", convId, "isAgentActive", false);
      setStore("byId", convId, "lastError", evt.error?.message ?? "unknown error");
      setConversationsSignal(Object.values(store.byId));
      break;
    }
  }
}

export async function abortStream(convId: string): Promise<void> {
  const cs = store.byId[convId];
  if (!cs || !cs.sessionId) { return; }
  try {
    await window.codeman.pi.abort(cs.sessionId);
  } catch (err) {
    logger.error("[chat.store] abort failure:", err);
  }
  setStore("byId", convId, "streamingMessageId", null);
  setStore("byId", convId, "isAgentActive", false);
  setConversationsSignal(Object.values(store.byId));
}

export async function cancel(convId: string): Promise<void> {
  return abortStream(convId);
}

export async function archiveConversation(convId: string): Promise<void> {
  cancel(convId);
}

export async function deleteConversation(convId: string): Promise<void> {
  cancel(convId);
}

export async function renameConversation(convId: string, newTitle: string): Promise<void> {
  if (!store.byId[convId]) { return; }
  setStore("byId", convId, "title", newTitle);
  setConversationsSignal(Object.values(store.byId));
}

export async function loadConversations(_includeArchived: boolean = false): Promise<void> {
}

export async function createConversation(
  _workspaceId: string,
  title: string,
  _systemPrompt?: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const cs: ConversationState = {
    id,
    title,
    systemPrompt: _systemPrompt ?? null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    messages: [],
    streamingMessageId: null,
    isAgentActive: false,
    lastError: null,
    sessionId: null,
  };
  setStore("byId", id, cs);
  setConversationsSignal(Object.values(store.byId));
  return id;
}

export async function createAndSendConversation(
  _workspaceId: string,
  title: string,
  firstMessage: string,
  providerId: string,
  modelId: string,
  thinkingLevel?: ThinkingLevel,
): Promise<void> {
  const convId = await createConversation(_workspaceId, title);
  await sendMessage(convId, firstMessage, providerId, modelId, thinkingLevel);
}

export async function pickWorkspacePath(): Promise<string | null> {
  return null;
}

export async function loadWorkspaces(): Promise<void> {
  setWorkspacesSignal([]);
}

export async function addWorkspace(): Promise<unknown> {
  return null;
}

export async function removeWorkspace(_id: string): Promise<void> {
}

export async function renameWorkspace(_id: string, _label: string): Promise<void> {
}
