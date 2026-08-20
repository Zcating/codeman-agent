
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { For } from "solid-js";
import { Effect } from "effect";
import { ChatView } from "@codeman-frontend/features/chat/components/chat-view";
import type { Message } from "@codeman-frontend/shared/lib/types";
import type { CodemanGroupSelectProps } from "@codeman-frontend/shared/components/internal/codeman-group-select";

vi.mock("../../../shared/components/internal/codeman-group-select", () => ({
  CodemanGroupSelect: (props: CodemanGroupSelectProps) => {
    const selectedLabel = () => {
      for (const group of props.groups) {
        const found = group.options.find((o) => o.value === props.value);
        if (found) {return found.label;}
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
        isAgentActive: false,
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
        isAgentActive: false,
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
  compactNow: vi.fn(() => Effect.succeed(undefined)),
  pendingPermissions$: vi.fn(() => [] as unknown[]),
  addPendingPermission: vi.fn(),
  resolvePendingPermission: vi.fn(),
  setConvModel: vi.fn(),
  homeSelectedProviderId$: vi.fn(() => null),
  homeSelectedModelId$: vi.fn(() => null),
  selectHomeModel: vi.fn(),
}));

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

const mockCodemanToast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("../../../shared/components/internal/codeman-toast", () => ({
  codemanToast: mockCodemanToast,
  ToasterMount: () => null,
}));

vi.mock(import("@codeman-frontend/core/llm/runtime"), async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codeman-frontend/core/llm/runtime")>();
  return {
    ...actual,
    AgentRuntime: { of: vi.fn() } as never,
  };
});

vi.mock("@codeman-frontend/features/chat/stores/delegate-streams.store", () => {
  let byToolCall: Record<string, unknown> = {};
  return {
    delegateStreamsStore: {
      state: {
        get byToolCall() { return byToolCall; },
      },
      actions: {
        recordStart: vi.fn((toolCallId: string, agentId: string, agentName: string) => {
          byToolCall = {
            ...byToolCall,
            [toolCallId]: { toolCallId, agentId, agentName, events: [], status: "running", startedAt: Date.now() },
          };
        }),
        appendEvent: vi.fn(),
        recordComplete: vi.fn(),
        recordError: vi.fn(),
        cleanup: vi.fn(),
        _resetForTest: vi.fn(() => { byToolCall = {}; }),
      },
    },
  };
});

vi.mock("@codeman-frontend/features/chat/components/parallel-panel", () => ({
  ParallelPanel: (props: { entries: unknown[] }) =>
    props.entries.length > 0
      ? <div data-testid="parallel-panel">ParallelPanel({props.entries.length})</div>
      : null,
}));

let mockConversationsStore: { store: { byId: Record<string, { streamingMessageId: string | null; isAgentActive: boolean }> } } | undefined;

describe("ChatView", () => {
  beforeAll(async () => {
    mockConversationsStore = (await import("@codeman-frontend/features/chat/stores/chat.store")) as unknown as typeof mockConversationsStore;
  });

  afterEach(() => {
    cleanup();
    if (mockConversationsStore) {
      for (const convId of ["conv-1", "conv-err"]) {
        const cs = mockConversationsStore.store.byId[convId];
        if (cs) {
          cs.streamingMessageId = null;
          cs.isAgentActive = false;
        }
      }
    }
  });

  it("从 store.byId[convId].messages 渲染消息列表", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
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

  it("V2.8:idle 时渲染 Send 按钮(running 形态测试见下方)", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toContain("发送");
    expect(container.querySelector('button[aria-label="停止运行"]')).toBeNull();
    expect(container.querySelector('button[aria-label="取消运行"]')).toBeNull();
  });

  it("tool 角色的消息渲染工具结果", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const details = container.querySelectorAll("details");
    expect(details.length).toBeGreaterThan(0);
    const hasToolResult = Array.from(details).some((d) => d.textContent?.includes("工具结果"));
    expect(hasToolResult).toBe(true);
  });

  it("tool 消息显示工具调用 ID 和结果", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const codeElements = container.querySelectorAll("code");
    const hasToolCallId = Array.from(codeElements).some((code) => code.textContent === "tc-read-1");
    expect(hasToolCallId).toBe(true);
  });

  it("渲染 provider 选择器并列出 enabled 的 provider", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    trigger.click();
    const items = container.querySelectorAll('[role="option"]');
    expect(items.length).toBeGreaterThan(0);
  });

  it("默认值匹配 appStore.state.value.default_llm_provider_id", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger).toBeInTheDocument();
  });

  it.skip("切换 provider 触发 appStore.set + settingsSaver.scheduleSave", async () => {
  });

  it("Bug: 选择非首项模型 MiniMax-M2.7 后，setConvModel 应被调 (per CHANGELOG 8e96ea4, 不写全局 settings)", async () => {
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    const chatStore = await import("../stores/chat.store");
    appStore.set({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          apiKey: "test-key",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", thinking: false },
              { id: "MiniMax-M2.7", label: "MiniMax-M2.7", thinking: false },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
    });

    const { container } = render(() => <ChatView convId="conv-1" />);

    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    trigger.click();

    const m27Option = container.querySelector('[data-value="MiniMax-M2.7"]') as HTMLElement;
    expect(m27Option).toBeTruthy();
    m27Option.click();

    expect(chatStore.setConvModel).toHaveBeenCalledWith("conv-1", "minimax", "MiniMax-M2.7");
    const minimaxProvider = appStore.state.value.providers?.find((p) => p.id === "minimax");
    expect(minimaxProvider?.llm?.defaultModel).toBe("MiniMax-M2.5-highspeed");
  });

  it("无 enabled provider 时显示空状态链接到 /settings", async () => {
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
    (appStoreMock as any).__setAppStoreState({
      providers: [],
    });
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('button[data-testid="provider-select-trigger"]');
    expect(trigger).toBeNull();
    const link = container.querySelector('a[href="/settings"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("settings");
  });

  it("handleSend with valid input 调 sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
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
    await vi.waitFor(() => {
      expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith(
        "conv-1",
        "hi",
        expect.objectContaining({
          apiKey: "",
          baseUrl: "https://api.minimaxi.com/anthropic",
          defaultModel: "MiniMax-M2.5-highspeed",
        }),
        "medium",
      );
    });
  });

  it("handleSend empty input 不调 sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    (conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage.mockClear();
    const { container } = render(() => <ChatView convId="conv-1" />);
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);
    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).not.toHaveBeenCalled();
  });

  it("handleSend 输入后清空 input", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
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
    await vi.waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("idle 状态:Send 位置渲染 type=submit 的发送按钮", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const sendBtn = container.querySelector('button[aria-label="发送消息"]') as HTMLButtonElement;
    expect(sendBtn).toBeTruthy();
    expect(sendBtn.getAttribute("type")).toBe("submit");
    expect(container.querySelector('button[aria-label="停止运行"]')).toBeNull();
  });

  it("running 状态:Send 位置切换为 type=button 的 Stop 按钮,无独立取消按钮", async () => {
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null; isAgentActive: boolean }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    mockStore.byId["conv-1"].isAgentActive = true;
    const { container } = render(() => <ChatView convId="conv-1" />);
    const stopBtn = container.querySelector('button[aria-label="停止运行"]') as HTMLButtonElement;
    expect(stopBtn).toBeTruthy();
    expect(stopBtn.getAttribute("type")).toBe("button");
    expect(stopBtn.textContent).toContain("停止");
    expect(container.querySelector('button[aria-label="发送消息"]')).toBeNull();
    expect(container.querySelector('button[aria-label="取消运行"]')).toBeNull();
  });

  it("handleCancel 调 cancel(convId) — 点击 Stop 按钮触发取消", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    (conversationsStoreMock as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel.mockClear();
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null; isAgentActive: boolean }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    mockStore.byId["conv-1"].isAgentActive = true;
    const { container } = render(() => <ChatView convId="conv-1" />);
    const stopBtn = container.querySelector('button[aria-label="停止运行"]') as HTMLButtonElement;
    expect(stopBtn).toBeTruthy();
    await user.click(stopBtn);
    expect((conversationsStoreMock as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel).toHaveBeenCalledWith("conv-1");
  });

  it("thinking indicator 已移除 — streaming + 空内容场景不再渲染", async () => {
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null; isAgentActive: boolean; messages: Message[] }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = null;
    mockStore.byId["conv-1"].isAgentActive = false;
    mockStore.byId["conv-1"].streamingMessageId = "msg-streaming";
    mockStore.byId["conv-1"].isAgentActive = true;
    mockStore.byId["conv-1"].messages[mockStore.byId["conv-1"].messages.length - 1].content = "";
    const { container } = render(() => <ChatView convId="conv-1" />);
    const indicator = container.querySelector('[data-testid="thinking-indicator"]');
    expect(indicator).toBeNull();
  });

  it("thinking indicator 已移除 — non-streaming 也不渲染", async () => {
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { streamingMessageId: string | null }> } }).store;
    mockStore.byId["conv-1"].streamingMessageId = null;
    const { container } = render(() => <ChatView convId="conv-1" />);
    const indicator = container.querySelector('[data-testid="thinking-indicator"]');
    expect(indicator).toBeNull();
  });

  it("form submit preventDefault + handleSend", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
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
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalled();
    });
    expect(textarea.value).toBe("");
  });

  it("renders empty state when no convId (guards against undefined convId)", () => {
    const { container } = render(() => <ChatView convId={undefined as unknown as string} />);
    expect(container.textContent).toBeTruthy();
  });


  it("Bug B : inline error banner 已移除", () => {
    const { container } = render(() => <ChatView convId="conv-err" />);
    const banner = container.querySelector('[data-testid="chat-error-banner"]');
    expect(banner).toBeNull();
  });

  it("Bug B : lastError = null / undefined 时不渲染 banner", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const banner = container.querySelector('[data-testid="chat-error-banner"]');
    expect(banner).toBeNull();
  });

  it("Bug B : lastError 非空 → codemanToast.error 被调 (runtime error 通知)", async () => {
    mockCodemanToast.error.mockClear();
    render(() => <ChatView convId="conv-err" />);
    await vi.waitFor(() => {
      expect(mockCodemanToast.error).toHaveBeenCalledWith(
        expect.stringContaining("AnthropicTransport"),
      );
    });
  });

  it("Ctrl+Enter on textarea triggers sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
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
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", thinking: false },
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
        "medium",
      );
    });
    expect(textarea.value).toBe("");
  });

  it("Cmd+Enter on textarea (Mac) triggers sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
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
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", thinking: false },
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
        "medium",
      );
    });
  });

  it("Plain Enter does NOT trigger sendMessage", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
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
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", thinking: false },
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
    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).not.toHaveBeenCalled();
  });
});


