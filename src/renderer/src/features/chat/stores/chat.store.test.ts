import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { Effect, Exit, Stream } from "effect";
import {
  store,
  setStore,
  conversations$,
  setupConvState,
  cancel,
  archiveConversation,
  sendMessage,
  deleteConversation,
  loadConversations,
  createConversation,
  createAndSendConversation,
  workspaces$,
  selectedWorkspaceId$,
  setSelectedWorkspaceId,
  addWorkspace,
  removeWorkspace,
  renameWorkspace,
  renameConversation,
  pickWorkspacePath,
  loadWorkspaces,
  type ConversationState,
} from "@codeman-frontend/features/chat/stores/chat.store";
import type { Conversation, Message, Workspace, CompactionEntry } from "@codeman-frontend/shared/lib/types";
import type { RuntimeEvent, ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";


// Track FileApi.readFile calls for projectInstructions caching test
const fileApiReadFileCalls: Array<{ workspaceId: string; path: string }> = [];
vi.mock("@codeman-frontend/shared/apis", async () => {
  const { Layer, Effect: E } = await import("effect");
  const {
    MessageApi,
    ConversationApi,
    ProviderApi,
    SettingsApi,
    SkillsApi,
    CompactionApi,
    FileApi,
    McpApi,
  } = await vi.importActual<typeof import("@codeman-frontend/shared/apis")>(
    "@codeman-frontend/shared/apis",
  );
  return {
    MessageApi,
    ConversationApi,
    ProviderApi,
    SettingsApi,
    SkillsApi,
    CompactionApi,
    FileApi,
    McpApi,
    FileApiLive: Layer.succeed(FileApi, {
      readFile: (workspaceId: string, path: string) => {
        fileApiReadFileCalls.push({ workspaceId, path });
        // Return AGENTS.md content for ws-1, NotFound for others
        if (path === "AGENTS.md" && workspaceId === "ws-1") {
          return E.succeed("# Project Instructions\nThis is the AGENTS.md content.");
        }
        return E.fail({ _tag: "NotFound", message: "not found" } as never);
      },
      writeFile: () => E.succeed(undefined),
      editFile: () => E.succeed(undefined),
      searchFiles: () => E.succeed([]),
      deleteFile: () => E.succeed(undefined),
    }),
    McpApiLive: Layer.succeed(McpApi, {
      listServers: () => E.succeed([]),
      getTools: () => E.succeed([]),
      getAllTools: () => E.succeed([]),
      enable: () => E.succeed(undefined),
      restart: () => E.succeed(undefined),
      callTool: () => E.succeed({} as unknown),
      openConfigDir: () => E.succeed(undefined),
    }),
    MessageApiLive: Layer.succeed(MessageApi, {
      list: () => E.succeed([] as Message[]),
      append: (args: {
        conversationId: string;
        role: string;
        content: string;
        toolCalls?: string;
        toolResults?: string;
        model?: string;
      }) =>
        E.succeed({
          id: "msg-id",
          conversationId: args.conversationId,
          role: args.role,
          content: args.content,
          toolCalls: args.toolCalls ? (JSON.parse(args.toolCalls) as Message["toolCalls"]) : null,
          toolResults: args.toolResults
            ? (JSON.parse(args.toolResults) as Message["toolResults"])
            : null,
          model: args.model ?? null,
          inputTokens: null,
          outputTokens: null,
          createdAt: Date.now(),
        } as Message),
      search: () => E.succeed([] as Message[]),
    }),
    ConversationApiLive: Layer.succeed(ConversationApi, {
      list: () => E.succeed([] as Conversation[]),
      get: (id: string) =>
        E.succeed({
          id,
          title: "x",
          systemPrompt: null,
          workspaceId: "",
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
        } as Conversation),
      create: (title: string, _systemPrompt: string | null, _workspaceId: string) =>
        E.succeed({
          id: "new-id",
          title,
          systemPrompt: null,
          workspaceId: _workspaceId,
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
        } as Conversation),
      archive: () => E.void,
      delete: () => E.void,
      rename: () => E.void,
    }),
    ProviderApiLive: Layer.succeed(ProviderApi, {
      list: () => E.succeed([]),
      get: () => E.fail({ kind: "IPC", message: "not used" } as never),
      getModels: () => E.succeed([]),
      fetchModels: () => E.succeed([]),
      delete: () => E.void,
    }),
    SettingsApiLive: Layer.succeed(SettingsApi, {
      getSettings: () =>
        E.succeed({
          providers: [],
          schemaVersion: "1.5" as const,
          defaultLlmProviderId: undefined,
          userLanguage: "auto" as const,
          theme: "system" as const,
          startAtLogin: false,
          window: {
            rememberPosition: true,
            rememberSize: true,
            defaultSize: { width: 800, height: 600 },
            minSize: { width: 600, height: 400 },
          },
          systemPrompt: { default: "", userCanEdit: true },
          conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
          enabledSkills: [] as string[],
          llmProviders: [],
        }),
      updateSettings: () =>
        E.succeed({
          providers: [],
          schemaVersion: "1.5" as const,
          defaultLlmProviderId: undefined,
          userLanguage: "auto" as const,
          theme: "system" as const,
          startAtLogin: false,
          window: {
            rememberPosition: true,
            rememberSize: true,
            defaultSize: { width: 800, height: 600 },
            minSize: { width: 600, height: 400 },
          },
          systemPrompt: { default: "", userCanEdit: true },
          conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
          enabledSkills: [] as string[],
          llmProviders: [],
        }),
      clearAllHistory: () => E.void,
      getActiveLlmProvider: () => E.succeed(null),
    }),
    SkillsApiLive: Layer.succeed(SkillsApi, {
      scan: () => E.succeed([]),
      load: () => E.succeed(""),
    }),
    CompactionApiLive: Layer.succeed(CompactionApi, {
      list: () => E.succeed([] as CompactionEntry[]),
      append: () =>
        E.succeed({
          id: "new-entry",
          conversationId: "c1",
          summary: "test summary",
          model: "test-model",
          tokensBefore: 1000,
          kind: "manual" as const,
          createdAt: Date.now(),
          firstKeptMessageId: "msg-1",
        } as CompactionEntry),
    }),
  };
});


vi.mock("../../../shared/lib/workspace-service", async () => {
  const { Layer, Effect: E } = await import("effect");
  const { WorkspaceService } = await vi.importActual<
    typeof import("../../../shared/lib/workspace-service")
  >("../../../shared/lib/workspace-service");
  return {
    WorkspaceService,
    WorkspaceServiceLive: Layer.succeed(WorkspaceService, {
      list: () =>
        E.succeed([
          { id: "ws-1", label: "Workspace 1", rootPath: "/path/ws1", createdAt: 1, updatedAt: 1 } as Workspace,
          { id: "ws-2", label: "Workspace 2", rootPath: "/path/ws2", createdAt: 2, updatedAt: 2 } as Workspace,
        ]),
      add: (label: string, _rootPath: string) =>
        E.succeed({ id: "new-ws-id", label, rootPath: "/new/path", createdAt: 3, updatedAt: 3 } as Workspace),
      rename: (_id: string, _label: string) => E.void,
      remove: (_id: string) => E.void,
      pickPath: () => E.succeed("/picked/path"),
    }),
  };
});


vi.mock("../lib/runtime", () => ({
  createAgentRuntime: () => ({
    run: () => Stream.fromIterable([]),
    cancel: () => { },
  }),
}));


const mockConv: Conversation = {
  id: "c1",
  title: "测试",
  systemPrompt: null,
  workspaceId: "",
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
};

const mockHistory: Message[] = [
  {
    id: "u1",
    conversationId: "c1",
    role: "user",
    content: "hi",
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: 1,
  },
];

const defaultProvider: ProviderConfig = {
  id: "test-provider",
  models: [{ id: "m1", label: "m1", deprecated: false, thinking: false }],
  apiKey: "test-key",
  baseUrl: "https://api.test.com",
  defaultModel: "test-model",
  systemPrompt: "You are a helpful assistant.",
  tools: [],
};


describe("chat.store — ConversationState 类型", () => {
  it("setupConvState() 插入 byId, 包含空 messages 状态和 runtime", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState | undefined;
      expect(cs).toBeDefined();
      expect(cs?.id).toBe("c1");
      expect(cs?.messages).toEqual(mockHistory);
      expect(cs?.streamingMessageId).toBeNull();
      expect(cs?.runtime).toBeDefined();
      expect(typeof cs?.runtime.run).toBe("function");
      expect(typeof cs?.runtime.cancel).toBe("function");
      dispose();
    }));

  it("conversations$ 访问器返回 byId 值", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      const list = conversations$();
      expect(list.some((c) => c.id === "c1")).toBe(true);
      dispose();
    }));
});

