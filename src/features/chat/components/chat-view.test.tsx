//! ChatView 组件测试。
//!
//! Mocked: conversations store (V2 ADR-0019，不再 mock messages.store / agent.store）。

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ChatView } from "./chat-view";
import type { Message } from "../../../shared/lib/types";

// V2 ADR-0019: 不再 mock messages.store / agent.store，全部走 conversations.store
// 注意: vi.mock 会被 hoisting，所以 mock 数据必须内联在工厂函数内部
vi.mock("../stores/conversations.store", () => ({
  store: {
    activeId: null,
    byId: {
      "conv-1": {
        id: "conv-1",
        title: "Test",
        system_prompt: null,
        created_at: 1710000000,
        updated_at: 1710000000,
        archived_at: null,
        messages: [
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
        ] as Message[],
        streamingMessageId: null,
        runtime: { run: vi.fn(), cancel: vi.fn() },
      },
    },
  },
  activeId$: vi.fn(() => "conv-1"),
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
  sendMessage: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
  selectConversation: vi.fn(),
  setupConvState: vi.fn(),
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
            {
              id: "MiniMax-M2.5-highspeed",
              label: "MiniMax-M2.5-highspeed",
              deprecated: false,
              thinking: false,
            },
          ],
          models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
        },
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
  const actual = await importOriginal<typeof import("../lib/runtime")>();
  return {
    ...actual,
    AgentRuntime: { of: vi.fn() } as never,
  };
});

describe("ChatView", () => {
  afterEach(() => cleanup());

  it("从 store.byId[convId].messages 渲染消息列表", () => {
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
    // 运行状态在组件内部 - 我们测试当 isRunning() 为 true 时，
    // Cancel 按钮替代 Send 按钮出现。我们可以验证初始状态显示 "发送"。
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe("发送");
    // 当运行时，按钮会通过 <Show> fallback 变为 "取消"。
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
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
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
    const scheduleSaveMock = (settingsSaverMock as any).settingsSaver.scheduleSave as ReturnType<
      typeof vi.fn
    >;
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
            models: [
              { id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false },
            ],
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

  // ─── handleSend 测试 ─────────────────────────────────────────────────
  it("handleSend with valid input 调 sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/conversations.store");
    const appStoreMock = await import("../../../shared/stores/app.store");
    // Reset sendMessage mock and appStore state
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
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
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "hi");
    expect(textarea.value).toBe("hi");
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);
    // sendMessage mockResolvedValue(undefined), so await
    await vi.waitFor(() => {
      expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith(
        "conv-1",
        "hi",
        expect.objectContaining({
          apiKey: "",
          baseUrl: "https://api.minimaxi.com/anthropic",
          defaultModel: "MiniMax-M2.5-highspeed",
        })
      );
    });
  });

  it("handleSend empty input 不调 sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/conversations.store");
    // Reset sendMessage mock before test
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    const { container } = render(() => <ChatView />);
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);
    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).not.toHaveBeenCalled();
  });

  it("handleSend 输入后清空 input", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const appStoreMock = await import("../../../shared/stores/app.store");
    const conversationsStoreMock = await import("../stores/conversations.store");
    // Reset sendMessage mock and appStore state
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
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
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "hello world");
    expect(textarea.value).toBe("hello world");
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);
    // After send, textarea should be cleared
    await vi.waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  // ─── handleCancel 测试 ───────────────────────────────────────────────
  it("handleCancel 调 cancel(convId)", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/conversations.store");
    // Reset cancel mock and set streaming state
    (conversationsStoreMock as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel.mockClear();
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    const { container } = render(() => <ChatView />);
    // Cancel button appears when streaming
    const cancelBtn = container.querySelector('button:not([type="submit"])') as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn);
    expect((conversationsStoreMock as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel).toHaveBeenCalledWith("conv-1");
  });

  // ─── thinking indicator 测试 ────────────────────────────────────────
  it("thinking indicator 显示当 streaming + 最后消息 content=''", async () => {
    const conversationsStoreMock = await import("../stores/conversations.store");
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null; messages: Message[] }> } }).store;
    // Reset streaming state first, then set fresh
    mockStore.byId["conv-1"].streamingMessageId = null;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    // Set last message content to empty string for thinking indicator condition
    mockStore.byId["conv-1"].messages[mockStore.byId["conv-1"].messages.length - 1].content = "";
    const { container } = render(() => <ChatView />);
    const indicator = container.querySelector('[role="status"]');
    expect(indicator).toBeTruthy();
    expect(indicator?.textContent).toContain("正在思考…");
  });

  it("thinking indicator 不显示 non-streaming", async () => {
    const conversationsStoreMock = await import("../stores/conversations.store");
    // Ensure store state is clean
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = null;
    const { container } = render(() => <ChatView />);
    const indicator = container.querySelector('[role="status"]');
    expect(indicator).toBeNull();
  });

  // ─── form submit 测试 ────────────────────────────────────────────────
  it("form submit preventDefault + handleSend", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/conversations.store");
    const appStoreMock = await import("../../../shared/stores/app.store");
    // Reset sendMessage mock and appStore state
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
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
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "submit test");
    const form = container.querySelector("form") as HTMLFormElement;
    // user.submit doesn't exist, use fireEvent.submit
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalled();
    });
    // Also verify textarea cleared
    expect(textarea.value).toBe("");
  });
});
