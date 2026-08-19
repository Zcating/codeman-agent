import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Effect } from "effect";
import { HomeAgentForm } from "@codeman-frontend/features/chat/components/home";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import { createConversation, sendMessage, addWorkspace as addWorkspaceFromStore } from "@codeman-frontend/features/chat/stores/chat.store";


const mockCodemanToast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("../../../shared/components/internal/codeman-toast", () => ({
  codemanToast: mockCodemanToast,
  ToasterMount: () => null,
}));

let mockIsOpen = false;
let sharedOnValueChanges: ((details: { value: string[] }) => void)[] = [];

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual("@ark-ui/solid");
  return {
    ...actual,
    Select: {
      Root: (props: any) => {
        if (props.onValueChange) {sharedOnValueChanges.push(props.onValueChange);}
        return <>{props.children}</>;
      },
      Control: (props: any) => <>{props.children}</>,
      Trigger: (props: any) => (
        <button
          {...(props["data-testid"] ? { "data-testid": props["data-testid"] } : {})}
          data-state={mockIsOpen ? "open" : "closed"}
          disabled={props.disabled}
          onClick={() => { mockIsOpen = !mockIsOpen; }}
          aria-label={props["aria-label"]}
        >
          {props.children}
        </button>
      ),
      ValueText: (props: any) => <span>{props.placeholder || props.children}</span>,
      Indicator: (props: any) => <span>{props.children}</span>,
      Positioner: (props: any) => <div data-part="positioner" style={{ display: mockIsOpen ? "block" : "none" }}>{props.children}</div>,
      Content: (props: any) => (
        <div
          data-testid={props["data-testid"]}
          data-part="content"
          data-state={mockIsOpen ? "open" : "closed"}
        >
          {props.children}
        </div>
      ),
      List: (props: any) => <ul>{props.children}</ul>,
      Item: (props: any) => {
        const itemValue = props.item?.value ?? props.value;
        return (
          <li
            data-value={itemValue}
            onClick={() => {
              if (!props.item?.disabled) {
                for (const handler of sharedOnValueChanges) {
                  handler({ value: [itemValue] });
                }
                mockIsOpen = false;
              }
            }}
          >
            {props.children}
          </li>
        );
      },
      ItemText: (props: any) => <span>{props.children}</span>,
      ItemIndicator: (props: any) => <span>{props.children}</span>,
      ItemGroup: (props: any) => <div role="group">{props.children}</div>,
      ItemGroupLabel: (props: any) => <span>{props.children}</span>,
    },
    createListCollection: vi.fn(({ items }: { items: any[] }) => ({
      items,
      filteredItems: items,
      getItemValue: (item: any) => item.value,
      getItemDisabled: (item: any) => item.disabled ?? false,
      stringifyItem: (item: any) => item.label,
    })),
    useSelectContext: vi.fn(() => () => ({
      setOpen: (open: boolean) => { mockIsOpen = open; }
    })),
  };
});


vi.mock("@tanstack/solid-router", () => ({
  useNavigate: vi.fn(() => (_opts: { to: string }) => undefined),
}));


vi.mock("../../settings/lib/settings-saver", () => ({
  settingsSaver: {
    scheduleSave: vi.fn(),
    cancelPending: vi.fn(),
    flushNow: vi.fn(),
  },
}));


const mockDefaultLlmProvider = vi.hoisted(() => ({ id: "minimax" }));

