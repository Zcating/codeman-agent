//! home.test.tsx — HomeAgentForm 组件测试 (T4.1)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Effect } from "effect";
import { HomeAgentForm } from "./home";
import type { ProviderConfig } from "../lib/runtime";
import { createAndSendConversation } from "../stores/conversations.store";

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

// ─── Mock conversations.store ────────────────────────────────────────────────

vi.mock("../stores/conversations.store", () => ({
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
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.1.1: 0 workspaces → shows 'No workspaces' placeholder, input permanently disabled", async () => {
    // Override workspaces to be empty
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { getByTestId, getByText } = render(() => <HomeAgentForm />);

    // Textarea should be visible but disabled
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Add a workspace to start");

    // Workspace picker area shows "No workspaces" placeholder
    expect(getByText("No workspaces")).toBeTruthy();
  });

  it("T4.1.2: 1 workspace → input immediately enabled (draftWorkspaceId auto-set)", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    // selectedWorkspaceId returns ws-1 (last-used), which seeds draftWorkspaceId
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Textarea must be enabled because draftWorkspaceId is pre-set
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe("发条消息…");
  });

  it("T4.1.3: 2+ workspaces → input disabled until user picks", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
      { id: "ws-2", label: "Project B", root_path: "C:\\b", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Select a workspace above");
  });

  it("T4.1.4: 2+ workspaces → no pre-select; clicking workspace Select option enables input + calls setLastUsedWorkspaceId", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
      { id: "ws-2", label: "Project B", root_path: "C:\\b", enabled: true },
    ];
    // No last-used workspace
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

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

    // After selection: setLastUsedWorkspaceId called with the workspace id
    expect(appStore.setLastUsedWorkspaceId).toHaveBeenCalledWith("ws-1");
    expect(textarea.disabled).toBe(false);
  });

  it("T4.1.5: Send button disabled when input is empty", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "My Project", root_path: "C:\\projects\\my-project", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

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
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Frontend", root_path: "/p", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");
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
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Frontend", root_path: "/p", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    // Send button is disabled when input is empty
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn); // click on disabled button doesn't fire
    expect(createAndSendConversation).not.toHaveBeenCalled();
  });

  it("T4.1.8: send with no workspace selected (2+ workspaces) does not call createAndSendConversation", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    // 2 workspaces, user hasn't picked yet
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "A", root_path: "/a", enabled: true },
      { id: "ws-2", label: "B", root_path: "/b", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { container } = render(() => <HomeAgentForm />);

    const sendBtn = container.querySelector("[data-testid='codex-send']") as HTMLButtonElement;
    expect(sendBtn).toBeDisabled(); // disabled because no workspace picked
    fireEvent.click(sendBtn);
    expect(createAndSendConversation).not.toHaveBeenCalled();
  });

  it("T4.1.9: workspace Select renders with all enabled workspaces as options", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Alpha", root_path: "/a", enabled: true },
      { id: "ws-2", label: "Beta", root_path: "/b", enabled: true },
      { id: "ws-3", label: "Gamma", root_path: "/c", enabled: false }, // disabled — should not appear
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open the select dropdown
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    // Mock renders items as <li data-value="...">
    const options = document.querySelectorAll('li[data-value]');
    const labels = Array.from(options).map((o) => o.textContent?.trim());

    // Only enabled workspaces appear (Gamma filtered out by home.tsx)
    expect(labels).toContain("Alpha");
    expect(labels).toContain("Beta");
    expect(labels).not.toContain("Gamma");
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
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

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
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

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
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

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
  it("T4.2.4: Action slot onClick 调 appStore.pickWorkspacePath", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");
    (appStore.pickWorkspacePath as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed<string | null>("/some/new/path"));

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open workspace select first
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);

    // Click the action button "+ Add new workspace…"
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    expect(appStore.pickWorkspacePath).toHaveBeenCalledTimes(1);
  });

  // T4.2.5
  it("T4.2.5: Picker 返回 path → 调 addWorkspace + setDraftWorkspaceId + setLastUsedWorkspaceId", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");
    (appStore.pickWorkspacePath as ReturnType<typeof vi.fn>).mockReturnValue(
      Effect.succeed<string | null>("/my/new/project")
    );
    (appStore.addWorkspace as ReturnType<typeof vi.fn>).mockReturnValue({
      id: "new-id",
      label: "project",
      root_path: "/my/new/project",
      enabled: true,
    });

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open workspace select and click action button
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    // Async onClick handler calls pickWorkspacePath → addWorkspace → setLastUsedWorkspaceId
    await waitFor(() => {
      expect(appStore.addWorkspace).toHaveBeenCalledWith("/my/new/project");
      expect(appStore.setLastUsedWorkspaceId).toHaveBeenCalledWith("new-id");
    });

    // Textarea should be enabled after setting draftWorkspaceId
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  // T4.2.6
  it("T4.2.6: Picker 取消 (返回 null) → 不调 addWorkspace", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");
    (appStore.pickWorkspacePath as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed<string | null>(null));

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Open workspace select and click action button
    const selectTrigger = getByTestId("workspace-select-trigger");
    fireEvent.click(selectTrigger);
    const addBtn = getByTestId("workspace-select-add-btn");
    fireEvent.click(addBtn);

    expect(appStore.addWorkspace).not.toHaveBeenCalled();
  });

  // T4.2.7
  it("T4.2.7: LLM picker 显示 enabled providers 的所有 models", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");
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

    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");
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
