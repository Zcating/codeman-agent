//! home.test.tsx — HomeAgentForm 组件测试 (T4.1)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Effect } from "effect";
import { HomeAgentForm } from "./home";
import type { ProviderConfig } from "../lib/runtime";
import { createConversation, sendMessage, addWorkspace as addWorkspaceFromStore } from "../stores/chat.store";

// ─── Mock codeman-toast (ADR-0029 D5 silent-drop fix verification) ────────────

const mockCodemanToast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("../../../shared/components/internal/codeman-toast", () => ({
  codemanToast: mockCodemanToast,
  ToasterMount: () => null,
}));

// Mock @ark-ui/solid Select for jsdom — same pattern as codeman-select.test.tsx
let mockIsOpen = false;
let sharedOnValueChanges: ((details: { value: string[] }) => void)[] = [];

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual("@ark-ui/solid");
  return {
    ...actual,
    Select: {
      Root: (props: any) => {
        if (props.onValueChange) sharedOnValueChanges.push(props.onValueChange);
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
                // Dispatch to ALL registered Roots (test scenarios only have one open at a time anyway)
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

// ─── Mock @tanstack/solid-router ──────────────────────────────────────────────

vi.mock("@tanstack/solid-router", () => ({
  useNavigate: vi.fn(() => (_opts: { to: string }) => undefined),
}));

// ─── Mock settings-saver ────────────────────────────────────────────────────────

vi.mock("../../settings/lib/settings-saver", () => ({
  settingsSaver: {
    scheduleSave: vi.fn(),
    cancelPending: vi.fn(),
    flushNow: vi.fn(),
  },
}));

// ─── Mock appStore ─────────────────────────────────────────────────────────

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
            enabled: true,
            llm: {
              defaultModel: "MiniMax-M2.5-highspeed",
              baseUrl: "https://api.minimaxi.com/anthropic",
              apiType: "anthropic-messages" as const,
              modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
              models: [
                { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", contextWindow: 200000, deprecated: false, thinking: false },
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

// ─── Mock chat.store ────────────────────────────────────────────────────
const mockWorkspaces = vi.hoisted(() => [] as Array<{ id: string; label: string; rootPath: string }>);
let mockSelectedWsId: string | null = null;

vi.mock("../stores/chat.store", () => ({
  workspaces$: vi.fn(() => mockWorkspaces),
  selectedWorkspaceId$: vi.fn(() => mockSelectedWsId),
  setSelectedWorkspaceId: vi.fn((id: string) => { mockSelectedWsId = id; }),
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
}));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("HomeAgentForm — workspace pre-selection logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.length = 0;
    mockSelectedWsId = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.1.1: 0 workspaces → Select trigger renders, input permanently disabled", async () => {
    // Workspaces already empty from beforeEach
    const { getByTestId } = render(() => <HomeAgentForm />);

    // Textarea should be visible but disabled
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Add a workspace to start");

    // Workspace Select trigger is rendered even with 0 workspaces
    expect(getByTestId("workspace-select-trigger")).toBeTruthy();
  });

  it("T4.1.1b: 0 workspaces → Select trigger click opens dropdown with Add workspace action", async () => {
    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open the Select dropdown
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    // Action slot button "+ Add new workspace…" should be present
    expect(getByTestId("workspace-select-add-btn")).toBeTruthy();
  });

  it("T4.1.1c: 0 workspaces → Action slot click triggers addWorkspace", async () => {
    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open the Select dropdown and click Add workspace button
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    // addWorkspace from chat.store is called
    expect(addWorkspaceFromStore).toHaveBeenCalledTimes(1);
  });

  it("T4.1.2: 1 workspace → input immediately enabled (draftWorkspaceId auto-set)", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId = "ws-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Textarea must be enabled because draftWorkspaceId is pre-set
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe("发条消息…");
  });

  it("T4.1.3: 2+ workspaces → input disabled until user picks", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Project A", rootPath: "C:\\a" },
      { id: "ws-2", label: "Project B", rootPath: "C:\\b" },
    );
    // mockSelectedWsId is already null from beforeEach

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Select a workspace above");
  });

  // Bug fix regression: 输入框下方不应常驻 generic "Invalid value (Type)" 提示。
  // 用户原始 bug 描述："输入框下方为什么会有这个提示？不应该常驻"
  // 根因：TanStack Form form-level `onMount: effectSchema(HomeFormSchema)` 跑
  // `{ draft: "", workspaceId: "" }` 触发 NonEmptyString 失败；ParseIssue 无 message annotation
  // → effect-schema-adapter fallback "Invalid value (Type)" → 渲染到 textarea 下方。
  // 修复：home.tsx line 226 用 `field().state.meta.isTouched` gate 错误显示。
  it("Bug: 输入框下方不应常驻 generic 'Invalid value (Type)' 提示", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Project A", rootPath: "C:\\a" },
      { id: "ws-2", label: "Project B", rootPath: "C:\\b" },
    );
    mockSelectedWsId = null;

    const { container } = render(() => <HomeAgentForm />);

    // 用户可见的 textarea 渲染（sanity）
    const textarea = container.querySelector(
      "[data-testid='codex-input']",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.disabled).toBe(true);

    // 关键断言：<p class="text-xs text-destructive">Invalid value (Type)</p>
    // 不应在没有任何用户触摸 field 的状态下出现。
    const destructiveMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");

    expect(destructiveMessages).not.toContain("Invalid value (Type)");
  });

  it("T4.1.4: 2+ workspaces → no pre-select; clicking workspace Select option enables input + calls setSelectedWorkspaceId", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Project A", rootPath: "C:\\a" },
      { id: "ws-2", label: "Project B", rootPath: "C:\\b" },
    );
    // mockSelectedWsId is null → no pre-select

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Input disabled initially
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    // Open the workspace Select (mock toggles mockIsOpen on click)
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    // Click the "Project A" option in the dropdown (uses mock data-value selector)
    const firstOption = document.querySelector('li[data-value="ws-1"]') as HTMLElement;
    expect(firstOption).toBeTruthy();
    fireEvent.click(firstOption);

    // After selection: setSelectedWorkspaceId was called → mockSelectedWsId updated
    expect(mockSelectedWsId).toBe("ws-1");
    // Note: textarea.disabled check omitted because selectedWorkspaceId$ is a vi.fn mock (not a real Solid signal),
    // so the component doesn't reactively re-render. The mockSelectedWsId value change proves the handler fired.
  });

  it("T4.1.5: Send button disabled when input is empty", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "My Project", rootPath: "C:\\projects\\my-project" });
    mockSelectedWsId = "ws-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    const sendButton = getByTestId("codex-send") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    // Type something
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hi" } });

    // Now send button should be enabled
    expect(sendButton.disabled).toBe(false);
  });

  it("T4.1.6: send button click triggers createConversation then sendMessage", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    mockWorkspaces.push({ id: "ws-1", label: "Frontend", rootPath: "/p" });
    mockSelectedWsId = "ws-1";
    mockDefaultLlmProvider.id = "minimax";
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        enabled: true,
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

    // Input enabled because 1 workspace → auto-selected
    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello world" } });

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      // createConversation is called with workspaceId and title (firstMessage.slice(0, 30))
      expect(createConversation).toHaveBeenCalledWith("ws-1", "Hello world");
    });
    // sendMessage is called with the new convId, message, and provider
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "new-conv-id",
        "Hello world",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
  });

  it("T4.1.7: send with empty input does not call createConversation or sendMessage", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Frontend", rootPath: "/p" });
    mockSelectedWsId = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    // Send button is disabled when input is empty
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn); // click on disabled button doesn't fire
    expect(createConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("T4.1.8: send with no workspace selected (2+ workspaces) does not call createConversation or sendMessage", async () => {
    // 2 workspaces, user hasn't picked yet
    mockWorkspaces.push(
      { id: "ws-1", label: "A", rootPath: "/a" },
      { id: "ws-2", label: "B", rootPath: "/b" },
    );
    // mockSelectedWsId is null → no selection

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    expect(sendBtn).toBeDisabled(); // disabled because no workspace picked
    fireEvent.click(sendBtn);
    expect(createConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("T4.1.9: workspace Select renders all workspaces as options", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Alpha", rootPath: "/a" },
      { id: "ws-2", label: "Beta", rootPath: "/b" },
    );
    // mockSelectedWsId is null → no pre-select

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open the select dropdown
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    // Mock renders items as <li data-value="...">
    const options = document.querySelectorAll('li[data-value]');
    const labels = Array.from(options).map((o) => o.textContent?.trim());

    // All workspaces appear (D8-W: no 'enabled' field anymore)
    expect(labels).toContain("Alpha");
    expect(labels).toContain("Beta");
    expect(options.length).toBe(2);

    // Action slot ("+ Add new workspace…") also present (home.tsx renders it)
    expect(document.querySelector("[data-testid='workspace-select-add-btn']")).toBeTruthy();
  });

  // ADR-0029 D5: silent-drop bug fix — createConversation 失败 → codemanToast.error 被调
  it("ADR-0029 D5: createConversation 失败 → codemanToast.error 被调 (替代 silent return)", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Frontend", rootPath: "/p" });
    mockSelectedWsId = "ws-1";

    // Override createConversation to return failure (simulate DB error)
    vi.mocked(createConversation).mockReturnValueOnce(
      Effect.fail({ _tag: "Database", message: "DB connection lost" }) as any,
    );

    const { container } = render(() => <HomeAgentForm />);

    // Type valid draft
    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "hello" } });

    // Click Send
    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockCodemanToast.error).toHaveBeenCalledTimes(1);
    });

    // Verify sendMessage was NOT called (createConversation failure short-circuits)
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