describe("sendMessage — 跨会话隔离", () => {
  it("A 的事件更新 A 的 slot, 不影响 B 的 slot", () =>
    createRoot((dispose) => {
      const convA = { ...mockConv, id: "cA" };
      const convB = { ...mockConv, id: "cB" };
      setupConvState(convA, []);
      setupConvState(convB, []);

      const csA = store.byId["cA"];
      const csB = store.byId["cB"];
      expect(csA).toBeDefined();
      expect(csB).toBeDefined();
      expect(csA).not.toBe(csB);
      expect(csA?.messages).not.toBe(csB?.messages);

      setStore("byId", "cA", "messages", [
        {
          id: "x",
          conversationId: "cA",
          role: "user",
          content: "test",
          thinking: null,
          toolCalls: null,
          toolResults: null,
          model: null,
          inputTokens: null,
          outputTokens: null,
          createdAt: 1,
        },
      ]);
      expect(store.byId["cA"]?.messages.length).toBe(1);
      expect(store.byId["cB"]?.messages.length).toBe(0);

      dispose();
    }));
});

describe("cancel / archive / delete — 取消/归档/删除", () => {
  it("cancel() 调用 runtime.cancel()", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, []);
      const cs = store.byId["c1"];
      const spy = vi.spyOn(cs!.runtime, "cancel");
      cancel("c1");
      expect(spy).toHaveBeenCalled();
      dispose();
    }));

  it("archiveConversation() 从 store 移除 + 调用 runtime.cancel()", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const cs = store.byId["c1"];
      const spy = vi.spyOn(cs!.runtime, "cancel");
      await Effect.runPromise(archiveConversation("c1"));
      expect(spy).toHaveBeenCalled();
      expect(store.byId["c1"]).toBeUndefined();
      dispose();
    });
  });
});


describe("sendMessage — G1: 添加 user msg 到 byId[convId].messages", () => {
  it("sendMessage() 添加 user message 到 store.byId[convId].messages", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable([]));
      await Effect.runPromise(sendMessage("c1", "hello", defaultProvider));
      const msgs = store.byId["c1"]?.messages ?? [];
      const userMsg = msgs.find((m) => m.role === "user");
      expect(userMsg).toBeDefined();
      expect(userMsg?.content).toBe("hello");
      dispose();
    });
  });
});

describe("sendMessage — G3: 从 store.byId[convId].messages 构建 context", () => {
  it("sendMessage() 构建包含新 user message 的 context", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, [{ ...mockHistory[0] }]);
      const runSpy = vi
        .spyOn(store.byId["c1"]!.runtime, "run")
        .mockReturnValue(Stream.fromIterable([]));
      await Effect.runPromise(sendMessage("c1", "second msg", defaultProvider));
      const callArg = runSpy.mock.calls[0][0];
      expect(callArg.context.length).toBeGreaterThanOrEqual(1);
      dispose();
    });
  });
});

