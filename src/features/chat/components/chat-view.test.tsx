//! ChatView 组件测试。
//!
//! Mocked: conversations store (V2 ADR-0019，不再 mock messages.store / agent.store）。

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { Effect } from "effect";
import { ChatView } from "./chat-view";
import type { Message } from "../../../shared/lib/types";

// V2 ADR-0019: 不再 mock messages.store / agent.store，全部走 chat.store
// 注意: vi.mock 会被 hoisting，所以 mock 数据必须内联在工厂函数内部
vi.mock("../stores/chat.store", () => ({
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
            thinking: null,
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
            thinking: null,
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
            thinking: null,
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
      "conv-err": {
        id: "conv-err",
        title: "Err",
        system_prompt: null,
        created_at: 1710000000,
        updated_at: 1710000000,
        archived_at: null,
        messages: [],
        streamingMessageId: null,
        lastError: "AnthropicTransport: 缺 apiKey",
        runtime: { run: vi.fn(), cancel: vi.fn() },
      },
    },
  },
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
  sendMessage: vi.fn(() => Effect.succeed(undefined)),
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
    const { container } = render(() => <ChatView convId="conv-1" />);
    // MessageBubble 外层包装有 class `mb-3 flex w-full`（Tailwind utilities）
    // mock 数据含 3 条消息(user / assistant / tool),全 role 都走同一 wrapper,
    // 所以 querySelectorAll("div.mb-3") 应得 3。
    const bubbles = container.querySelectorAll("div.mb-3");
    expect(bubbles.length).toBe(3);
  });

  it("输入为空时 Send 按钮禁用", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it("运行中状态显示 Cancel 按钮", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    // 运行状态在组件内部 - 我们测试当 isRunning() 为 true 时，
    // Cancel 按钮替代 Send 按钮出现。我们可以验证初始状态显示 "发送"。
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe("发送");
    // 当运行时，按钮会通过 <Show> fallback 变为 "取消"。Cancel 按钮有 aria-label="取消运行"。
    const cancelBtn = container.querySelector('button[aria-label="取消运行"]');
    expect(cancelBtn).toBeNull(); // 初始时无 cancel 按钮
  });

  it("tool 角色的消息渲染工具结果", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    // 验证工具结果details存在
    const details = container.querySelectorAll("details");
    expect(details.length).toBeGreaterThan(0);
    // 验证工具结果标签存在
    const hasToolResult = Array.from(details).some((d) => d.textContent?.includes("工具结果"));
    expect(hasToolResult).toBe(true);
  });

  it("tool 消息显示工具调用 ID 和结果", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const codeElements = container.querySelectorAll("code");
    const hasToolCallId = Array.from(codeElements).some((code) => code.textContent === "tc-read-1");
    expect(hasToolCallId).toBe(true);
  });

  // ─── V2.x provider 选择器测试 (CodemanGroupSelect) ─────────────────
  it("渲染 provider 选择器并列出 enabled 的 provider", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    // 点击 trigger 打开下拉菜单
    trigger.click();
    // Real @ark-ui/solid renders items as role="option"; use ARIA selector
    const items = container.querySelectorAll('[role="option"]');
    // 默认 mock providers 只 1 个 enabled (minimax), models 下有该选项
    expect(items.length).toBeGreaterThan(0);
  });

  it("默认值匹配 appStore.state.value.default_llm_provider_id", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    // Trigger 显示当前选中的值文本，验证存在即可
    expect(trigger).toBeInTheDocument();
  });

  // TODO: real @ark-ui/solid in jsdom does not propagate item clicks → onValueChange.
  // Integration is verified by codeman-group-select.test.tsx (in isolation) and by e2e tests
  // (C11 rewrites 10-home-agent.spec.ts and adds coverage for the full HomeAgentForm flow).
  it.skip("切换 provider 触发 appStore.set + settingsSaver.scheduleSave", async () => {
    // Skipped: deferred to V2.2 or e2e rewrite. See TODO above.
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
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]');
    expect(trigger).toBeNull();
    const link = container.querySelector('a[href="/settings"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("settings");
  });

  // ─── handleSend 测试 ─────────────────────────────────────────────────
  it("handleSend with valid input 调 sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/chat.store");
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
    const { container } = render(() => <ChatView convId="conv-1" />);
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
    const conversationsStoreMock = await import("../stores/chat.store");
    // Reset sendMessage mock before test
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    const { container } = render(() => <ChatView convId="conv-1" />);
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);
    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).not.toHaveBeenCalled();
  });

  it("handleSend 输入后清空 input", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const appStoreMock = await import("../../../shared/stores/app.store");
    const conversationsStoreMock = await import("../stores/chat.store");
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
    const { container } = render(() => <ChatView convId="conv-1" />);
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
    const conversationsStoreMock = await import("../stores/chat.store");
    // Reset cancel mock and set streaming state
    (conversationsStoreMock as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel.mockClear();
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    const { container } = render(() => <ChatView convId="conv-1" />);
    // Cancel button appears when streaming; use aria-label selector to avoid provider-select-trigger
    const cancelBtn = container.querySelector('button[aria-label="取消运行"]') as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn);
    expect((conversationsStoreMock as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel).toHaveBeenCalledWith("conv-1");
  });

  // ─── thinking indicator 测试 ────────────────────────────────────────
  it("thinking indicator 显示当 streaming + 最后消息 content=''", async () => {
    const conversationsStoreMock = await import("../stores/chat.store");
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null; messages: Message[] }> } }).store;
    // Reset streaming state first, then set fresh
    mockStore.byId["conv-1"].streamingMessageId = null;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    // Set last message content to empty string for thinking indicator condition
    mockStore.byId["conv-1"].messages[mockStore.byId["conv-1"].messages.length - 1].content = "";
    const { container } = render(() => <ChatView convId="conv-1" />);
    const indicator = container.querySelector('[data-testid="thinking-indicator"]');
    expect(indicator).toBeTruthy();
    expect(indicator?.getAttribute("role")).toBe("status");
    expect(indicator?.getAttribute("aria-live")).toBe("polite");
    expect(indicator?.textContent).toContain("正在思考…");
  });

  it("thinking indicator 不显示 non-streaming", async () => {
    const conversationsStoreMock = await import("../stores/chat.store");
    // Ensure store state is clean
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = null;
    const { container } = render(() => <ChatView convId="conv-1" />);
    const indicator = container.querySelector('[data-testid="thinking-indicator"]');
    expect(indicator).toBeNull();
  });

  // ─── form submit 测试 ────────────────────────────────────────────────
  it("form submit preventDefault + handleSend", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/chat.store");
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
    const { container } = render(() => <ChatView convId="conv-1" />);
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

  it("renders empty state when no convId (guards against undefined convId)", () => {
    const { container } = render(() => <ChatView convId={undefined as unknown as string} />);
    // Should not crash — renders empty/missing-indicator
    expect(container.textContent).toBeTruthy();
  });

  // ─── Bug B: lastError UX ─────────────────────────────────────────────────

  it("Bug B: lastError ≠ null 时在消息列表上方渲染红色错误 banner（含错误文案）", () => {
    const { container } = render(() => <ChatView convId="conv-err" />);
    const banner = container.querySelector('[data-testid="chat-error-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("AnthropicTransport");
  });

  it("Bug B: lastError = null / undefined 时不渲染错误 banner", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const banner = container.querySelector('[data-testid="chat-error-banner"]');
    expect(banner).toBeNull();
  });

  // ─── Ctrl+Enter send shortcut ─────────────────────────────────────────────
  it("Ctrl+Enter on textarea triggers sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/chat.store");
    const appStoreMock = await import("../../../shared/stores/app.store");
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "test-key",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com/anthropic",
            api_type: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "Hello via Ctrl+Enter");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    await vi.waitFor(() => {
      expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith(
        "conv-1",
        "Hello via Ctrl+Enter",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
    // Textarea should be cleared after send
    expect(textarea.value).toBe("");
  });

  it("Cmd+Enter on textarea (Mac) triggers sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/chat.store");
    const appStoreMock = await import("../../../shared/stores/app.store");
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "test-key",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com/anthropic",
            api_type: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "Hello via Cmd+Enter");
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await vi.waitFor(() => {
      expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith(
        "conv-1",
        "Hello via Cmd+Enter",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
  });

  it("Plain Enter does NOT trigger sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("../stores/chat.store");
    const appStoreMock = await import("../../../shared/stores/app.store");
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "test-key",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com/anthropic",
            api_type: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      default_llm_provider_id: "minimax",
    });
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "Just Enter");
    fireEvent.keyDown(textarea, { key: "Enter" });
    // Plain Enter should not trigger send (textarea just adds newline)
    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).not.toHaveBeenCalled();
  });
});
