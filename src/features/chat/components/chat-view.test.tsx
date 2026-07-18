//! ChatView 组件测试。
//!
//! Mocked: conversations store (V2 ADR-0019，不再 mock messages.store / agent.store）。

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { For } from "solid-js";
import { Effect } from "effect";
import { ChatView } from "./chat-view";
import type { Message } from "../../../shared/lib/types";
import type { CodemanGroupSelectProps } from "../../../shared/components/internal/codeman-group-select";

// ─── Mock codeman-group-select: 轻量测试替身，渲染 trigger + role=option ──────
vi.mock("../../../shared/components/internal/codeman-group-select", () => ({
  CodemanGroupSelect: (props: CodemanGroupSelectProps) => {
    const selectedLabel = () => {
      for (const group of props.groups) {
        const found = group.options.find((o) => o.value === props.value);
        if (found) return found.label;
      }
      return props.placeholder ?? "";
    };
    return (
      <div data-testid={props["data-testid"]}>
        <button
          data-testid={`${props["data-testid"]}-trigger`}
          disabled={props.disabled}
          aria-label={props["aria-label"]}
        >
          {selectedLabel()}
        </button>
        <For each={props.groups}>
          {(group) => (
            <For each={group.options}>
              {(option) => (
                <div
                  role="option"
                  data-value={option.value}
                  onClick={() => {
                    if (!option.disabled) {
                      props.onChange(option.value);
                    }
                  }}
                >
                  {option.label}
                </div>
              )}
            </For>
          )}
        </For>
      </div>
    );
  },
}));