vi.mock("../../../shared/stores/app.store", () => ({
  appStore: {
    state: {
      value: {
        workspaces: [] as Array<{ id: string; label: string; rootPath: string; enabled: boolean }>,
        get defaultLlmProviderId() { return mockDefaultLlmProvider.id; },
        providers: [
      {
        id: "minimax",
        label: "MiniMax",
        apiKey: "test-key",
        llm: {
          defaultModel: "MiniMax-M2.5-highspeed",
              baseUrl: "https://api.minimaxi.com/anthropic",
              apiType: "anthropic-messages" as const,
              modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
              models: [
                { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", contextWindow: 200000, thinking: false },
              ],
            },
          },
        ],
        systemPrompt: { default: "You are a helpful assistant." },
      },
    },
    setLastUsedWorkspaceId: vi.fn(),
    selectedWorkspaceId: vi.fn<() => string | null>(),
    set: vi.fn(),
    pickWorkspacePath: vi.fn(() => Effect.succeed<string | null>(null)),
    addWorkspace: vi.fn((rootPath: string) => ({ id: "mock-id", label: rootPath, rootPath: rootPath, enabled: true })),
  },
}));

const mockWorkspaces: { current: Array<{ id: string; label: string; rootPath: string }> } = vi.hoisted(() => ({ current: [] }));
const mockSelectedWsId: { current: string | null } = vi.hoisted(() => ({ current: null }));

vi.mock("../stores/chat.store", () => {
  return {
    workspaces$: vi.fn(() => mockWorkspaces.current),
    selectedWorkspaceId$: vi.fn(() => mockSelectedWsId.current),
    setSelectedWorkspaceId: vi.fn((id: string) => { mockSelectedWsId.current = id; }),
    addWorkspace: vi.fn(() => Effect.succeed({ id: "new-id", label: "New Workspace", rootPath: "/new/path", createdAt: Date.now() })),
    store: { byId: {} },
    activeId$: vi.fn<() => string | null>(),
    conversations$: vi.fn<() => never[]>(),
    selectConversation: vi.fn<(id: string) => void>(),
    sendMessage: vi.fn<(id: string, content: string, provider: ProviderConfig) => Effect.Effect<void, never, never>>(() => Effect.succeed(undefined)),
    createConversation: vi.fn<(workspaceId: string, title: string, systemPrompt?: string) => Effect.Effect<string, { _tag: "SomeError" }, never>>(() => Effect.succeed("new-conv-id")),
    deleteConversation: vi.fn(),
    archiveConversation: vi.fn(),
    setupConvState: vi.fn(),
    cancel: vi.fn(),
    loadConversations: vi.fn(),
    clearActiveConversation: vi.fn(),
    homeSelectedProviderId$: vi.fn<() => string | null>(() => null),
    homeSelectedModelId$: vi.fn<() => string | null>(() => null),
    selectHomeModel: vi.fn(),
    setConvModel: vi.fn(),
  };
});


describe("HomeAgentForm — workspace pre-selection logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.current = [];
    mockSelectedWsId.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.1.1: 0 workspaces → Select trigger renders, input permanently disabled", async () => {
    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Add a workspace to start");

    expect(getByTestId("workspace-select-trigger")).toBeTruthy();
  });

  it("T4.1.1b: 0 workspaces → Select trigger click opens dropdown with Add workspace action", async () => {
    const { getByTestId } = render(() => <HomeAgentForm />);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    expect(getByTestId("workspace-select-add-btn")).toBeTruthy();
  });

  it("T4.1.1c: 0 workspaces → Action slot click triggers addWorkspace", async () => {
    const { getByTestId } = render(() => <HomeAgentForm />);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    expect(addWorkspaceFromStore).toHaveBeenCalledTimes(1);
  });

  it("T4.1.2: 1 workspace → input immediately enabled (draftWorkspaceId auto-set)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe("发条消息…");
  });

  it("T4.1.3: 2+ workspaces → input disabled until user picks", async () => {
    mockWorkspaces.current.push(
      { id: "ws-1", label: "Project A", rootPath: "C:\\a" },
      { id: "ws-2", label: "Project B", rootPath: "C:\\b" },
    );

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Select a workspace above");
  });

  it("Bug: 输入框下方不应常驻 generic 'Invalid value (Type)' 提示", async () => {
    mockWorkspaces.current.push(
      { id: "ws-1", label: "Project A", rootPath: "C:\\a" },
      { id: "ws-2", label: "Project B", rootPath: "C:\\b" },
    );
    mockSelectedWsId.current = null;

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector(
      "[data-testid='codex-input']",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.disabled).toBe(true);

    const destructiveMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");

    expect(destructiveMessages).not.toContain("Invalid value (Type)");
  });

  it("T4.1.4: 2+ workspaces → no pre-select; clicking workspace Select option enables input + calls setSelectedWorkspaceId", async () => {
    mockWorkspaces.current.push(
      { id: "ws-1", label: "Project A", rootPath: "C:\\a" },
      { id: "ws-2", label: "Project B", rootPath: "C:\\b" },
    );

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    const firstOption = document.querySelector('li[data-value="ws-1"]') as HTMLElement;
    expect(firstOption).toBeTruthy();
    fireEvent.click(firstOption);

    expect(mockSelectedWsId.current).toBe("ws-1");
  });

  it("T4.1.5: Send button disabled when input is empty", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "My Project", rootPath: "C:\\projects\\my-project" });
    mockSelectedWsId.current = "ws-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const sendButton = getByTestId("codex-send") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hi" } });

    expect(sendButton.disabled).toBe(false);
  });

  it("Bug: 1 个 workspace 自动选中时,textarea 填字后 Send 立即可点击 (canSubmit=true)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Sole Project", rootPath: "C:\\sole" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe("发条消息…");

    fireEvent.input(textarea, { target: { value: "Hello there" } });

    const sendButton = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(false);
  });

  it("T4.1.6: send button click triggers createConversation then sendMessage", async () => {
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    mockWorkspaces.current.push({ id: "ws-1", label: "Frontend", rootPath: "/p" });
    mockSelectedWsId.current = "ws-1";
    mockDefaultLlmProvider.id = "minimax";
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        apiKey: "test-key",
        llm: {
          defaultModel: "m",
          baseUrl: "https://api",
          apiType: "anthropic-messages",
          models: [],
          modelsEndpoint: "",
        },
      },
    ];
    appStore.state.value.systemPrompt = { default: "system msg here", userCanEdit: true };

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello world" } });

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(createConversation).toHaveBeenCalledWith("ws-1", "Hello world");
    });
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "new-conv-id",
        "Hello world",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
  });

  it("T4.1.7: send with empty input does not call createConversation or sendMessage", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Frontend", rootPath: "/p" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn);
    expect(createConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("T4.1.8: send with no workspace selected (2+ workspaces) does not call createConversation or sendMessage", async () => {
    mockWorkspaces.current.push(
      { id: "ws-1", label: "A", rootPath: "/a" },
      { id: "ws-2", label: "B", rootPath: "/b" },
    );

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn);
    expect(createConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("T4.1.9: workspace Select renders all workspaces as options", async () => {
    mockWorkspaces.current.push(
      { id: "ws-1", label: "Alpha", rootPath: "/a" },
      { id: "ws-2", label: "Beta", rootPath: "/b" },
    );

    const { getByTestId } = render(() => <HomeAgentForm />);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    const options = document.querySelectorAll('li[data-value]');
    const labels = Array.from(options).map((o) => o.textContent?.trim());

    expect(labels).toContain("Alpha");
    expect(labels).toContain("Beta");
    expect(options.length).toBe(2);

    expect(document.querySelector("[data-testid='workspace-select-add-btn']")).toBeTruthy();
  });

  it("ADR-0029 D5: createConversation 失败 → codemanToast.error 被调 (替代 silent return)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Frontend", rootPath: "/p" });
    mockSelectedWsId.current = "ws-1";

    vi.mocked(createConversation).mockReturnValueOnce(
      Effect.fail({ _tag: "Database", message: "DB connection lost" }) as any,
    );

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "hello" } });

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockCodemanToast.error).toHaveBeenCalledTimes(1);
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});


