
import { createSignal, type Accessor } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { Effect, Stream } from "effect";
import type { Conversation, Message, SkillManifest, Workspace, CompactionEntry } from "@codeman-frontend/shared/lib/types";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import {
  createAgentRuntime,
  type AgentRuntime,
  type RuntimeEvent,
  type ProviderConfig,
} from "@codeman-frontend/features/chat/lib/runtime";
import { toPiMessages } from "@codeman-frontend/features/chat/lib/runtime-to-pi-messages";
import { generateSummary } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { createProviderFromConfig, findDefaultModel } from "@codeman-frontend/features/chat/lib/pi-provider-adapter";
import {
  ConversationApi,
  ConversationApiLive,
  MessageApi,
  MessageApiLive,
  CompactionApi,
  CompactionApiLive,
} from "@codeman-frontend/shared/apis";
import {
  WorkspaceService,
  WorkspaceServiceLive,
} from "@codeman-frontend/shared/lib/workspace-service";
import { deriveLabelFromPath } from "@codeman-frontend/shared/lib/derive-label-from-path";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { skillsManifests$ } from "@codeman-frontend/plugins/skills/stores/skills.store";
import {
  shouldTriggerAutoCompaction,
  performCompaction,
  CompactionFailed,
  CompactionCancelled,
  type PerformCompactionDeps,
} from "@codeman-frontend/features/chat/lib/compaction";


export interface ConversationState {
  id: string;
  title: string;
  systemPrompt: string | null;
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  messages: Message[];
  streamingMessageId: string | null;
  isAgentActive: boolean;
  lastError: string | null;
  runtime: AgentRuntime;
  compactionEntries: CompactionEntry[];
  compactionStatus:
    | { _tag: "idle" }
    | { _tag: "compacting"; kind: "auto" | "manual" }
    | { _tag: "completed"; kind: "auto" | "manual"; entry: CompactionEntry }
    | { _tag: "failed"; kind: "auto" | "manual"; reason: string };
}


const [store, setStore] = createStore<{
  byId: Record<string, ConversationState>;
  workspaces: Workspace[];
}>({
  byId: {},
  workspaces: [],
});

export { store, setStore };


const [conversations, setConversationsSignal] = createSignal<ConversationState[]>([]);
export const conversations$: Accessor<ConversationState[]> = conversations;


const [workspaces, setWorkspacesSignal] = createSignal<Workspace[]>([]);
export const workspaces$: Accessor<Workspace[]> = workspaces;

const [selectedWorkspaceId, setSelectedWorkspaceIdSignal] = createSignal<string | null>(null);
export const selectedWorkspaceId$: Accessor<string | null> = selectedWorkspaceId;

export function setSelectedWorkspaceId(id: string | null): void {
  setSelectedWorkspaceIdSignal(id);
}


export function setupConvState(conv: Conversation, history: Message[]): ConversationState {
  const runtime = createAgentRuntime({
    getState: () => ({
      conversationId: conv.id,
      compactionEntries: store.byId[conv.id]?.compactionEntries ?? [],
    }),
  });
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
    isAgentActive: false,
    lastError: null,
    runtime,
    compactionEntries: [],
    compactionStatus: { _tag: "idle" },
  };
  setStore("byId", conv.id, cs);
  setConversationsSignal(Object.values(store.byId));

  // Load compaction entries asynchronously — do not block conv initialization
  const loadEffect = CompactionApi.pipe(
    Effect.flatMap((api) => api.list(conv.id)),
    Effect.catchTag("Database", () => {
      return Effect.succeed([] as CompactionEntry[]);
    }),
  );

  void Effect.runPromise(loadEffect.pipe(Effect.provide(CompactionApiLive))).then(
    (entries) => {
      if (!store.byId[conv.id]) return;
      const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
      setStore("byId", conv.id, "compactionEntries", sorted);
    },
    (err) => {
      logger.error("[chat.store] loadCompactEntries failed:", err);
    },
  );

  return cs;
}


// Hard-coded defaults per ADR-0025 — T3 reads from settings, T4 wires the UI
const COMPACTION_ENABLED = true;
const COMPACTION_RESERVE_TOKENS = 16384;
const COMPACTION_CONTEXT_WINDOW = 128000; // fallback


function estimateTokens(_text: string): number {
  // Simple estimation: ~4 chars per token
  return Math.ceil(_text.length / 4);
}