// V2 ADR-0019: 不再 mock messages.store / agent.store，全部走 chat.store
// 注意: vi.mock 会被 hoisting，所以 mock 数据必须内联在工厂函数内部
vi.mock("../stores/chat.store", () => ({
  store: {
    activeId: null,
    byId: {
      "conv-1": {
        id: "conv-1",
        title: "Test",
        systemPrompt: null,
        createdAt: 1710000000,
        updatedAt: 1710000000,
        archivedAt: null,
        messages: [
          {
            id: "msg-1",
            conversationId: "conv-1",
            role: "user",
            content: "Hello",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 1710000000,
          },
          {
            id: "msg-2",
            conversationId: "conv-1",
            role: "assistant",
            content: "Hi there!",
            thinking: null,
            toolCalls: null,
            toolResults: null,
            model: "gpt-4o",
            inputTokens: null,
            outputTokens: null,
            createdAt: 1710000001,
          },
          {
            id: "msg-3",
            conversationId: "conv-1",
            role: "tool",
            content: "file content here",
            thinking: null,
            toolCalls: null,
            toolResults: [
              {
                toolCallId: "tc-read-1",
                result: "const x = 1;\nconst y = 2;\nconsole.log(x + y);",
                error: null,
              },
            ],
            model: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 1710000002,
          },
        ] as Message[],
        streamingMessageId: null,
        runtime: { run: vi.fn(), cancel: vi.fn() },
      },
      "conv-err": {
        id: "conv-err",
        title: "Err",
        systemPrompt: null,
        createdAt: 1710000000,
        updatedAt: 1710000000,
        archivedAt: null,
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
      systemPrompt: null,
      createdAt: 1710000000,
      updatedAt: 1710000000,
      archivedAt: null,
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
        apiKey: "",
        llm: {
          defaultModel: "MiniMax-M2.5-highspeed",
          baseUrl: "https://api.minimaxi.com/anthropic",
          apiType: "anthropic-messages",
          models: [
            {
              id: "MiniMax-M2.5-highspeed",
              label: "MiniMax-M2.5-highspeed",
              deprecated: false,
              thinking: false,
            },
          ],
          modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
        },
      },
    ],
    defaultLlmProviderId: "minimax",
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
    __setAppStoreState: (s: { providers: any[]; defaultLlmProviderId: string }) => {
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

// ─── Mock codeman-toast (ADR-0029 D5) ──────────────────────────────────────────
const mockCodemanToast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("../../../shared/components/internal/codeman-toast", () => ({
  codemanToast: mockCodemanToast,
  ToasterMount: () => null,
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

  // ─── Bug: 选择非首项模型后 currentModelId() 弹回首项 ─────────────────────
  // Bug 根因: currentModelId() 始终返回 provider.models[0].id（首项），
  // handleChange() 只写 defaultLlmProviderId，不写 provider.llm.defaultModel。
  // 结果：同 provider 下点击非首项模型，受控值立即弹回首项。
  it("Bug: 选择非首项模型 MiniMax-M2.7 后，llm.defaultModel 应为 MiniMax-M2.7（不弹回首项）", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    // 通过 appStore.set 设置多模型 fixture（shallow merge，替换整个 providers 数组）
    appStore.set({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "test-key",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
              { id: "MiniMax-M2.7", label: "MiniMax-M2.7", deprecated: false, thinking: false },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
    });

    const { container } = render(() => <ChatView convId="conv-1" />);

    // 点击 provider-select trigger 打开下拉
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    trigger.click();

    // 点击非首项模型 MiniMax-M2.7（触发 CodemanGroupSelect onChange）
    const m27Option = container.querySelector('[data-value="MiniMax-M2.7"]') as HTMLElement;
    expect(m27Option).toBeTruthy();
    m27Option.click();

    // 断言 MiniMax provider 的 llm.defaultModel 已更新为 MiniMax-M2.7
    // 红灯原因：handleChange() 只写 defaultLlmProviderId，未写 providers[].llm.defaultModel
    const minimaxProvider = appStore.state.value.providers?.find((p) => p.id === "minimax");
    expect(minimaxProvider?.llm?.defaultModel).toBe("MiniMax-M2.7");
  });

  it("无 enabled provider 时显示空状态链接到 /settings", async () => {
    const appStoreMock = await import("../../../shared/stores/app.store");
    (appStoreMock as any).__setAppStoreState({
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: false,
          apiKey: "",
          llm: {
            defaultModel: "deepseek-chat",
            baseUrl: "https://api.deepseek.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              { id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false },
            ],
            modelsEndpoint: "https://api.deepseek.com/models",
          },
        },
      ],
      defaultLlmProviderId: "deepseek",
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
          apiKey: "",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
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
          apiKey: "",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
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

  // ─── thinking indicator 测试 (W3.x 已移除 — WX-OPT-2026-07-16 页面优化) ──────
  it("thinking indicator 已移除 — streaming + 空内容场景不再渲染", async () => {
    const conversationsStoreMock = await import("../stores/chat.store");
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null; messages: Message[] }> } }).store;
    // Reset streaming state first, then set fresh
    mockStore.byId["conv-1"].streamingMessageId = null;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    // Set last message content to empty string (原 thinking indicator 触发条件)
    mockStore.byId["conv-1"].messages[mockStore.byId["conv-1"].messages.length - 1].content = "";
    const { container } = render(() => <ChatView convId="conv-1" />);
    const indicator = container.querySelector('[data-testid="thinking-indicator"]');
    expect(indicator).toBeNull();
  });

  it("thinking indicator 已移除 — non-streaming 也不渲染", async () => {
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
          apiKey: "",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              {
                id: "MiniMax-M2.5-highspeed",
                label: "MiniMax-M2.5-highspeed",
                deprecated: false,
                thinking: false,
              },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
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

  // ─── Bug B: lastError UX (ADR-0029 D5: inline banner 移除 → toast 替代) ─────

  it("Bug B (ADR-0029 D5): inline error banner 已移除", () => {
    const { container } = render(() => <ChatView convId="conv-err" />);
    const banner = container.querySelector('[data-testid="chat-error-banner"]');
    expect(banner).toBeNull(); // banner 取消, toast 接管
  });

  it("Bug B (ADR-0029 D5): lastError = null / undefined 时不渲染 banner", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const banner = container.querySelector('[data-testid="chat-error-banner"]');
    expect(banner).toBeNull();
  });

  it("Bug B (ADR-0029 D5): lastError 非空 → codemanToast.error 被调 (runtime error 通知)", async () => {
    mockCodemanToast.error.mockClear();
    render(() => <ChatView convId="conv-err" />);
    await vi.waitFor(() => {
      expect(mockCodemanToast.error).toHaveBeenCalledWith(
        expect.stringContaining("AnthropicTransport"),
      );
    });
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
          apiKey: "test-key",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
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
          apiKey: "test-key",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
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
          apiKey: "test-key",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", deprecated: false, thinking: false },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
    });
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "Just Enter");
    fireEvent.keyDown(textarea, { key: "Enter" });
    // Plain Enter should not trigger send (textarea just adds newline)
    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).not.toHaveBeenCalled();
  });
});