describe("sendMessage — G4: 调用 runtime.run({ context, provider })", () => {
  it("sendMessage() 调用 cs.runtime.run 传入 context 和 provider", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const runSpy = vi
        .spyOn(store.byId["c1"]!.runtime, "run")
        .mockReturnValue(Stream.fromIterable([]));
      await Effect.runPromise(sendMessage("c1", "hello", defaultProvider));
      expect(runSpy).toHaveBeenCalledTimes(1);
      const opts = runSpy.mock.calls[0][0] as { context: Message[]; provider: ProviderConfig };
      expect(opts.provider).not.toBe(defaultProvider);
      // System prompt is now assembled via buildSystemPrompt (ADR-0051)
      expect(opts.provider.systemPrompt).toContain("You are an AI coding assistant");
      expect(opts.provider.systemPrompt).toContain("## Available tools");
      expect(opts.provider.systemPrompt).toContain("## Guidelines");
      expect(opts.provider.enabledSkills).toBeDefined();
      expect(opts.context).toBeDefined();
      dispose();
    });
  });

  it("sendMessage() 当 conv.workspace_id 非空但不在 workspaces$ 中 → 组装提示词（无 workspace 节）", async () => {
    await createRoot(async (dispose) => {
      const convWithWs: Conversation = {
        ...mockConv,
        id: "c-ws-fix",
        workspaceId: "real-uuid-7c8e9f10", // Not in mock workspaces (ws-1, ws-2)
      };
      setupConvState(convWithWs, []);
      const runSpy = vi
        .spyOn(store.byId["c-ws-fix"]!.runtime, "run")
        .mockReturnValue(Stream.fromIterable([]));
      await Effect.runPromise(sendMessage("c-ws-fix", "write to miniMax-workspace", defaultProvider));
      expect(runSpy).toHaveBeenCalledTimes(1);
      const opts = runSpy.mock.calls[0][0] as { provider: ProviderConfig };
      // Workspace not found in workspaces$, so no workspace context section
      expect(opts.provider.systemPrompt).not.toContain('workspaceId="real-uuid-7c8e9f10"');
      expect(opts.provider.systemPrompt).toContain("You are an AI coding assistant");
      expect(opts.provider.systemPrompt).toContain("## Available tools");
      dispose();
    });
  });

  it("sendMessage() 当 conv.workspace_id 为空时 → 组装完整提示词（无 workspace 节）", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const runSpy = vi
        .spyOn(store.byId["c1"]!.runtime, "run")
        .mockReturnValue(Stream.fromIterable([]));
      await Effect.runPromise(sendMessage("c1", "hello", defaultProvider));
      const opts = runSpy.mock.calls[0][0] as { provider: ProviderConfig };
      expect(opts.provider).not.toBe(defaultProvider);
      // System prompt is assembled via buildSystemPrompt (ADR-0051)
      expect(opts.provider.systemPrompt).toContain("You are an AI coding assistant");
      expect(opts.provider.systemPrompt).toContain("## Available tools");
      expect(opts.provider.systemPrompt).toContain("## Guidelines");
      expect(opts.provider.enabledSkills).toEqual([]);
      dispose();
    });
  });
});

describe("sendMessage — G5: 处理 token event → 在首个 event 时创建 streaming stub", () => {
  it("sendMessage() 在首个 token event 时创建 assistant stub message, 在 done 时清除", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const events: RuntimeEvent[] = [
        { type: "token", content: "Hello" },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Hello",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      expect(store.byId["c1"]?.streamingMessageId).toBeNull();
      const msgs = store.byId["c1"]?.messages ?? [];
      const assistantMsg = msgs.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.content).toBe("Hello");
      dispose();
    });
  });
});

describe("sendMessage — G6: 处理后续 token events → 更新 stub.content", () => {
  it("sendMessage() 在后续 token events 上累积 token content", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const events: RuntimeEvent[] = [
        { type: "token", content: "Hello " },
        { type: "token", content: "World" },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Hello World",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      const msgs = store.byId["c1"]?.messages ?? [];
      const finalMsg = msgs[msgs.length - 1];
      expect(finalMsg.content).toBe("Hello World");
      dispose();
    });
  });
});

describe("sendMessage — G31: token events 累积 (per-char delta 场景)", () => {
  it("G31a: 多 token 累积 (mock-server deltaSize=1 风格) → stub.content 是 concat 而非 replace", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const fullText = "Reading the file now....";
      const perCharEvents: RuntimeEvent[] = Array.from(fullText, (ch) => ({
        type: "token",
        content: ch,
      }));
      const events: RuntimeEvent[] = [
        ...perCharEvents,
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: fullText,
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "tool", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];
      const finalAssistant = msgs.find((m) => m.role === "assistant");
      expect(finalAssistant).toBeDefined();
      expect(finalAssistant?.content).toBe(fullText);
      dispose();
    });
  });

  it("G31b: 模拟 streaming 中段 snapshot → stub.content 是中间累积态而非单字符", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const fullText = "Reading the file now.";
      const partialEvents: RuntimeEvent[] = Array.from(fullText.slice(0, 8), (ch) => ({
        type: "token",
        content: ch,
      }));
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(
        Stream.fromIterable(partialEvents),
      );
      await Effect.runPromise(sendMessage("c1", "tool", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];
      const stub = msgs.find((m) => m.role === "assistant");
      expect(stub).toBeDefined();
      expect(stub?.content).toBe("Reading ");
      expect(stub?.content?.length).toBeGreaterThan(1);
      dispose();
    });
  });

  it("G31c: 多 thinking event 累积 (而非 replace)", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const fullThinking = "Step 1. Step 2. Step 3.";
      const perChunkEvents: RuntimeEvent[] = [
        { type: "thinking", content: "Step 1. " },
        { type: "thinking", content: "Step 2. " },
        { type: "thinking", content: "Step 3." },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(
        Stream.fromIterable(perChunkEvents),
      );
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];
      const stub = msgs.find((m) => m.role === "assistant");
      expect(stub).toBeDefined();
      expect(stub?.thinking).toBe(fullThinking);
      dispose();
    });
  });
});