const doCompaction = Effect.fn(
  function* (convId: string, kind: "auto" | "manual") {
    const cs = store.byId[convId];
    if (!cs) {
      return;
    }

    // Set status to compacting
    setStore("byId", convId, "compactionStatus", { _tag: "compacting", kind });

    const deps: PerformCompactionDeps = {
      summarize: async ({ previousSummary: _previousSummary }) => {
        // Build model from the default provider
        const settings = appStore.state.value;
        const providerId = settings.defaultLlmProviderId ?? "";
        const appProvider = settings.providers?.find((p) => p.id === providerId);
        if (!appProvider) {
          throw new CompactionFailed({ reason: "no_provider" });
        }
        if (!appProvider.apiKey) {
          throw new CompactionFailed({ reason: "no_api_key" });
        }

        const piProvider = createProviderFromConfig({
          id: appProvider.id,
          name: appProvider.label,
          baseUrl: appProvider.llm.baseUrl,
          apiKey: appProvider.apiKey,
          models: appProvider.llm.models,
          modelsEndpoint: appProvider.llm.modelsEndpoint,
        });
        const model = findDefaultModel(piProvider, appProvider.llm.defaultModel);

        // Build a Models collection with the current provider
        const models = createModels();
        models.setProvider(piProvider);

        // Convert Message[] to AgentMessage[] using toPiMessages
        const piMessages = toPiMessages(allMessages, model);

        const result = await generateSummary(
          piMessages,
          models,
          model,
          COMPACTION_RESERVE_TOKENS,
          undefined,
          undefined,
          _previousSummary ?? undefined,
          undefined,
        );

        if (!result.ok) {
          throw new CompactionFailed({ reason: "summarize" });
        }
        return result.value;
      },
      estimateTokens,
      sanitize: (text) => text,
      appendEntry: async (entry) => {
        // Use Effect.runPromise to call CompactionApi.append
        const effect = CompactionApi.pipe(
          Effect.flatMap((api) =>
            api.append({
              conversationId: entry.conversationId,
              summary: entry.summary,
              model: entry.model,
              tokensBefore: entry.tokensBefore,
              kind: entry.kind,
              firstKeptMessageId: entry.firstKeptMessageId,
            }),
          ),
          Effect.provide(CompactionApiLive),
        );
        return Effect.runPromise(effect);
      },
    };

    const allMessages = store.byId[convId]!.messages;
    if (allMessages.length === 0) {
      throw new CompactionFailed({ reason: "empty_context" });
    }
    const messageStrings = allMessages.map(
      (m) => `${m.role}: ${m.content}`,
    );

    const lastEntry = [...cs.compactionEntries].sort(
      (a, b) => b.createdAt - a.createdAt,
    )[0];
    const previousSummary = lastEntry?.summary ?? null;

    const firstKeptMessageId = allMessages[allMessages.length - 1]!.id;

    try {
      const entry = yield* performCompaction(deps, {
        conversationId: convId,
        model: "compaction-model",
        messages: messageStrings,
        previousSummary,
        kind,
        firstKeptMessageId,
      });

      // Append entry to state
      setStore("byId", convId, "compactionEntries", (entries) => [
        ...entries,
        entry,
      ]);
      setStore("byId", convId, "compactionStatus", {
        _tag: "completed",
        kind,
        entry,
      });
    } catch (err) {
      if (err instanceof CompactionCancelled) {
        setStore("byId", convId, "compactionStatus", { _tag: "idle" });
      } else {
        const reason =
          err instanceof CompactionFailed
            ? err.reason
            : String(err);
        setStore("byId", convId, "compactionStatus", {
          _tag: "failed",
          kind,
          reason,
        });
      }
      throw err;
    }
  },
);


export const compactNow = Effect.fn(
  function* (convId: string) {
    yield* doCompaction(convId, "manual");
  },
);