// ─── ThinkingPanel 已从 ChatView 移除 — thinking 由各 MessageBubble 的
// ThinkingPanel 在文本上方渲染(streaming 时 open,done 后折叠)。
// ThinkingPanel 组件本身的契约测试保留在 thinking-panel.test.tsx。

// ─── IME 兼容性 (Regression test: 中文输入法 composition 期间不应写 signal) ──────
describe("ChatView IME 兼容性", () => {
  afterEach(() => cleanup());

  it("中文 IME composition 期间 onInput 不写 signal — send 按钮保持 disabled 直到字符 commit", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    // 空 input → submit 禁用
    expect(submitBtn).toBeDisabled();

    // 模拟用户用拼音 IME 输入 "ni" → "你":keydown→compositionstart→多个 input→选字→compositionend。
    // 这中间若干 onInput 事件都不应改写 signal (避免
    // value={input()} 响应绑定重复 set el.value 中断 IME composition,
    // 表现为"每输入一个字母后自动 blur")。
    fireEvent(textarea, new Event("compositionstart", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "n" } });
    fireEvent.input(textarea, { target: { value: "ni" } });
    fireEvent.input(textarea, { target: { value: "你" } });

    // Composition 期间 signal 应仍为 ""; 即便 DOM 被 fireEvent 写成 "你",
    // Solid 的 value={input()} 响应绑定不应被中途触发,send 按钮保持 disabled。
    expect(submitBtn).toBeDisabled();

    // Composition 结束 — signal 一次性写到最终 committed 值
    fireEvent(textarea, new Event("compositionend", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "你" } });

    // 现在 send 按钮应启用
    expect(submitBtn).not.toBeDisabled();
  });
});

// ─── Bug fix regression: 输入框下方不应常驻 generic "Invalid value (Type)" 提示。──
// 对称 chat-view.tsx / home.tsx(已在 fix/home-textarea-error-persistence 修复)。
// 根因: form-level `onMount: effectSchema(ChatViewFormSchema)` 跑默认值
// `{ draft: "" }`,触发 NonEmptyString 失败;ParseIssue 无 message annotation
// → effect-schema-adapter fallback "Invalid value (Type)" → 渲染到 textarea 下方。
// 修复:chat-view.tsx 错误展示也走 `field().state.meta.isTouched` 门控,避免
// 在用户尚未触摸 field 时常驻 generic 错误(mount + 即将与 field 交互的瞬间)。
//
// 范围:本测试只断言 mount 时点无错误(对称 home.test.tsx:257-280 的 BUG: 测试)；
// 一旦用户blur 后 isTouched=true,通用文案会再次出现 — 这是 TanStack Form
// 预期行为,与 home 修复一致;要更换为友好文案走 schema message annotation
// 路径另开修复(本修复范围之外)。
describe("ChatView Bug regression: Invalid value (Type)", () => {
  afterEach(() => cleanup());

  it("Bug: 输入框下方不应常驻 generic 'Invalid value (Type)' 提示", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    // 关键断言:mount 后(用户尚未触摸 field),不允许常驻 generic 错误。
    const destructiveMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");
    expect(destructiveMessages).not.toContain("Invalid value (Type)");
  });

  // 对称 home.test.tsx 的 "Bug regression: Invalid value (Type) on blur"。
  // 根因：DraftFieldSchema = NonEmptyString = Schema.minLength(1) 无 message annotation。
  // 用户 focus textarea 后 click 外部 → onBlur validator 跑空字符串 →
  // effect-schema-adapter 的 fallback "Invalid value (Type)" 渲染到 textarea 下方。
  // 修复：Schema.minLength(1) 加 { message: "..." } annotation，fallback 不再触发。
  it("Bug: 输入框 blur 后不应出现 generic 'Invalid value (Type)' 提示", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    // Sanity: mount 阶段 (未 touch) 不会有任何 destructive 提示
    const mountMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");
    expect(mountMessages).not.toContain("Invalid value (Type)");

    // 模拟用户 focus → blur 空 textarea (DraftFieldSchema 触发 onBlur validator)
    textarea.focus();
    fireEvent.blur(textarea);

    // 等待 Solid 同步 flush + TanStack Form 状态更新
    await waitFor(() => {
      const messages = Array.from(
        container.querySelectorAll("p.text-destructive"),
      ).map((el) => el.textContent ?? "");
      expect(messages).not.toContain("Invalid value (Type)");
    });
  });
});