describe("sendMessage — G7: 处理 tool_call event → 添加到 stub.tool_calls", () => {
  it("sendMessage() 添加 tool_call 到 assistant stub 的 tool_calls", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const toolCall = { id: "tc1", name: "get_weather", args: { city: "Tokyo" } };
      const events: RuntimeEvent[] = [
        { type: "token", content: "Let me check" },
        { type: "tool_call", toolCall },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "The weather is nice.",
            thinking: null,
            toolCalls: [toolCall],
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "weather?", defaultProvider));
      const msgs = store.byId["c1"]?.messages ?? [];
      const assistantMsg = msgs.find((m) => m.role === "assistant");
      expect(assistantMsg?.toolCalls).toBeDefined();
      expect(assistantMsg?.toolCalls?.length).toBeGreaterThan(0);
      dispose();
    });
  });
});

describe("sendMessage — G8: 处理 tool_result event → 添加到 stub.tool_results", () => {
  it("sendMessage() 添加 tool_result 到 assistant stub 的 tool_results", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const toolCall = { id: "tc1", name: "get_weather", args: { city: "Tokyo" } };
      const events: RuntimeEvent[] = [
        { type: "token", content: "Checking..." },
        { type: "tool_call", toolCall },
        { type: "tool_result", toolCallId: "tc1", result: { temp: 22 } },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "It's 22°C.",
            thinking: null,
            toolCalls: [toolCall],
            toolResults: [{ toolCallId: "tc1", result: { temp: 22 }, error: null }],
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "weather?", defaultProvider));
      const msgs = store.byId["c1"]?.messages ?? [];
      const stub = msgs.find((m) => m.role === "assistant");
      expect(stub?.toolResults).toBeDefined();
      expect(stub?.toolResults?.length).toBeGreaterThan(0);
      dispose();
    });
  });
});

describe("sendMessage — G9: 处理 done event → 替换 stub content + 设置 streamingMessageId=null + 持久化", () => {
  it("sendMessage() 处理 done event 替换 stub + 清除 streamingMessageId", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const events: RuntimeEvent[] = [
        { type: "token", content: "Final response" },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Final response",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: "test-model",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      expect(store.byId["c1"]?.streamingMessageId).toBeNull();
      dispose();
    });
  });


  it("G26: thinking stream 累积 → done event 带非空 thinking → 最终 message.thinking = 该字符串", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const thinkingAccumulated = "Reasoning step 1. Reasoning step 2.";
      const events: RuntimeEvent[] = [
        { type: "thinking", content: thinkingAccumulated },
        { type: "token", content: "Final answer text." },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Final answer text.",
            thinking: thinkingAccumulated,
            toolCalls: null,
            toolResults: null,
            model: "test-model",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];
      const finalMsg = msgs.find((m) => m.role === "assistant");
      expect(finalMsg).toBeDefined();
      expect(finalMsg?.thinking).toBe(thinkingAccumulated);
      expect(finalMsg?.content).toBe("Final answer text.");
      dispose();
    });
  });

  it("G27: stream 期间 stub.thinking 被覆写累积,后续 token 不会清掉 thinking", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const events: RuntimeEvent[] = [
        { type: "thinking", content: "Streaming thought chunk 1." },
        { type: "thinking", content: "Streaming thought chunk 1. Streaming thought chunk 2." },
        { type: "token", content: "answer text" },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "answer text",
            thinking: "Streaming thought chunk 1. Streaming thought chunk 2.",
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];
      const finalMsg = msgs.find((m) => m.role === "assistant");
      expect(finalMsg?.thinking).toBe(
        "Streaming thought chunk 1. Streaming thought chunk 2.",
      );
      expect(finalMsg?.content).toBe("answer text");
      dispose();
    });
  });

  it("G28: multi-turn (turn-1 tool_use + turn-2 short-circuit) → final assistant msg.toolCalls preserved", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const readFileToolCall = {
        id: "tc-read-1",
        name: "read_file",
        args: { path: "README.md" },
      };
      const events: RuntimeEvent[] = [
        { type: "thinking", content: "calling read_file" },
        { type: "token", content: "Reading the file now." },
        { type: "tool_call", toolCall: readFileToolCall },
        { type: "tool_result", toolCallId: "tc-read-1", result: "# Tauri + Solid" },
        { type: "thinking", content: "calling read_file" }, 
        { type: "token", content: "(mock) Script complete." },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "(mock) Script complete.",
            thinking: "calling read_file",
            toolCalls: [readFileToolCall], 
            toolResults: [
              {
                toolCallId: "tc-read-1",
                result: "# Tauri + Solid",
                error: null,
              },
            ],
            model: "mock-default",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "tool", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];
      const finalAssistant = msgs.find(
        (m) => m.role === "assistant" && m.content === "(mock) Script complete.",
      );
      expect(finalAssistant).toBeDefined();
      expect(finalAssistant?.toolCalls).not.toBeNull();
      expect(finalAssistant?.toolCalls?.length).toBe(1);
      expect(finalAssistant?.toolCalls?.[0]?.name).toBe("read_file");
      expect(finalAssistant?.toolResults?.length).toBe(1);
      dispose();
    });
  });
});