const persistUserMessage = Effect.fn(
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

const persistAssistantMessage = Effect.fn(
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


export const sendMessage = Effect.fn(
  function* (convId: string, content: string, provider: ProviderConfig) {
    const cs = store.byId[convId];
    if (!cs) {
      return;
    }

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

    const context = [...store.byId[convId]!.messages];

    // Auto-compaction trigger: check threshold before running
    if (COMPACTION_ENABLED) {
      const estimatedTokens = estimateTokens(context.map((m) => m.content).join("\n"));
      const shouldCompact = shouldTriggerAutoCompaction({
        enabled: COMPACTION_ENABLED,
        contextWindow: COMPACTION_CONTEXT_WINDOW,
        reserveTokens: COMPACTION_RESERVE_TOKENS,
        estimatedTokens,
      });

      if (shouldCompact) {
        try {
          yield* doCompaction(convId, "auto");
        } catch {
          // CompactionFailed or CompactionCancelled — error state already set
          return;
        }
      }
    }

    setStore("byId", convId, "isAgentActive", true);

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


function handleEvent(convId: string, evt: RuntimeEvent): void {
  switch (evt.type) {
    case "token": {
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
        setStore("byId", convId, "messages", (msgs) =>
          msgs.map((m) => (m.id === stubId ? { ...evt.message, id: stubId } : m)),
        );
        logger.debug(
          "[chat.store/diag] done replace stub: stubId=" + stubId +
          " content.length=" + (evt.message.content ?? "").length,
        );
      } else {
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
      setConversationsSignal(Object.values(store.byId));
      Effect.runPromise(persistAssistantMessage({ ...evt.message, conversationId: convId })).catch((err) =>
        logger.error("[chat.store] persistAssistantMessage failed:", err),
      );
      break;
    }
    case "message_stop": {
      setStore("byId", convId, "streamingMessageId", null);
      setStore("byId", convId, "isAgentActive", false);
      setConversationsSignal(Object.values(store.byId));
      break;
    }
    case "error":
      logger.error("[chat.store] runtime error:", evt.error);
      setStore("byId", convId, "streamingMessageId", null);
      setStore("byId", convId, "isAgentActive", false);
      setStore("byId", convId, "lastError", evt.error.message);
      setConversationsSignal(Object.values(store.byId));
      break;
    case "compactionStarted":
      setStore("byId", convId, "compactionStatus", { _tag: "compacting", kind: "auto" });
      break;
    case "compactionCompleted":
      setStore("byId", convId, "compactionEntries", (entries) => [
        ...entries,
        evt.entry,
      ]);
      setStore("byId", convId, "compactionStatus", {
        _tag: "completed",
        kind: evt.entry.kind,
        entry: evt.entry,
      });
      break;
    case "compactionFailed":
      setStore("byId", convId, "compactionStatus", {
        _tag: "failed",
        kind: "auto",
        reason: evt.reason,
      });
      break;
  }
}


export function cancel(convId: string): void {
  const cs = store.byId[convId];
  if (!cs) { return; }
  cs.runtime.cancel();
  setStore("byId", convId, "streamingMessageId", null);
  setStore("byId", convId, "isAgentActive", false);
  setConversationsSignal(Object.values(store.byId));
}


export const archiveConversation = Effect.fn(
  function* (convId: string) {
    cancel(convId);
    const svc = yield* ConversationApi;
    yield* svc.archive(convId);
    setStore("byId", produce(prev => { delete prev[convId]; }));
    setConversationsSignal(Object.values(store.byId));
  },
  Effect.provide(ConversationApiLive),
);


export const deleteConversation = Effect.fn(
  function* (convId: string) {
    cancel(convId);
    const svc = yield* ConversationApi;
    yield* svc.delete(convId);
    setStore("byId", produce(prev => { delete prev[convId]; }));
    setConversationsSignal(Object.values(store.byId));
  },
  Effect.provide(ConversationApiLive),
);


export const renameConversation = Effect.fn(
  function* (convId: string, newTitle: string) {
    const svc = yield* ConversationApi;
    yield* svc.rename(convId, newTitle);
    setStore("byId", produce(prev => { prev[convId].title = newTitle; }));
    setConversationsSignal(Object.values(store.byId));
  },
  Effect.provide(ConversationApiLive),
);


export const loadConversations = Effect.fn(
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


export const createConversation = Effect.fn(
  function* (workspaceId: string, title: string, systemPrompt?: string) {
    const svc = yield* ConversationApi;
    const conv = yield* svc.create(title, systemPrompt ?? null, workspaceId);
    setupConvState(conv, []);
    return conv.id;
  },
  Effect.provide(ConversationApiLive),
);

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


export const pickWorkspacePath = Effect.fn(
  function* () {
    const svc = yield* WorkspaceService;
    return yield* svc.pickPath();
  },
  Effect.provide(WorkspaceServiceLive),
);

export const loadWorkspaces = Effect.fn(
  function* () {
    const svc = yield* WorkspaceService;
    const result = yield* svc.list();
    setStore("workspaces", result);
    setWorkspacesSignal(Object.values(store.workspaces));
    if (selectedWorkspaceId() === null && result.length === 1) {
      setSelectedWorkspaceIdSignal(result[0].id);
    }
  },
  Effect.provide(WorkspaceServiceLive),
);

export const addWorkspace = Effect.fn(
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

export const removeWorkspace = Effect.fn(
  function* (id: string) {
    const svc = yield* WorkspaceService;
    yield* svc.remove(id);
    setStore("workspaces", (ws) => ws.filter((w) => w.id !== id));
    setWorkspacesSignal(Object.values(store.workspaces));
    if (selectedWorkspaceId() === id) { setSelectedWorkspaceIdSignal(null); }
  },
  Effect.provide(WorkspaceServiceLive),
);

export const renameWorkspace = Effect.fn(
  function* (id: string, label: string) {
    const svc = yield* WorkspaceService;
    yield* svc.rename(id, label);
    setStore("workspaces", (ws) => ws.map((w) => (w.id === id ? { ...w, label } : w)));
    setWorkspacesSignal(Object.values(store.workspaces));
  },
  Effect.provide(WorkspaceServiceLive),
);