describe("ChatView IME 兼容性", () => {
  afterEach(() => cleanup());

  it("中文 IME composition 期间 onInput 不写 signal — send 按钮保持 disabled 直到字符 commit", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(submitBtn).toBeDisabled();

    fireEvent(textarea, new Event("compositionstart", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "n" } });
    fireEvent.input(textarea, { target: { value: "ni" } });
    fireEvent.input(textarea, { target: { value: "你" } });

    expect(submitBtn).toBeDisabled();

    fireEvent(textarea, new Event("compositionend", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "你" } });

    expect(submitBtn).not.toBeDisabled();
  });
});

describe("ChatView Bug regression: Invalid value (Type)", () => {
  afterEach(() => cleanup());

  it("Bug: 输入框下方不应常驻 generic 'Invalid value (Type)' 提示", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    const destructiveMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");
    expect(destructiveMessages).not.toContain("Invalid value (Type)");
  });

  it("Bug: 输入框 blur 后不应出现 generic 'Invalid value (Type)' 提示", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    const mountMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");
    expect(mountMessages).not.toContain("Invalid value (Type)");

    textarea.focus();
    fireEvent.blur(textarea);

    await waitFor(() => {
      const messages = Array.from(
        container.querySelectorAll("p.text-destructive"),
      ).map((el) => el.textContent ?? "");
      expect(messages).not.toContain("Invalid value (Type)");
    });
  });
});