describe("sendMessage — G29: Bubble Boundary — 1 user input → N assistant bubbles (per agent turn)", () => {
  it("G29a: 2 turn run (turn-1 tool_use + turn-2 text) → 1 user + 2 assistant bubbles, turn-1 owns toolCalls/toolResults", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const readFileToolCall = {
        id: "tc-read-1",
        name: "read_file",
        args: { path: "README.md" },
      };

      const events: RuntimeEvent[] = [
        { type: "thinking", content: "Calling read_file." },
        { type: "token", content: "Reading the file now." },
        { type: "tool_call", toolCall: readFileToolCall },
        {
          type: "tool_result",
          toolCallId: "tc-read-1",
          result: "# Tauri + Solid",
        },
        {
          type: "done",
          message: {
            id: "turn-1-msg",
            conversationId: "c1",
            role: "assistant",
            content: "Reading the file now.",
            thinking: "Calling read_file.",
            toolCalls: [readFileToolCall],
            toolResults: [
              {
                toolCallId: "tc-read-1",
                result: "# Tauri + Solid",
                error: null,
              },
            ],
            model: "mock-default",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
        { type: "thinking", content: "Done." },
        { type: "token", content: "(mock) Script complete." },
        {
          type: "done",
          message: {
            id: "turn-2-msg",
            conversationId: "c1",
            role: "assistant",
            content: "(mock) Script complete.",
            thinking: "Done.",
            toolCalls: null, 
            toolResults: null,
            model: "mock-default",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "tool", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];

      expect(msgs.length).toBe(3);

      expect(msgs[0]?.role).toBe("user");
      expect(msgs[0]?.content).toBe("tool");

      const turn1 = msgs[1];
      expect(turn1?.role).toBe("assistant");
      expect(turn1?.content).toBe("Reading the file now.");
      expect(turn1?.thinking).toBe("Calling read_file.");
      expect(turn1?.toolCalls?.length).toBe(1);
      expect(turn1?.toolCalls?.[0]?.name).toBe("read_file");
      expect(turn1?.toolResults?.length).toBe(1);
      expect(turn1?.toolResults?.[0]?.result).toBe("# Tauri + Solid");

      const turn2 = msgs[2];
      expect(turn2?.role).toBe("assistant");
      expect(turn2?.content).toBe("(mock) Script complete.");
      expect(turn2?.thinking).toBe("Done.");
      expect(turn2?.toolCalls).toBeNull();
      expect(turn2?.toolResults).toBeNull();

      expect(store.byId["c1"]?.streamingMessageId).toBeNull();
      dispose();
    });
  });

  it("G29b: 3 turn run (turn-1 + turn-2 tool_use + turn-3 final) → 1 user + 3 assistant bubbles, each turn owns its own toolCalls", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);

      const events: RuntimeEvent[] = [
        { type: "thinking", content: "Reading." },
        { type: "tool_call", toolCall: { id: "tc-1", name: "read_file", args: {} } },
        { type: "tool_result", toolCallId: "tc-1", result: "data" },
        {
          type: "done",
          message: {
            id: "turn-1",
            conversationId: "c1",
            role: "assistant",
            content: "Reading.",
            thinking: "Reading.",
            toolCalls: [{ id: "tc-1", name: "read_file", args: {} }],
            toolResults: [{ toolCallId: "tc-1", result: "data", error: null }],
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
        { type: "thinking", content: "Searching." },
        { type: "tool_call", toolCall: { id: "tc-2", name: "search_files", args: {} } },
        { type: "tool_result", toolCallId: "tc-2", result: ["match"] },
        {
          type: "done",
          message: {
            id: "turn-2",
            conversationId: "c1",
            role: "assistant",
            content: "Searching.",
            thinking: "Searching.",
            toolCalls: [{ id: "tc-2", name: "search_files", args: {} }],
            toolResults: [{ toolCallId: "tc-2", result: ["match"], error: null }],
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
        { type: "thinking", content: "Summarizing." },
        { type: "token", content: "Summary complete." },
        {
          type: "done",
          message: {
            id: "turn-3",
            conversationId: "c1",
            role: "assistant",
            content: "Summary complete.",
            thinking: "Summarizing.",
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "summarize", defaultProvider));

      const msgs = store.byId["c1"]?.messages ?? [];

      expect(msgs.length).toBe(4); 
      expect(msgs[0]?.role).toBe("user");
      expect(msgs[1]?.role).toBe("assistant");
      expect(msgs[1]?.toolCalls?.[0]?.name).toBe("read_file");
      expect(msgs[2]?.role).toBe("assistant");
      expect(msgs[2]?.toolCalls?.[0]?.name).toBe("search_files");
      expect(msgs[3]?.role).toBe("assistant");
      expect(msgs[3]?.content).toBe("Summary complete.");
      expect(msgs[3]?.toolCalls).toBeNull();
      dispose();
    });
  });
});

describe("sendMessage — V2.8: isRunning 只在 message_stop 时停止,中间 done 不抖动", () => {
  it("V2.8-A: 多 turn 场景 (turn-1 done → turn-2 token → turn-2 done) 中,中间 done 不清 streamingMessageId", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const readFileToolCall = {
        id: "tc-read-1",
        name: "read_file",
        args: { path: "README.md" },
      };
      const events: RuntimeEvent[] = [
        { type: "thinking", content: "Let me read the file." },
        { type: "token", content: "Reading file." },
        { type: "tool_call", toolCall: readFileToolCall },
        {
          type: "tool_result",
          toolCallId: "tc-read-1",
          result: "file content",
        },
        {
          type: "done",
          message: {
            id: "turn-1-msg",
            conversationId: "c1",
            role: "assistant",
            content: "Reading file.",
            thinking: "Let me read the file.",
            toolCalls: [readFileToolCall],
            toolResults: [{ toolCallId: "tc-read-1", result: "file content", error: null }],
            model: "mock-default",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
        { type: "token", content: "Final answer after tool." },
        {
          type: "done",
          message: {
            id: "turn-2-msg",
            conversationId: "c1",
            role: "assistant",
            content: "Final answer after tool.",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: "mock-default",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "read me", defaultProvider));

      expect(store.byId["c1"]?.isAgentActive).toBe(true);
      const msgs = store.byId["c1"]?.messages ?? [];
      expect(msgs.length).toBe(3);
      expect(msgs[1]?.content).toBe("Reading file.");
      expect(msgs[2]?.content).toBe("Final answer after tool.");
      expect(msgs[1]?.id).not.toBe(msgs[2]?.id);
      dispose();
    });
  });

  it("V2.8-B: message_stop event 清 streamingMessageId (per-message 终止)", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const events: RuntimeEvent[] = [
        { type: "token", content: "Hello" },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Hello",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: "test-model",
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
        { type: "message_stop" },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      expect(store.byId["c1"]?.streamingMessageId).toBeNull();
      dispose();
    });
  });
});

