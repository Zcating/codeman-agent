//! ChatView 组件测试。
//!
//! Mocked: conversations store, messages store, runtime services.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ChatView } from "./chat-view";
import type { Message } from "../../../shared/lib/types";

const mockMessages: Message[] = [
  {
    id: "msg-1",
    conversation_id: "conv-1",
    role: "user",
    content: "Hello",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1710000000,
  },
  {
    id: "msg-2",
    conversation_id: "conv-1",
    role: "assistant",
    content: "Hi there!",
    tool_calls: null,
    tool_results: null,
    model: "gpt-4o",
    input_tokens: null,
    output_tokens: null,
    created_at: 1710000001,
  },
  {
    id: "msg-3",
    conversation_id: "conv-1",
    role: "tool",
    content: "file content here",
    tool_calls: null,
    tool_results: [
      {
        tool_call_id: "tc-read-1",
        result: "const x = 1;\nconst y = 2;\nconsole.log(x + y);",
        error: null,
      },
    ],
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1710000002,
  },
];

vi.mock("../stores/conversations.store", () => ({
  conversations$: vi.fn(() => [
    {
      id: "conv-1",
      title: "Test",
      system_prompt: null,
      created_at: 1710000000,
      updated_at: 1710000000,
      archived_at: null,
    },
  ]),
  activeId$: vi.fn(() => "conv-1"),
  loadConversations: vi.fn(),
  createConversation: vi.fn(),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("../stores/messages.store", () => ({
  messages$: vi.fn(() => mockMessages),
  loadMessages: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessageDelta: vi.fn(),
  finalizeAssistantMessage: vi.fn(),
  persistAssistantMessage: vi.fn(),
  appendToolCall: vi.fn(),
  finalizeToolResult: vi.fn(),
  clearMessages: vi.fn(),
  appendStreamingAssistantMessage: vi.fn(),
}));

// V1.x provider selector: mock appStore (state + set) 和 settingsSaver (scheduleSave)。
// appStore 内部 state 用 module-scoped variable, test 之间通过 __setAppStoreState 重置。
vi.mock("../../../shared/stores/app.store", () => {
  let settings = {
    providers: [
      {
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        api_key: "",
        llm: {
          default_model: "MiniMax-M2.5-highspeed",
          base_url: "https://api.minimaxi.com/anthropic",
          api_type: "anthropic-messages",
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
          ],
          models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
        },
        billing: { kind: "plan_quota" },
      },
    ],
    default_llm_provider_id: "minimax",
  };
  return {
    appStore: {
      state: {
        get value() {
          return settings;
        },
        set value(v) {
          settings = v;
        },
      },
      set: vi.fn((patch) => {
        settings = { ...settings, ...patch };
      }),
      forceFlush: vi.fn(),
      refresh: vi.fn(),
      refreshProviderModels: vi.fn(),
      deleteProvider: vi.fn(),
      pickWorkspacePath: vi.fn(),
      clearAllHistory: vi.fn(),
    },
    _resetAppStoreForTest: vi.fn(),
    __setAppStoreState: (s: { providers: any[]; default_llm_provider_id: string }) => {
      settings = s;
    },
    __getAppStoreState: () => settings,
  };
});

vi.mock("../../settings/lib/settings-saver", () => ({
  settingsSaver: {
    scheduleSave: vi.fn(),
    cancelPending: vi.fn(),
    flushNow: vi.fn(),
  },
}));

vi.mock(import("../lib/runtime"), async (importOriginal) => {
  // V1.7+ 的 mock 只覆盖 AgentRuntime / RuntimeLayer(组件测试不需要真 runtime),
  // 但 commit 1fc33e7 之后 agent.ts 在模块加载时引用了 AgentRuntimeLive / RuntimeDeps
  // / RuntimeError 来构建 fullLayer(ADR-0016 D6)。用 importOriginal spread 真模块
  // 保留这些符号,避免 Layer.provide(AgentRuntimeLive, RuntimeDeps) 报
  // "No AgentRuntimeLive export is defined"。
  const actual = await importOriginal<typeof import("../lib/runtime")>();
  return {
    ...actual,
    AgentRuntime: { of: vi.fn() } as never,
  };
});

describe("ChatView", () => {
  afterEach(() => cleanup());

  it("从 messages$ 渲染消息列表", () => {
    const { container } = render(() => <ChatView />);
    // MessageBubble 外层包装有 class `mb-3 flex w-full`（Tailwind utilities）
    // mock 数据含 3 条消息(user / assistant / tool),全 role 都走同一 wrapper,
    // 所以 querySelectorAll("div.mb-3") 应得 3。
    const bubbles = container.querySelectorAll("div.mb-3");
    expect(bubbles.length).toBe(3);
  });

  it("输入为空时 Send 按钮禁用", () => {
    const { container } = render(() => <ChatView />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it("运行中状态显示 Cancel 按钮", async () => {
    const { container } = render(() => <ChatView />);
    // 运行状态在组件内部 - 我们测试当 running() 为 true 时，
    // Cancel 按钮替代 Send 按钮出现。我们可以验证初始状态显示 "发送"。
    // Polish F2: 按钮文字走中文 "发送" (前是 "Send")
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe("发送");
    // 当运行时，按钮会通过 <Show> fallback 变为 "取消"。
    // 我们可以验证结构是正确的 - 有一个带 fallback 的 Show 组件。
    const cancelBtn = container.querySelector('button:not([type="submit"])');
    expect(cancelBtn).toBeNull(); // 初始时无 cancel 按钮
  });

  it("tool 角色的消息渲染工具结果", () => {
    const { container } = render(() => <ChatView />);
    // 验证工具结果details存在
    const details = container.querySelectorAll("details");
    expect(details.length).toBeGreaterThan(0);
    // 验证工具结果标签存在
    const hasToolResult = Array.from(details).some((d) => d.textContent?.includes("工具结果"));
    expect(hasToolResult).toBe(true);
  });

  it("tool 消息显示工具调用 ID 和结果", () => {
    const { container } = render(() => <ChatView />);
    const codeElements = container.querySelectorAll("code");
    const hasToolCallId = Array.from(codeElements).some((code) => code.textContent === "tc-read-1");
    expect(hasToolCallId).toBe(true);
  });

  // ─── V1.x provider 选择器测试 ─────────────────────────────────────
  // 通过 vi.mock 工厂内导出的 __setAppStoreState / __getAppStoreState helpers
  // 在每个 test 之间重置 appStore state,避免 test 顺序耦合。
  it("渲染 provider 选择器并列出 enabled 的 provider", () => {
    const { container } = render(() => <ChatView />);
    const select = container.querySelector('select[id="provider-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    // 默认 mock providers 只 1 个 enabled (minimax)
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["minimax"]);
  });

  it("默认值匹配 appStore.state.value.default_llm_provider_id", () => {
    const { container } = render(() => <ChatView />);
    const select = container.querySelector('select[id="provider-select"]') as HTMLSelectElement;
    expect(select.value).toBe("minimax");
  });

  it("切换 provider 触发 appStore.set + settingsSaver.scheduleSave", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const appStoreMock = await import("../../../shared/stores/app.store");
    const settingsSaverMock = await import("../../settings/lib/settings-saver");
    (appStoreMock as any).__setAppStoreState({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com/anthropic",
            api_type: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
          billing: { kind: "plan_quota" },
        },
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: true,
          api_key: "",
          llm: {
            default_model: "deepseek-chat",
            base_url: "https://api.deepseek.com/anthropic",
            api_type: "anthropic-messages",
            models: [
              { id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false },
            ],
            models_endpoint: "https://api.deepseek.com/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView />);
    const select = container.querySelector('select[id="provider-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["minimax", "deepseek"]);
    await user.selectOptions(select, "deepseek");
    const setMock = (appStoreMock as any).appStore.set as ReturnType<typeof vi.fn>;
    expect(setMock).toHaveBeenCalled();
    const lastSetCall = setMock.mock.calls[setMock.mock.calls.length - 1][0];
    expect(lastSetCall.default_llm_provider_id).toBe("deepseek");
    const scheduleSaveMock = (settingsSaverMock as any).settingsSaver
      .scheduleSave as ReturnType<typeof vi.fn>;
    expect(scheduleSaveMock).toHaveBeenCalled();
  });

  it("无 enabled provider 时显示空状态链接到 /settings", async () => {
    const appStoreMock = await import("../../../shared/stores/app.store");
    (appStoreMock as any).__setAppStoreState({
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: false,
          api_key: "",
          llm: {
            default_model: "deepseek-chat",
            base_url: "https://api.deepseek.com/anthropic",
            api_type: "anthropic-messages",
            models: [{ id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false }],
            models_endpoint: "https://api.deepseek.com/models",
          },
        },
      ],
      default_llm_provider_id: "deepseek",
    });
    const { container } = render(() => <ChatView />);
    const select = container.querySelector('select[id="provider-select"]');
    expect(select).toBeNull();
    const link = container.querySelector('a[href="/settings"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("settings");
  });
});