describe("HomeAgentForm — new layout + Action slot + LLM picker (T4.2)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.current.length = 0;
    mockSelectedWsId.current = "ws-1";
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        apiKey: "test-key",
        llm: {
          defaultModel: "MiniMax-M2.5-highspeed",
          baseUrl: "https://api.minimaxi.com/anthropic",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", contextWindow: 200000, thinking: false },
          ],
        },
      },
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.2.1: 新布局 — workspace picker 上移到 textarea 之上 (per CHANGELOG 6333b8c)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textareaEl = container.querySelector("[data-testid='codex-input']");
    const workspaceTrigger = container.querySelector("[data-testid='workspace-select-trigger']");

    expect(textareaEl).toBeTruthy();
    expect(workspaceTrigger).toBeTruthy();

    const allChildren = Array.from(container.querySelectorAll("[data-testid]"));
    const textareaIdx = allChildren.findIndex(el => el.getAttribute("data-testid") === "codex-input");
    const wsIdx = allChildren.findIndex(el => el.getAttribute("data-testid") === "workspace-select-trigger");
    expect(wsIdx).toBeLessThan(textareaIdx);
  });

  it("T4.2.2: workspace picker 200px 固定宽度", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const workspaceTrigger = container.querySelector("[data-testid='workspace-select-trigger']");
    expect(workspaceTrigger).toBeTruthy();

    let el: Element | null = workspaceTrigger;
    while (el && el !== container) {
      const className = el.className || "";
      if (className.includes && className.includes("w-[200px]")) {
        break;
      }
      el = el.parentElement;
    }
    expect(el).toBeTruthy();
    expect(el?.className).toContain("w-[200px]");
  });

  it("T4.2.3: LLM picker 200px 固定宽度", async () => {
    const { container } = render(() => <HomeAgentForm />);

    const llmPickerTrigger = container.querySelector("[data-testid='llm-picker-trigger']");
    expect(llmPickerTrigger).toBeTruthy();

    let el: Element | null = llmPickerTrigger;
    while (el && el !== container) {
      const className = el.className || "";
      if (className.includes && className.includes("w-[200px]")) {
        break;
      }
      el = el.parentElement;
    }
    expect(el).toBeTruthy();
    expect(el?.className).toContain("w-[200px]");
  });

  it("T4.2.4: Action slot onClick 调 addWorkspace (chat.store)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { getByTestId } = render(() => <HomeAgentForm />);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    expect(addWorkspaceFromStore).toHaveBeenCalledTimes(1);
  });

  it("T4.2.5: Picker 返回 path → addWorkspace adds + sets draftWorkspaceId + textarea enabled", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    vi.mocked(addWorkspaceFromStore).mockImplementation(() => {
      mockSelectedWsId.current = "new-id";
      return Effect.succeed({ id: "new-id", label: "New Workspace", rootPath: "/new/path", createdAt: Date.now() });
    });

    const { getByTestId } = render(() => <HomeAgentForm />);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(addWorkspaceFromStore).toHaveBeenCalled();
    });

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  it("T4.2.6: addWorkspace 返回 null 时 textarea 保持 disabled", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    vi.mocked(addWorkspaceFromStore).mockReturnValueOnce(Effect.succeed(null as unknown as any));

    const { getByTestId } = render(() => <HomeAgentForm />);

    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    expect(addWorkspaceFromStore).toHaveBeenCalledTimes(1);
  });

  it("T4.2.7: LLM picker 显示 enabled providers 的所有 models", async () => {
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    appStore.state.value.providers = [
      {
        id: "provider-1",
        label: "Provider One",
        apiKey: "key1",
        llm: {
          defaultModel: "model-1",
          baseUrl: "https://api.one.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.one.com/models",
          models: [
            { id: "model-1", label: "Model One", contextWindow: 100000, thinking: false },
          ],
        },
      },
      {
        id: "provider-2",
        label: "Provider Two",
        apiKey: "key2",
        llm: {
          defaultModel: "model-2",
          baseUrl: "https://api.two.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.two.com/models",
          models: [
            { id: "model-2", label: "Model Two", contextWindow: 200000, thinking: false },
          ],
        },
      },
    ];
    mockDefaultLlmProvider.id = "provider-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    const llmContent = document.querySelector('[data-testid="llm-picker-content"]');
    expect(llmContent).toBeTruthy();
    const options = llmContent!.querySelectorAll('li[data-value]');
    expect(options.length).toBe(2);
  });

  it("T4.2.8: LLM picker 选中 → selectHomeModel (per CHANGELOG 8e96ea4)", async () => {
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    const chatStore = await import("../stores/chat.store");
    appStore.state.value.providers = [
      {
        id: "provider-1",
        label: "Provider One",
        apiKey: "key1",
        llm: {
          defaultModel: "model-1",
          baseUrl: "https://api.one.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.one.com/models",
          models: [
            { id: "model-1", label: "Model One", contextWindow: 100000, thinking: false },
          ],
        },
      },
      {
        id: "provider-2",
        label: "Provider Two",
        apiKey: "key2",
        llm: {
          defaultModel: "model-2",
          baseUrl: "https://api.two.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.two.com/models",
          models: [
            { id: "model-2", label: "Model Two", contextWindow: 200000, thinking: false },
          ],
        },
      },
    ];
    mockDefaultLlmProvider.id = "provider-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    const model2Option = document.querySelector('li[data-value="model-2"]') as HTMLElement;
    expect(model2Option).toBeTruthy();
    fireEvent.click(model2Option);

    expect(chatStore.selectHomeModel).toHaveBeenCalledTimes(1);
    expect(chatStore.selectHomeModel).toHaveBeenCalledWith("provider-2", "model-2");
    expect(appStore.set).not.toHaveBeenCalled();
  });

  it("currentModelId() fallback when no provider ID matches", () => {
    mockDefaultLlmProvider.id = "non-existent";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const trigger = getByTestId("llm-picker-trigger");
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);
    const modelOption = document.querySelector('li[data-value="MiniMax-M2.5-highspeed"]');
    expect(modelOption).toBeTruthy();
  });

  it("T4.2.9: LLM picker 点击同 provider 非首项模型 → selectHomeModel (不写全局 settings, per CHANGELOG 8e96ea4)", async () => {
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    const chatStore = await import("../stores/chat.store");
    appStore.state.value.providers = [
      {
        id: "provider-multi",
        label: "MultiModel Provider",
        apiKey: "key-multi",
        llm: {
          defaultModel: "model-first",
          baseUrl: "https://api.multi.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.multi.com/models",
          models: [
            { id: "model-first", label: "Model First", contextWindow: 100000, thinking: false },
            { id: "model-second", label: "Model Second", contextWindow: 200000, thinking: false },
          ],
        },
      },
    ];
    mockDefaultLlmProvider.id = "provider-multi";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    const secondModelOption = document.querySelector('li[data-value="model-second"]') as HTMLElement;
    expect(secondModelOption).toBeTruthy();
    fireEvent.click(secondModelOption);

    expect(chatStore.selectHomeModel).toHaveBeenCalledTimes(1);
    expect(chatStore.selectHomeModel).toHaveBeenCalledWith("provider-multi", "model-second");
    expect(appStore.set).not.toHaveBeenCalled();
  });

  it("卡片化: 输入区为居中浮动卡片 (form 带 rounded-2xl + shadow-md)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const card = container.querySelector("form.rounded-2xl.shadow-md");
    expect(card).toBeTruthy();
  });

  it("卡片化: textarea 与工具行无分割线 (form 内无 border-t)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const card = container.querySelector("form.rounded-2xl");
    expect(card).toBeTruthy();
    // 精确匹配 border-t 类（border-transparent 等含 border-t 子串的类不算分割线）
    expect(card!.querySelector(".border-t")).toBeNull();
  });

  it("布局: form 内有 textarea + Send + LLM picker; workspace selector 上移到独立上下文卡片 (per CHANGELOG 6333b8c)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const form = container.querySelector("form.rounded-2xl");
    expect(form).toBeTruthy();
    expect(form!.querySelector('[data-testid="codex-send"]')).toBeTruthy();
    expect(form!.querySelector('[data-testid="llm-picker-trigger"]')).toBeTruthy();
    expect(form!.querySelector('[data-testid="workspace-select-trigger"]')).toBeNull();

    const workspaceTrigger = container.querySelector('[data-testid="workspace-select-trigger"]');
    expect(workspaceTrigger).toBeTruthy();
    expect(workspaceTrigger!.closest("form")).toBeNull();
  });
});


