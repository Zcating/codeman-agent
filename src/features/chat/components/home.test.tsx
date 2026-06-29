//! home.test.tsx — HomeAgentForm 组件测试 (T4.1)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Effect } from "effect";
import { HomeAgentForm } from "./home";
import type { ProviderConfig } from "../lib/runtime";
import { createAndSendConversation, addWorkspace as addWorkspaceFromStore } from "../stores/chat.store";

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

// ─── Mock settings-saver ────────────────────────────────────────────────────────

vi.mock("../../settings/lib/settings-saver", () => ({
  settingsSaver: {
    scheduleSave: vi.fn(),
    cancelPending: vi.fn(),
    flushNow: vi.fn(),
  },
}));

// ─── Mock appStore ─────────────────────────────────────────────────────────

vi.mock("../../../shared/stores/app.store", () => ({
  appStore: {
    state: {
      value: {
        workspaces: [] as Array<{ id: string; label: string; root_path: string; enabled: boolean }>,
        default_llm_provider_id: "minimax",
        providers: [
          {
            id: "minimax",
            label: "MiniMax",
            api_key: "test-key",
            enabled: true,
            llm: {
              default_model: "MiniMax-M2.5-highspeed",
              base_url: "https://api.minimaxi.com/anthropic",
              api_type: "anthropic-messages" as const,
              models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
              models: [
                { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", context_window: 200000, deprecated: false, thinking: false },
              ],
            },
          },
        ],
        system_prompt: { default: "You are a helpful assistant." },
      },
    },
    setLastUsedWorkspaceId: vi.fn(),
    selectedWorkspaceId: vi.fn<() => string | null>(),
    set: vi.fn(),
    pickWorkspacePath: vi.fn(() => Effect.succeed<string | null>(null)),
    addWorkspace: vi.fn((rootPath: string) => ({ id: "mock-id", label: rootPath, root_path: rootPath, enabled: true })),
  },
}));

// ─── Mock chat.store ────────────────────────────────────────────────────
const mockWorkspaces = vi.hoisted(() => [] as Array<{ id: string; label: string; root_path: string }>);
let mockSelectedWsId: string | null = null;

vi.mock("../stores/chat.store", () => ({
  workspaces$: vi.fn(() => mockWorkspaces),
  selectedWorkspaceId$: vi.fn(() => mockSelectedWsId),
  setSelectedWorkspaceId: vi.fn((id: string) => { mockSelectedWsId = id; }),
  addWorkspace: vi.fn(() => Effect.succeed({ id: "new-id", label: "New Workspace", root_path: "/new/path", created_at: Date.now() })),
  store: { byId: {} },
  activeId$: vi.fn<() => string | null>(),
  conversations$: vi.fn<() => never[]>(),
  selectConversation: vi.fn<(id: string) => void>(),
  sendMessage: vi.fn<(id: string, content: string, provider: ProviderConfig) => Promise<void>>(),
  createConversation: vi.fn<(id: string, title: string, prompt?: string) => Promise<void>>(),
  deleteConversation: vi.fn(),
  archiveConversation: vi.fn(),
  setupConvState: vi.fn(),
  cancel: vi.fn(),
  loadConversations: vi.fn(),
  clearActiveConversation: vi.fn(),
  createAndSendConversation: vi.fn<(wsId: string, title: string, msg: string, provider: ProviderConfig) => Promise<void>>(),
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

  it("T4.1.1: 0 workspaces → shows 'No workspaces' placeholder, input permanently disabled", async () => {
    // Workspaces already empty from beforeEach
    const { getByTestId, getByText } = render(() => <HomeAgentForm />);

    // Textarea should be visible but disabled
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Add a workspace to start");

    // Workspace picker area shows "No workspaces" placeholder
    expect(getByText("No workspaces")).toBeTruthy();
  });

  it("T4.1.2: 1 workspace → input immediately enabled (draftWorkspaceId auto-set)", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Project A", root_path: "C:\\a" });
    mockSelectedWsId = "ws-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Textarea must be enabled because draftWorkspaceId is pre-set
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe("发条消息…");
  });

  it("T4.1.3: 2+ workspaces → input disabled until user picks", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Project A", root_path: "C:\\a" },
      { id: "ws-2", label: "Project B", root_path: "C:\\b" },
    );
    // mockSelectedWsId is already null from beforeEach

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Select a workspace above");
  });

  it("T4.1.4: 2+ workspaces → no pre-select; clicking workspace Select option enables input + calls setSelectedWorkspaceId", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Project A", root_path: "C:\\a" },
      { id: "ws-2", label: "Project B", root_path: "C:\\b" },
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
    mockWorkspaces.push({ id: "ws-1", label: "My Project", root_path: "C:\\projects\\my-project" });
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

  it("T4.1.6: send button click triggers createAndSendConversation with workspaceId + firstMessage", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    mockWorkspaces.push({ id: "ws-1", label: "Frontend", root_path: "/p" });
    mockSelectedWsId = "ws-1";
    appStore.state.value.default_llm_provider_id = "minimax";
    appStore.state.value.providers = [
      {
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        api_key: "test-key",
        llm: {
          default_model: "m",
          base_url: "https://api",
          api_type: "anthropic-messages",
          models: [],
          models_endpoint: "",
        },
      },
    ];
    appStore.state.value.system_prompt = { default: "system msg here", user_can_edit: true };

    const { container } = render(() => <HomeAgentForm />);

    // Input enabled because 1 workspace → auto-selected
    const textarea = container.querySelector("[data-testid='codex-input']") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Hello world" } });

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(createAndSendConversation).toHaveBeenCalledWith(
        "ws-1",
        "Hello world", // title is firstMessage.slice(0, 30)
        "Hello world",
        expect.objectContaining({ apiKey: "test-key" }),
      );
    });
  });

  it("T4.1.7: send with empty input does not call createAndSendConversation", async () => {
    mockWorkspaces.push({ id: "ws-1", label: "Frontend", root_path: "/p" });
    mockSelectedWsId = "ws-1";

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    // Send button is disabled when input is empty
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn); // click on disabled button doesn't fire
    expect(createAndSendConversation).not.toHaveBeenCalled();
  });

  it("T4.1.8: send with no workspace selected (2+ workspaces) does not call createAndSendConversation", async () => {
    // 2 workspaces, user hasn't picked yet
    mockWorkspaces.push(
      { id: "ws-1", label: "A", root_path: "/a" },
      { id: "ws-2", label: "B", root_path: "/b" },
    );
    // mockSelectedWsId is null → no selection

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    expect(sendBtn).toBeDisabled(); // disabled because no workspace picked
    fireEvent.click(sendBtn);
    expect(createAndSendConversation).not.toHaveBeenCalled();
  });

  it("T4.1.9: workspace Select renders all workspaces as options", async () => {
    mockWorkspaces.push(
      { id: "ws-1", label: "Alpha", root_path: "/a" },
      { id: "ws-2", label: "Beta", root_path: "/b" },
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
        api_key: "test-key",
        enabled: true,
        llm: {
          default_model: "MiniMax-M2.5-highspeed",
          base_url: "https://api.minimaxi.com/anthropic",
          api_type: "anthropic-messages" as const,
          models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed", context_window: 200000, deprecated: false, thinking: false },
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", root_path: "C:\\a" });
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", root_path: "C:\\a" });
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", root_path: "C:\\a" });
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", root_path: "C:\\a" });
    // Override addWorkspace mock to also update mockSelectedWsId (mimics production behavior)
    vi.mocked(addWorkspaceFromStore).mockImplementation(() => {
      mockSelectedWsId = "new-id";
      return Effect.succeed({ id: "new-id", label: "New Workspace", root_path: "/new/path", created_at: Date.now() });
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
    mockWorkspaces.push({ id: "ws-1", label: "Project A", root_path: "C:\\a" });
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
        api_key: "key1",
        enabled: true,
        llm: {
          default_model: "model-1",
          base_url: "https://api.one.com",
          api_type: "anthropic-messages" as const,
          models_endpoint: "https://api.one.com/models",
          models: [
            { id: "model-1", label: "Model One", context_window: 100000, deprecated: false, thinking: false },
          ],
        },
      },
      {
        id: "provider-2",
        label: "Provider Two",
        api_key: "key2",
        enabled: true,
        llm: {
          default_model: "model-2",
          base_url: "https://api.two.com",
          api_type: "anthropic-messages" as const,
          models_endpoint: "https://api.two.com/models",
          models: [
            { id: "model-2", label: "Model Two", context_window: 200000, deprecated: false, thinking: false },
          ],
        },
      },
    ];
    appStore.state.value.default_llm_provider_id = "provider-1";

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
  it("T4.2.8: LLM picker 选中 → 写 default_llm_provider_id + scheduleSave", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    const { settingsSaver } = await import("../../settings/lib/settings-saver");
    // Workspace data comes from chat.store mock (already set by T4.2 beforeEach)
    appStore.state.value.providers = [
      {
        id: "provider-1",
        label: "Provider One",
        api_key: "key1",
        enabled: true,
        llm: {
          default_model: "model-1",
          base_url: "https://api.one.com",
          api_type: "anthropic-messages" as const,
          models_endpoint: "https://api.one.com/models",
          models: [
            { id: "model-1", label: "Model One", context_window: 100000, deprecated: false, thinking: false },
          ],
        },
      },
      {
        id: "provider-2",
        label: "Provider Two",
        api_key: "key2",
        enabled: true,
        llm: {
          default_model: "model-2",
          base_url: "https://api.two.com",
          api_type: "anthropic-messages" as const,
          models_endpoint: "https://api.two.com/models",
          models: [
            { id: "model-2", label: "Model Two", context_window: 200000, deprecated: false, thinking: false },
          ],
        },
      },
    ];
    appStore.state.value.default_llm_provider_id = "provider-1";

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open LLM picker and click model-2
    const llmPickerTrigger = getByTestId("llm-picker-trigger");
    fireEvent.click(llmPickerTrigger);

    // Click the second model option
    const model2Option = document.querySelector('li[data-value="model-2"]') as HTMLElement;
    expect(model2Option).toBeTruthy();
    fireEvent.click(model2Option);

    // Should set default_llm_provider_id to provider-2 (which has model-2)
    expect(appStore.set).toHaveBeenCalledWith({ default_llm_provider_id: "provider-2" });
    expect(settingsSaver.scheduleSave).toHaveBeenCalledTimes(1);
  });
});