describe("sendMessage — G10: 处理 error event → console.error", () => {
  it("sendMessage() 在 error event 时调用 console.error", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
      const events: RuntimeEvent[] = [{ type: "error", error: { message: "Something went wrong" } }];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      dispose();
    });
  });
});

describe("sendMessage — G11: 如果 convId 不在 byId 中则提前返回 (no-op)", () => {
  it("sendMessage() 当 convId 不在 byId 中时提前返回不报错", async () => {
    await createRoot(async (dispose) => {
      await expect(Effect.runPromise(sendMessage("c999", "hello", defaultProvider))).resolves.toBeUndefined();
      dispose();
    });
  });
});

describe("sendMessage — G12: 当 runtime stream 失败时 → console.error", () => {
  it("sendMessage() 当 runtime stream 失败时调用 console.error", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
      const failStream = Stream.fail(new Error("Stream failed")) as any;
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(failStream);
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      dispose();
    });
  });
});


describe("sendMessage — Bug B: RuntimeEvent 'error' sets store.byId[convId].lastError", () => {
  it("G25: 收到 {type:'error', error:{message:'X'}} 时 lastError = 'X'，且 streamingMessageId 清空", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

      const errorStream = Stream.make({
        type: "error" as const,
        error: { message: "AnthropicTransport: 缺 apiKey" },
      });
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(errorStream);

      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));

      const cs = store.byId["c1"] as ConversationState & { lastError?: string | null };
      expect(cs?.lastError).toBe("AnthropicTransport: 缺 apiKey");

      expect(errorSpy).toHaveBeenCalled();

      expect(cs?.streamingMessageId).toBeNull();

      errorSpy.mockRestore();
      dispose();
    });
  });
});


describe("archiveConversation — G13: 从 byId 移除 + 调用 runtime.cancel()", () => {
  it("archiveConversation() 从 byId 移除 conv + 调用 runtime.cancel()", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const cs = store.byId["c1"];
      const spy = vi.spyOn(cs!.runtime, "cancel");
      await Effect.runPromise(archiveConversation("c1"));
      expect(spy).toHaveBeenCalled();
      expect(store.byId["c1"]).toBeUndefined();
      dispose();
    });
  });
});


describe("deleteConversation — G15: 从 byId 移除 + 调用 runtime.cancel()", () => {
  it("deleteConversation() 从 byId 移除 conv + 调用 runtime.cancel()", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const cs = store.byId["c1"];
      const spy = vi.spyOn(cs!.runtime, "cancel");
      await Effect.runPromise(deleteConversation("c1"));
      expect(spy).toHaveBeenCalled();
      expect(store.byId["c1"]).toBeUndefined();
      dispose();
    });
  });
});


describe("renameConversation — G14: 更新 byId[convId].title + 刷新 conversations$", () => {
  it("renameConversation() 更新 conv title + 刷新 conversations$", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      expect(store.byId["c1"]?.title).toBe("测试");
      expect(conversations$().some((c) => c.id === "c1")).toBe(true);

      await Effect.runPromise(renameConversation("c1", "new-title"));

      expect(store.byId["c1"]?.title).toBe("new-title");
      const updatedConv = conversations$().find((c) => c.id === "c1");
      expect(updatedConv?.title).toBe("new-title");
      dispose();
    });
  });
});


describe("loadConversations — G16: 遍历 convs + 填充 byId", () => {
  it("loadConversations() 用 service 中的 conversations 填充 byId", async () => {
    await createRoot(async (dispose) => {
      await loadConversations(false);
      expect(typeof store.byId).toBe("object");
      dispose();
    });
  });
});

describe("loadConversations — G17: 当 MessageApi.list 失败时跳过 per-conv", () => {
  it("loadConversations() 当 conv 的 MessageApi.list 失败时继续执行", async () => {
    await createRoot(async (dispose) => {
      await expect(Effect.runPromise(loadConversations(false))).resolves.toBeUndefined();
      dispose();
    });
  });
});


describe("createConversation — G18: 调用 ConversationApi.create + setupConvState + 返回 convId", () => {
  it("createConversation() 创建 conv + 设置 state + 返回 convId", async () => {
    await createRoot(async (dispose) => {
      const convId = await Effect.runPromise(createConversation("ws-1", "New Chat"));
      expect(convId).toBe("new-id");
      expect(store.byId["new-id"]).toBeDefined();
      dispose();
    });
  });
});

describe("createConversation — G22: workspaceId 作为第一参数传入 IPC", () => {
  it("createConversation 接受 workspaceId 作为第一参数,传入 IPC", async () => {
    await createRoot(async (dispose) => {
      await Effect.runPromise(createConversation("ws-test", "title with workspace"));
      const created = store.byId["new-id"];
      expect(created).toBeDefined();
      expect((created as ConversationState | undefined)?.id).toBe("new-id");
      dispose();
    });
  });
});


describe("persistUserMessage — G20: 调用 MessageApi.append 并传入正确参数 (snake→camel 桥接)", () => {
  it("persistUserMessage() 通过 sendMessage 工作 - 验证 snake→camel 桥接", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const events: RuntimeEvent[] = [
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Hi",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hello", defaultProvider));
      expect(store.byId["c1"]?.messages.some((m) => m.role === "user")).toBe(true);
      dispose();
    });
  });
});