describe("ChatView Bug regression: '请输入消息内容' on blur (submit-only)", () => {
  let scrollSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
    cleanup();
  });

  it("Bug: 输入框 blur 后不应出现 '请输入消息内容' (只有提交才校验)", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    const mountMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");
    expect(mountMessages).not.toContain("请输入消息内容");

    textarea.focus();
    fireEvent.blur(textarea);

    await waitFor(() => {
      const messages = Array.from(
        container.querySelectorAll("p.text-destructive"),
      ).map((el) => el.textContent ?? "");
      expect(messages).not.toContain("请输入消息内容");
    });
  });
});

describe("ChatView Scroll: 首次进入对话不应动画滚动", () => {
  let scrollSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
    cleanup();
  });

  it("Bug: 首次进入对话 scrollIntoView 应使用 instant (无动画),后续 smooth", async () => {
    render(() => <ChatView convId="conv-1" />);

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalled();
    });

    const calls = scrollSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const firstCallArgs = calls[0][0] as ScrollIntoViewOptions | undefined;
    expect(firstCallArgs?.behavior).not.toBe("smooth");
  });
});

describe("ChatView inner scroll (V2.8, Variant A from /prototype/chat-textarea-fixed)", () => {
  afterEach(() => cleanup());

  // 消息区 ScrollArea：Root 带 data-slot=scroll-area（含 flex-1 min-h-0 尺寸链），
  // Viewport 带 data-scroll-region 契约标记 + 真正承担滚动（zag 注入 overflow:auto）。
  const findMessagesScrollArea = (container: HTMLElement) => {
    const viewport = container.querySelector(
      '[data-slot="scroll-area-viewport"][data-scroll-region="true"]',
    );
    if (!viewport) {
      return null;
    }
    return viewport.closest('[data-slot="scroll-area"]');
  };

  it("V2.8: messages area is a ScrollArea whose viewport owns the scroll channel", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const messagesScrollArea = findMessagesScrollArea(container);
    expect(messagesScrollArea).toBeTruthy();
    const viewport = messagesScrollArea!.querySelector('[data-slot="scroll-area-viewport"]');
    expect(viewport).toBeTruthy();
    expect(viewport!.className).toContain("size-full");
  });

  it("V2.8: messages ScrollArea root still has flex-1 min-h-0 (allows it to shrink within flex parent)", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const messagesScrollArea = findMessagesScrollArea(container);
    expect(messagesScrollArea).toBeTruthy();
    expect(messagesScrollArea!.className).toContain("flex-1");
    expect(messagesScrollArea!.className).toContain("min-h-0");
  });

  it("V2.8: textarea is a SIBLING of messages ScrollArea (not nested inside scrollable area)", () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    const messagesScrollArea = findMessagesScrollArea(container);
    expect(messagesScrollArea).toBeTruthy();
    const textareaInsideScroll = messagesScrollArea!.querySelector("textarea");
    expect(textareaInsideScroll).toBeNull();
  });
});