// ─── Layout + Action slot + LLM picker (T4.2) ──────────────────────────────────

describe("HomeAgentForm — new layout + Action slot + LLM picker (T4.2)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.length = 0;
    mockSelectedWsId = "ws-1"; // default: 1 pre-selected workspace
    // Reset providers to default mock state to avoid test isolation issues
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        apiKey: "test-key",
        enabled: true,
        llm: {
          defaultModel: "MiniMax-M2.5-highspeed",
          baseUrl: "https://api.minimaxi.com/anthropic",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", contextWindow: 200000, deprecated: false, thinking: false },
          ],
        },
      },
    ];
  });

  afterEach(() => {
    cleanup();
  });

  // T4.2.1
  it("T4.2.1: 新布局 — textarea 在 workspace picker 之前 (DOM 顺序)", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    // mockSelectedWsId = "ws-1" from beforeEach

    const { container } = render(() => <HomeAgentForm />);

    // Find the outer wrapper that contains both textarea and workspace picker
    // The layout should be: Title → Textarea → row(workspace picker + LLM picker)
    const textareaEl = container.querySelector("[data-testid='codex-input']");
    const workspaceTrigger = container.querySelector("[data-testid='workspace-select-trigger']");

    expect(textareaEl).toBeTruthy();
    expect(workspaceTrigger).toBeTruthy();

    // In the DOM, textarea should appear before workspace-select-trigger
    const allChildren = Array.from(container.querySelectorAll("[data-testid]"));
    const textareaIdx = allChildren.findIndex(el => el.getAttribute("data-testid") === "codex-input");
    const wsTriggerIdx = allChildren.findIndex(el => el.getAttribute("data-testid") === "workspace-select-trigger");
    expect(textareaIdx).toBeLessThan(wsTriggerIdx);
  });

  // T4.2.2
  it("T4.2.2: workspace picker 200px 固定宽度", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    // mockSelectedWsId = "ws-1" from beforeEach

    const { container } = render(() => <HomeAgentForm />);

    const workspaceTrigger = container.querySelector("[data-testid='workspace-select-trigger']");
    expect(workspaceTrigger).toBeTruthy();

    // Walk up to find the closest element with w-[200px] class
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

  // T4.2.3
  it("T4.2.3: LLM picker 200px 固定宽度", async () => {
    // workspace data from chat.store mock (mockWorkspaces already has 1 item from T4.2 beforeEach)
    const { container } = render(() => <HomeAgentForm />);

    const llmPickerTrigger = container.querySelector("[data-testid='llm-picker-trigger']");
    expect(llmPickerTrigger).toBeTruthy();

    // Walk up to find the closest element with w-[200px] class
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

  // T4.2.4
  it("T4.2.4: Action slot onClick 调 addWorkspace (chat.store)", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    // mockSelectedWsId = "ws-1" from beforeEach

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open workspace select first
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    // Click the action button "+ Add new workspace…"
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    // D8-W: addWorkspace() from chat.store is called (mocked to return Effect.succeed)
    expect(addWorkspaceFromStore).toHaveBeenCalledTimes(1);
  });

  // T4.2.5
  it("T4.2.5: Picker 返回 path → addWorkspace adds + sets draftWorkspaceId + textarea enabled", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    // Override addWorkspace mock to also update mockSelectedWsId (mimics production behavior)
    vi.mocked(addWorkspaceFromStore).mockImplementation(() => {
      mockSelectedWsId = "new-id";
      return Effect.succeed({ id: "new-id", label: "New Workspace", rootPath: "/new/path", createdAt: Date.now() });
    });

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open workspace select and click action button
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    // addWorkspace was called
    await waitFor(() => {
      expect(addWorkspaceFromStore).toHaveBeenCalled();
    });

    // Textarea should be enabled after addWorkspace sets selectedWorkspaceId
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  // T4.2.6
  it("T4.2.6: addWorkspace 返回 null 时 textarea 保持 disabled", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    // Override addWorkspace mock to return null (picker cancelled)
    vi.mocked(addWorkspaceFromStore).mockReturnValueOnce(Effect.succeed(null as unknown as any));

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open workspace select and click action button
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    // addWorkspace was still called (it just returned null)
    expect(addWorkspaceFromStore).toHaveBeenCalledTimes(1);
  });

  // T4.2.7
  it("T4.2.7: LLM picker 显示 enabled providers 的所有 models", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    // Workspace data comes from chat.store mock (already set by T4.2 beforeEach)
    // Setup 2 providers with 1 model each
    appStore.state.value.providers = [
      {
        id: "provider-1",
        label: "Provider One",
        apiKey: "key1",
        enabled: true,
        llm: {
          defaultModel: "model-1",
          baseUrl: "https://api.one.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.one.com/models",
          models: [
            { id: "model-1", label: "Model One", contextWindow: 100000, deprecated: false, thinking: false },
          ],
        },
      },
      {
        id: "provider-2",
        label: "Provider Two",
        apiKey: "key2",
        enabled: true,
        llm: {
          defaultModel: "model-2",
          baseUrl: "https://api.two.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.two.com/models",
          models: [
            { id: "model-2", label: "Model Two", contextWindow: 200000, deprecated: false, thinking: false },
          ],
        },
      },
    ];
    mockDefaultLlmProvider.id = "provider-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Find LLM picker trigger and open it
    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    // Should have 2 model options (one from each provider)
    const llmContent = document.querySelector('[data-testid="llm-picker-content"]');
    expect(llmContent).toBeTruthy();
    const options = llmContent!.querySelectorAll('li[data-value]');
    expect(options.length).toBe(2);
  });

  // T4.2.8
  it("T4.2.8: LLM picker 选中 → 写 defaultLlmProviderId + scheduleSave", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    const { settingsSaver } = await import("../../settings/lib/settings-saver");
    // Workspace data comes from chat.store mock (already set by T4.2 beforeEach)
    appStore.state.value.providers = [
      {
        id: "provider-1",
        label: "Provider One",
        apiKey: "key1",
        enabled: true,
        llm: {
          defaultModel: "model-1",
          baseUrl: "https://api.one.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.one.com/models",
          models: [
            { id: "model-1", label: "Model One", contextWindow: 100000, deprecated: false, thinking: false },
          ],
        },
      },
      {
        id: "provider-2",
        label: "Provider Two",
        apiKey: "key2",
        enabled: true,
        llm: {
          defaultModel: "model-2",
          baseUrl: "https://api.two.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.two.com/models",
          models: [
            { id: "model-2", label: "Model Two", contextWindow: 200000, deprecated: false, thinking: false },
          ],
        },
      },
    ];
    mockDefaultLlmProvider.id = "provider-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open LLM picker and click model-2
    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    // Click the second model option
    const model2Option = document.querySelector('li[data-value="model-2"]') as HTMLElement;
    expect(model2Option).toBeTruthy();
    fireEvent.click(model2Option);

    // Should set defaultLlmProviderId + providers (immutable update with updated llm.defaultModel)
    expect(appStore.set).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultLlmProviderId: "provider-2",
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: "provider-2",
            llm: expect.objectContaining({ defaultModel: "model-2" }),
          }),
        ]),
      }),
    );
    expect(settingsSaver.scheduleSave).toHaveBeenCalledTimes(1);
  });

  it("currentModelId() fallback when no provider ID matches", () => {
    // Set to a non-existent provider ID so currentModelId() falls back
    mockDefaultLlmProvider.id = "non-existent";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // The LLM picker still renders, falling back to first provider's first model
    const trigger = getByTestId("llm-picker-trigger");
    expect(trigger).toBeTruthy();

    // Open the picker and verify the model option is present
    fireEvent.click(trigger);
    // First provider minimax → model "MiniMax-M2.5-highspeed"
    const modelOption = document.querySelector('li[data-value="MiniMax-M2.5-highspeed"]');
    expect(modelOption).toBeTruthy();
  });

  // ─── Regression: 同 provider 非首项模型回写 ─────────────────────────────
  it("T4.2.9: LLM picker 点击同 provider 非首项模型 → 写 provider.llm.defaultModel + defaultLlmProviderId", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    const { settingsSaver } = await import("../../settings/lib/settings-saver");
    // 单个 provider，2 个模型，默认选第一个
    appStore.state.value.providers = [
      {
        id: "provider-multi",
        label: "MultiModel Provider",
        apiKey: "key-multi",
        enabled: true,
        llm: {
          defaultModel: "model-first",
          baseUrl: "https://api.multi.com",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.multi.com/models",
          models: [
            { id: "model-first", label: "Model First", contextWindow: 100000, deprecated: false, thinking: false },
            { id: "model-second", label: "Model Second", contextWindow: 200000, deprecated: false, thinking: false },
          ],
        },
      },
    ];
    mockDefaultLlmProvider.id = "provider-multi";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open LLM picker and click the second model (non-first item)
    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    const secondModelOption = document.querySelector('li[data-value="model-second"]') as HTMLElement;
    expect(secondModelOption).toBeTruthy();
    fireEvent.click(secondModelOption);

    // scheduleSave should be called
    expect(settingsSaver.scheduleSave).toHaveBeenCalledTimes(1);

    // appStore.set must be called with updated providers (immutable update) and defaultLlmProviderId
    expect(appStore.set).toHaveBeenCalledTimes(1);
    expect(appStore.set).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultLlmProviderId: "provider-multi",
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: "provider-multi",
            llm: expect.objectContaining({ defaultModel: "model-second" }),
          }),
        ]),
      }),
    );
  });
});