describe("persistAssistantMessage — G21: 当存在时将 toolCalls/toolResults 作为 JSON 字符串传递", () => {
  it("persistAssistantMessage() 在提供时将 toolCalls 和 toolResults 字符串化", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const toolCall = { id: "tc1", name: "test", args: {} };
      const events: RuntimeEvent[] = [
        { type: "tool_call", toolCall },
        { type: "tool_result", toolCallId: "tc1", result: "ok" },
        {
          type: "done",
          message: {
            id: "final",
            conversationId: "c1",
            role: "assistant",
            content: "Done",
            thinking: null,
            toolCalls: [toolCall],
            toolResults: [{ toolCallId: "tc1", result: "ok", error: null }],
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: Date.now(),
          },
        },
      ];
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("c1", "hi", defaultProvider));
      expect(store.byId["c1"]?.messages.some((m) => m.role === "assistant")).toBe(true);
      dispose();
    });
  });
});


describe("createAndSendConversation — T4.2: create + sendMessage chained", () => {
  it("createAndSendConversation: calls createConversation + sendMessage with new conv id", async () => {
    await createRoot(async (dispose) => {
      await Effect.runPromise(createAndSendConversation("ws-1", "Test Title", "First message content", defaultProvider));

      expect(store.byId["new-id"]).toBeDefined();
      const msgs = store.byId["new-id"]?.messages ?? [];
      const userMsg = msgs.find((m) => m.role === "user");
      expect(userMsg?.content).toBe("First message content");

      dispose();
    });
  });
});


describe("loadConversations — G23: setupConvState called with conversation + history", () => {
  it("loadConversations: calls setupConvState for each conversation returned by list", async () => {
    await createRoot(async (dispose) => {
      await Effect.runPromise(loadConversations(false));
      expect(store.byId["c1"]).toBeDefined();
      dispose();
    });
  });
});

describe("createAndSendConversation — G24: setupConvState copies workspace_id", () => {
  it("createAndSendConversation: setupConvState copies workspace_id from Conversation to ConversationState", () => {
    createRoot((dispose) => {
      const convWithWsId: Conversation = {
        ...mockConv,
        id: "c-ws-test",
        workspaceId: "ws-specific-123",
      };
      setupConvState(convWithWsId, []);
      const cs = store.byId["c-ws-test"] as ConversationState | undefined;
      expect(cs).toBeDefined();
      expect(cs?.workspaceId).toBe("ws-specific-123");
      dispose();
    });
  });
});


describe("chat.store — workspace CRUD", () => {
  it("workspaces$: returns current workspaces array", () => {
    createRoot((dispose) => {
      const ws = workspaces$();
      expect(Array.isArray(ws)).toBe(true);
      dispose();
    });
  });

  it("selectedWorkspaceId$: initially null", () => {
    createRoot((dispose) => {
      expect(selectedWorkspaceId$()).toBeNull();
      dispose();
    });
  });

  it("setSelectedWorkspaceId(null): clears reactive signal", () => {
    createRoot((dispose) => {
      setSelectedWorkspaceId("ws-1");
      expect(selectedWorkspaceId$()).toBe("ws-1");
      setSelectedWorkspaceId(null);
      expect(selectedWorkspaceId$()).toBeNull();
      dispose();
    });
  });

  it("setSelectedWorkspaceId(id): sets reactive signal", () => {
    createRoot((dispose) => {
      setSelectedWorkspaceId("ws-2");
      expect(selectedWorkspaceId$()).toBe("ws-2");
      dispose();
    });
  });

  it("pickWorkspacePath: returns Effect wrapping WorkspaceService.pickPath", async () => {
    const result = await Effect.runPromiseExit(pickWorkspacePath());
    Exit.match(result, {
      onSuccess: (value) => expect(value).toBe("/picked/path"),
      onFailure: () => expect("should not fail").toBe("should not fail"),
    });
  });

  it("loadWorkspaces: writes workspaces to store via WorkspaceService.list", async () => {
    await createRoot(async (dispose) => {
      await Effect.runPromiseExit(loadWorkspaces());
      const ws = workspaces$();
      expect(ws.some((w) => w.id === "ws-1")).toBe(true);
      expect(ws.some((w) => w.id === "ws-2")).toBe(true);
      dispose();
    });
  });

  it("addWorkspace: IPC succeeds → adds workspace to store + sets selectedWorkspaceId", async () => {
    await createRoot(async (dispose) => {
      const result = await Effect.runPromiseExit(addWorkspace());
      Exit.match(result, {
        onSuccess: (value) => {
          expect(value).not.toBeNull();
          expect(value?.id).toBe("new-ws-id");
        },
        onFailure: () => expect("should not fail").toBe("should not fail"),
      });
      expect(workspaces$().some((w) => w.id === "new-ws-id")).toBe(true);
      expect(selectedWorkspaceId$()).toBe("new-ws-id");
      dispose();
    });
  });

  it("removeWorkspace: IPC succeeds → filters workspace from store", async () => {
    await createRoot(async (dispose) => {
      await Effect.runPromiseExit(loadWorkspaces());
      expect(workspaces$().some((w) => w.id === "ws-1")).toBe(true);

      const result = await Effect.runPromiseExit(removeWorkspace("ws-1"));
      expect(Exit.isSuccess(result)).toBe(true);
      expect(workspaces$().some((w) => w.id === "ws-1")).toBe(false);
      dispose();
    });
  });

  it("renameWorkspace: IPC succeeds → patches workspace label in store", async () => {
    await createRoot(async (dispose) => {
      await Effect.runPromiseExit(loadWorkspaces());
      expect(workspaces$().find((w) => w.id === "ws-1")?.label).toBe("Workspace 1");

      const result = await Effect.runPromiseExit(renameWorkspace("ws-1", "Renamed WS"));
      expect(Exit.isSuccess(result)).toBe(true);
      expect(workspaces$().find((w) => w.id === "ws-1")?.label).toBe("Renamed WS");
      dispose();
    });
  });
});