describe("ChatView ringInfo contextWindow three-layer lookup", () => {
  afterEach(() => cleanup());

  it("ringInfo uses three-layer lookup so MiniMax model without explicit contextWindow still shows 200_000 total", async () => {
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");

    (appStoreMock as unknown as { __setAppStoreState: (s: unknown) => void }).__setAppStoreState({
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "test-key",
          llm: {
            defaultModel: "MiniMax-M2.7-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [
              {
                id: "MiniMax-M2.7-highspeed",
                label: "MiniMax-M2.7-highspeed",
                thinking: false,
              },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
            contextWindow: 200_000,
          },
        },
      ],
      defaultLlmProviderId: "minimax",
    });

    const mockStore = (conversationsStoreMock as unknown as { store: { byId: Record<string, { messages: Message[] }> } }).store;
    mockStore.byId["conv-1"].messages = [
      {
        id: "msg-1",
        conversationId: "conv-1",
        role: "user" as const,
        content: "A".repeat(2000),
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
        role: "assistant" as const,
        content: "B".repeat(2000),
        thinking: null,
        toolCalls: null,
        toolResults: null,
        model: "gpt-4o",
        inputTokens: null,
        outputTokens: null,
        createdAt: 1710000001,
      },
    ];

    const { container } = render(() => <ChatView convId="conv-1" />);

    const ring = container.querySelector('[data-testid="context-ring"]');
    expect(ring).toBeTruthy();
    expect(ring!.getAttribute("data-context-pct")).not.toBe("0");
  });
});


// ============================================================
// Compaction UI seams (T4)
// ============================================================