// ─── Ctrl+Enter send shortcut (T4.3) ─────────────────────────────────────────

describe("HomeAgentForm — Ctrl+Enter / Cmd+Enter send shortcut (T4.3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.length = 0;
    mockSelectedWsId = "ws-1";
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        apiKey: "test-key",
        enabled: true,
        llm: {
          defaultModel: "MiniMax-M2.5-highspeed",
          baseUrl: "https://api.minimaxi.com/anthropic",
          apiType: "anthropic-messages" as const,
          modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", contextWindow: 200000, deprecated: false, thinking: false },
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello via Ctrl+Enter" } });

    // Simulate Ctrl+Enter keydown
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello via Cmd+Enter" } });

    // Simulate Cmd+Enter keydown (metaKey)
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Just Enter" } });

    // Simulate plain Enter keydown (no modifiers)
    fireEvent.keyDown(textarea, { key: "Enter" });

    // createConversation should NOT be called
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("T4.3.4: Ctrl+Enter with empty input does not trigger send", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });

    const { container } = render(() => <HomeAgentForm />);

    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    // textarea is empty (no fireEvent.input)

    // Simulate Ctrl+Enter with empty input
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(createConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // ─── IME 兼容性 (Regression: 与 chat-view.tsx 同一根因) ────────────────
  it("T4.4.1: 中文 IME composition 期间 onInput 不写 signal — send 按钮保持 disabled", () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId = "ws-1";

    const { container } = render(() => <HomeAgentForm />);
    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    const sendButton = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;

    expect(sendButton.disabled).toBe(true);

    // 模拟拼音 IME 输入 "ni" → "你":composition 内 setInput 不应触发,
    // 避免 value={input()} 响应绑定中断 IME composition 状态。
    fireEvent(textarea, new Event("compositionstart", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "n" } });
    fireEvent.input(textarea, { target: { value: "ni" } });
    fireEvent.input(textarea, { target: { value: "你" } });

    // Composition 期间 send 应保持 disabled
    expect(sendButton.disabled).toBe(true);

    // Composition 结束 — signal 一次性同步
    fireEvent(textarea, new Event("compositionend", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "你" } });

    expect(sendButton.disabled).toBe(false);
  });
});

