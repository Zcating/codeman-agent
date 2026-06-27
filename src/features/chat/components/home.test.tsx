//! home.test.tsx — HomeAgentForm 组件测试 (T4.1)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { HomeAgentForm } from "./home";
import type { ProviderConfig } from "../lib/runtime";
import { createAndSendConversation } from "../stores/conversations.store";

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
            llm: {
              default_model: "MiniMax-M2.5-highspeed",
              base_url: "https://api.minimaxi.com/anthropic",
            },
          },
        ],
        system_prompt: { default: "You are a helpful assistant." },
      },
    },
    setLastUsedWorkspaceId: vi.fn(),
    selectedWorkspaceId: vi.fn<() => string | null>(),
    set: vi.fn(),
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
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.1.1: 0 workspaces → shows 'Add a workspace' CTA, input permanently disabled", async () => {
    // Override workspaces to be empty
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { getByTestId, getByText } = render(() => <HomeAgentForm />);

    // CTA should be visible
    expect(getByText("Add a workspace")).toBeTruthy();
    // Textarea should be disabled
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe("Add a workspace to start");
  });

  it("T4.1.2: 1 workspace → input immediately enabled, workspace card auto-selected", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "My Project", root_path: "C:\\projects\\my-project", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue("ws-1");

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    const card = getByTestId("workspace-card-ws-1");
    expect(card).toBeTruthy();
    expect(card.className).toContain("border-primary");
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

  it("T4.1.4: User picks workspace → input enabled + setLastUsedWorkspaceId called", async () => {
    const { appStore } = await import("../../../shared/stores/app.store");
    appStore.state.value.workspaces = [
      { id: "ws-1", label: "Project A", root_path: "C:\\a", enabled: true },
      { id: "ws-2", label: "Project B", root_path: "C:\\b", enabled: true },
    ];
    (appStore.selectedWorkspaceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Click on ws-2 card
    const ws2Card = getByTestId("workspace-card-ws-2");
    fireEvent.click(ws2Card);

    // setLastUsedWorkspaceId should be called with ws-2
    expect(appStore.setLastUsedWorkspaceId).toHaveBeenCalledWith("ws-2");

    // Input should now be enabled
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
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
});