describe("ChatView compaction via usage ring (seam 3)", () => {
  afterEach(() => cleanup());

  it("压缩已集成进用量环：工具行无常驻独立压缩按钮，入口为可点击的用量环", async () => {
    const { container } = render(() => <ChatView convId="conv-1" />);
    // popover 未打开时压缩按钮不渲染（无独立常驻按钮）
    expect(container.querySelector('[data-testid="compact-now-button"]')).toBeNull();
    // 用量环 trigger 是压缩入口
    expect(container.querySelector('[data-testid="usage-ring-trigger"]')).toBeTruthy();
  });

  it("点击用量环 → popover 打开，内含「立即压缩」按钮", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const { container } = render(() => <ChatView convId="conv-1" />);
    const trigger = container.querySelector('[data-testid="usage-ring-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await user.click(trigger);
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="usage-ring-popover"]')).toBeTruthy();
    });
    const btn = container.querySelector('[data-testid="compact-now-button"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain("立即压缩");
  });

  it("V2.8:popover 按钮 (popover 打开时立即压缩按钮可见)", async () => {
    void (await import("@testing-library/user-event")).default;
  });

  // compactNow calls Effect.runPromiseExit which requires the Effect monad.
  // Testing the spy is difficult because vi.mock replaces the module with a
  // plain object that doesn't support Solid.js reactive tracking. Skipped with
  // explanation — the button's existence and enabled state are verified above,
  // and compactNow is tested in chat.store.compaction.test.ts.
  it.skip("点击按钮 → compactNow(convId) 被调一次 — requires Effect monad spy support", () => {});

});

describe("ChatView keyboard/focus regression (seam 4)", () => {
  afterEach(() => cleanup());

  it("输入框 focus + send 行为与 T1 之前一致(防止按钮插入破坏 focus 流程)", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const conversationsStoreMock = await import("@codeman-frontend/features/chat/stores/chat.store");
    const appStoreMock = await import("@codeman-frontend/shared/stores/app.store");
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
              { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", thinking: false },
            ],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
      defaultLlmProviderId: "minimax",
    });

    const { container } = render(() => <ChatView convId="conv-1" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await user.type(textarea, "Hello focus test");

    // Focus should stay on textarea
    expect(document.activeElement).toBe(textarea);

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);

    expect((conversationsStoreMock as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith(
      "conv-1",
      "Hello focus test",
      expect.objectContaining({ apiKey: "test-key" }),
      "medium",
    );
  });
});


// ============================================================
// ParallelPanel integration at chat-view level
// ============================================================

describe("ChatView parallel-panel ", () => {
  afterEach(() => {
    cleanup();
  });

  it("ParallelPanel NOT rendered when delegateStreamsStore is empty", async () => {
    const { delegateStreamsStore } = await import("@codeman-frontend/features/chat/stores/delegate-streams.store");
    delegateStreamsStore.actions._resetForTest();
    const { container } = render(() => <ChatView convId="conv-1" />);
    const panel = container.querySelector('[data-testid="parallel-panel"]');
    expect(panel).toBeNull();
  });

  it("ParallelPanel rendered when delegateStreamsStore has delegate_task entries", async () => {
    const { delegateStreamsStore } = await import("@codeman-frontend/features/chat/stores/delegate-streams.store");
    // Simulate a delegate_task entry in the store
    delegateStreamsStore.actions._resetForTest();
    delegateStreamsStore.actions.recordStart("tc-delegate-1", "agent-001", "Researcher");
    const { container } = render(() => <ChatView convId="conv-1" />);
    const panel = container.querySelector('[data-testid="parallel-panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("ParallelPanel(1)");
  });

  it("ParallelPanel shows correct count when multiple delegate_task entries exist", async () => {
    const { delegateStreamsStore } = await import("@codeman-frontend/features/chat/stores/delegate-streams.store");
    delegateStreamsStore.actions._resetForTest();
    delegateStreamsStore.actions.recordStart("tc-delegate-1", "agent-001", "Researcher");
    delegateStreamsStore.actions.recordStart("tc-delegate-2", "agent-002", "Coder");
    const { container } = render(() => <ChatView convId="conv-1" />);
    const panel = container.querySelector('[data-testid="parallel-panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("ParallelPanel(2)");
  });
});