describe("per-conv runtime isolation — streamingMessageId per conv independence", () => {
  it("cancel() synchronously clears streamingMessageId (fixes D2: Cancel restores Send button)", async () => {
    await createRoot(async (dispose) => {
      const convA = { ...mockConv, id: "cA" };
      setupConvState(convA, []);

      const stubId = "streaming-stub-123";
      setStore("byId", "cA", "streamingMessageId", stubId);

      expect(store.byId["cA"]?.streamingMessageId).toBe(stubId);

      cancel("cA");

      expect(store.byId["cA"]?.streamingMessageId).toBeNull();

      dispose();
    });
  });

  it("D1+D3: Switching active conv does NOT clear streamingMessageId on the other conv", async () => {
    await createRoot(async (dispose) => {
      const convA = { ...mockConv, id: "cA" };
      const convB = { ...mockConv, id: "cB" };
      setupConvState(convA, []);
      setupConvState(convB, []);

      setStore("byId", "cA", "streamingMessageId", "stub-A-123");

      expect(store.byId["cA"]?.streamingMessageId).toBe("stub-A-123");
      expect(store.byId["cB"]?.streamingMessageId).toBeNull();

      dispose();
    });
  });

  it("D1+D3: ConvB's messages do NOT contain ConvA's streaming text after switch", async () => {
    await createRoot(async (dispose) => {
      const convA = { ...mockConv, id: "cA" };
      const convB = { ...mockConv, id: "cB" };
      setupConvState(convA, []);
      setupConvState(convB, []);

      const stubA: Message = {
        id: "stub-A",
        conversationId: "cA",
        role: "assistant",
        content: "Hello from conv A partial",
        thinking: "",
        toolCalls: null,
        toolResults: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: Date.now(),
      };
      setStore("byId", "cA", "streamingMessageId", "stub-A");
      setStore("byId", "cA", "messages", [stubA]);

      const convBMessages = store.byId["cB"]?.messages ?? [];
      expect(convBMessages.some((m) => m.content.includes("conv A"))).toBe(false);

      dispose();
    });
  });

  it("D2: After cancel, sendMessage on same conv works normally (new streaming starts)", async () => {
    await createRoot(async (dispose) => {
      const convA = { ...mockConv, id: "cA" };
      setupConvState(convA, []);

      setStore("byId", "cA", "streamingMessageId", "old-stream");

      cancel("cA");

      expect(store.byId["cA"]?.streamingMessageId).toBeNull();

      const events: RuntimeEvent[] = [
        { type: "done", message: { id: "final", conversationId: "cA", role: "assistant", content: "ok", thinking: null, toolCalls: null, toolResults: null, model: null, inputTokens: null, outputTokens: null, createdAt: Date.now() } },
      ];
      vi.spyOn(store.byId["cA"]!.runtime, "run").mockReturnValue(Stream.fromIterable(events));
      await Effect.runPromise(sendMessage("cA", "second message", defaultProvider));

      expect(store.byId["cA"]?.streamingMessageId).toBeNull();
      const msgs = store.byId["cA"]?.messages ?? [];
      expect(msgs.some((m) => m.role === "user" && m.content === "second message")).toBe(true);

      dispose();
    });
  });

  it("D5: streamingMessageId is non-null while stream is in-flight, null after done", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);

      expect(store.byId["c1"]?.streamingMessageId).toBeNull();

      setStore("byId", "c1", "streamingMessageId", "new-stream-stub");

      expect(store.byId["c1"]?.streamingMessageId).not.toBeNull();

      setStore("byId", "c1", "streamingMessageId", null);

      expect(store.byId["c1"]?.streamingMessageId).toBeNull();

      dispose();
    });
  });

  it("D1+D3+D5: Two convs can stream simultaneously with independent streamingMessageId", async () => {
    await createRoot(async (dispose) => {
      const convA = { ...mockConv, id: "cA" };
      const convB = { ...mockConv, id: "cB" };
      setupConvState(convA, []);
      setupConvState(convB, []);

      setStore("byId", "cA", "streamingMessageId", "stream-A");
      setStore("byId", "cB", "streamingMessageId", "stream-B");

      expect(store.byId["cA"]?.streamingMessageId).toBe("stream-A");
      expect(store.byId["cB"]?.streamingMessageId).toBe("stream-B");

      cancel("cA");
      expect(store.byId["cA"]?.streamingMessageId).toBeNull();
      expect(store.byId["cB"]?.streamingMessageId).toBe("stream-B");

      cancel("cB");
      expect(store.byId["cA"]?.streamingMessageId).toBeNull();
      expect(store.byId["cB"]?.streamingMessageId).toBeNull();

      dispose();
    });
  });
});

describe("sendMessage — projectInstructions caching (ADR-0051)", () => {
  beforeEach(() => {
    fileApiReadFileCalls.length = 0;
  });

  it("首次 sendMessage 对有 workspace 的会话调用一次 FileApi.readFile，第二次不调用", async () => {
    await createRoot(async (dispose) => {
      const convWithWs: Conversation = {
        ...mockConv,
        id: "c-ws-cache",
        workspaceId: "ws-1", // Exists in mock WorkspaceService
      };
      setupConvState(convWithWs, []);
      vi.spyOn(store.byId["c-ws-cache"]!.runtime, "run").mockReturnValue(Stream.fromIterable([]));

      // First sendMessage - should load projectInstructions
      await Effect.runPromise(sendMessage("c-ws-cache", "hello", defaultProvider));
      expect(fileApiReadFileCalls.length).toBe(1);
      expect(fileApiReadFileCalls[0]).toEqual({ workspaceId: "ws-1", path: "AGENTS.md" });

      // Second sendMessage - should NOT load again (cached)
      await Effect.runPromise(sendMessage("c-ws-cache", "hello again", defaultProvider));
      expect(fileApiReadFileCalls.length).toBe(1); // Still 1, not 2

      dispose();
    });
  });

  it("无 workspace 的会话不调用 FileApi.readFile", async () => {
    await createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      vi.spyOn(store.byId["c1"]!.runtime, "run").mockReturnValue(Stream.fromIterable([]));

      await Effect.runPromise(sendMessage("c1", "hello", defaultProvider));
      expect(fileApiReadFileCalls.length).toBe(0);

      dispose();
    });
  });
});