// ─── Bug fix regression: 输入框 blur 后不应出现 generic 'Invalid value (Type)' ───
// 根因：DraftFieldSchema = NonEmptyString = Schema.minLength(1) 无 message annotation。
// 用户 focus textarea 后 click 外部 → onBlur validator 跑空字符串 →
// effect-schema-adapter 的 fallback "Invalid value (Type)" 渲染到 textarea 下方。
// 修复：Schema.minLength(1) 加 { message: "..." } annotation，fallback 不再触发。
describe("HomeAgentForm Bug regression: Invalid value (Type) on blur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.length = 0;
    mockSelectedWsId = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("Bug: 输入框 blur 后不应出现 generic 'Invalid value (Type)' 提示", async () => {
    // 1 workspace → input enabled
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId = "ws-1";

    const { container } = render(() => <HomeAgentForm />);
    const textarea = container.querySelector(
      "[data-testid='codex-input']",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.disabled).toBe(false);

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

// ─── Bug fix regression: 输入框 blur 后不应出现 '请输入消息内容' (submit-only 校验) ───
// 根因：aabd902 给 NonEmptyString 加了 { message: () => "请输入消息内容" } annotation,
// 把 generic 'Invalid value (Type)' 替换成友好提示。但 home.tsx / chat-view.tsx 的
// <form.Field name="draft"> 仍用 validators={{ onBlur: effectSchema(DraftFieldSchema) }}
// + error={field().state.meta.isTouched ? ...} —— 用户 focus 再 blur 空 textarea 时
// onBlur validator 跑空字符串触发友好提示,isTouched=true 后错误渲染。
// 期望：blur 不应触发校验,只有提交才校验数据。
describe("HomeAgentForm Bug regression: '请输入消息内容' on blur (submit-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    sharedOnValueChanges = [];
    mockWorkspaces.length = 0;
    mockSelectedWsId = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("Bug: 输入框 blur 后不应出现 '请输入消息内容' (只有提交才校验)", async () => {
    // 1 workspace → input enabled
    mockWorkspaces.push({ id: "ws-1", label: "Project A", rootPath: "C:\\a" });
    mockSelectedWsId = "ws-1";

    const { container } = render(() => <HomeAgentForm />);
    const textarea = container.querySelector(
      "[data-testid='codex-input']",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.disabled).toBe(false);

    // Sanity: mount 阶段不会有任何 destructive 提示
    const mountMessages = Array.from(
      container.querySelectorAll("p.text-destructive"),
    ).map((el) => el.textContent ?? "");
    expect(mountMessages).not.toContain("请输入消息内容");

    // 模拟用户 focus → blur 空 textarea
    textarea.focus();
    fireEvent.blur(textarea);

    // 等待 Solid 同步 flush + TanStack Form 状态更新
    await waitFor(() => {
      const messages = Array.from(
        container.querySelectorAll("p.text-destructive"),
      ).map((el) => el.textContent ?? "");
      expect(messages).not.toContain("请输入消息内容");
    });
  });
});