describe("HomeAgentForm — Ctrl+Enter / Cmd+Enter send shortcut (T4.3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.current.length = 0;
    mockSelectedWsId.current = "ws-1";
    const { appStore } = await import("@codeman-frontend/shared/stores/app.store");
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        apiKey: "test-key",
        llm: {
          defaultModel: "MiniMax-M2.5-highspeed",
          baseUrl: "https://api.minimaxi.com/anthropic",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", contextWindow: 200000, thinking: false },
          ],
        },
      },
    ];
    appStore.state.value.systemPrompt = { default: "You are a helpful assistant.", userCanEdit: true };
    mockDefaultLlmProvider.id = "minimax";
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.3.1: Ctrl+Enter on textarea triggers form submit → createConversation + sendMessage called", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello via Ctrl+Enter" } });

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(createConversation).toHaveBeenCalledWith("ws-1", "Hello via Ctrl+Enter");
    });
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "new-conv-id",
        "Hello via Ctrl+Enter",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
  });

  it("T4.3.2: Cmd+Enter on textarea (Mac) triggers form submit → createConversation + sendMessage called", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello via Cmd+Enter" } });

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(createConversation).toHaveBeenCalledWith("ws-1", "Hello via Cmd+Enter");
    });
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "new-conv-id",
        "Hello via Cmd+Enter",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
  });

  it("T4.3.3: Enter without modifier does NOT trigger send", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Just Enter" } });

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(createConversation).not.toHaveBeenCalled();
  });

  it("T4.3.4: Ctrl+Enter with empty input does not trigger send", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(createConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("T4.4.1: 中文 IME composition 期间 onInput 不写 signal — send 按钮保持 disabled", () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);
    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    const sendButton = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;

    expect(sendButton.disabled).toBe(true);

    fireEvent(textarea, new Event("compositionstart", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "n" } });
    fireEvent.input(textarea, { target: { value: "ni" } });
    fireEvent.input(textarea, { target: { value: "你" } });

    expect(sendButton.disabled).toBe(true);

    fireEvent(textarea, new Event("compositionend", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "你" } });

    expect(sendButton.disabled).toBe(false);
  });
});

describe("HomeAgentForm Bug regression: Invalid value (Type) on blur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.current.length = 0;
    mockSelectedWsId.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("Bug: 输入框 blur 后不应出现 generic 'Invalid value (Type)' 提示", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);
    const textarea = container.querySelector(
      "[data-testid='codex-input']",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.disabled).toBe(false);

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

describe("HomeAgentForm Bug regression: '请输入消息内容' on blur (submit-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.current.length = 0;
    mockSelectedWsId.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("Bug: 输入框 blur 后不应出现 '请输入消息内容' (只有提交才校验)", async () => {
    mockWorkspaces.current.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId.current = "ws-1";

    const { container } = render(() => <HomeAgentForm />);
    const textarea = container.querySelector(
      "[data-testid='codex-input']",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.disabled).toBe(false);

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
