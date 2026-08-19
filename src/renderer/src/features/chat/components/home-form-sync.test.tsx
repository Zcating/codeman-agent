
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@solidjs/testing-library";
import { HomeAgentForm } from "@codeman-frontend/features/chat/components/home";
import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";


const signalHandles = vi.hoisted(() => ({
  setSelectedWorkspaceId: null as ((id: string | null) => void) | null,
}));


vi.mock("../stores/chat.store", async () => {
  const { createSignal } = await import("solid-js");
  const [getSelected, setSelected] = createSignal<string | null>(null);

  signalHandles.setSelectedWorkspaceId = setSelected;

  return {
    workspaces$: () => [{ id: "ws-1", label: "Project A", rootPath: "C:\\a" }],
    selectedWorkspaceId$: getSelected,
    setSelectedWorkspaceId: (id: string) => setSelected(id),
    addWorkspace: vi.fn(async () => null),
    store: { byId: {} },
    activeId$: () => null,
    conversations$: () => [],
    selectConversation: vi.fn(),
    sendMessage: vi.fn(
      (_id: string, _content: string, _provider: ProviderConfig) =>
        ({ _tag: "Success" }) as any,
    ),
    createConversation: vi.fn(async () => "new-conv-id"),
    deleteConversation: vi.fn(),
    archiveConversation: vi.fn(),
    setupConvState: vi.fn(),
    cancel: vi.fn(),
    loadConversations: vi.fn(),
    clearActiveConversation: vi.fn(),
  };
});


vi.mock("../../../shared/components/internal/codeman-toast", () => ({
  codemanToast: { error: vi.fn(), success: vi.fn() },
  ToasterMount: () => null,
}));


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


vi.mock("../../../shared/stores/app.store", () => ({
  appStore: {
    state: {
      value: {
        defaultLlmProviderId: "minimax",
        providers: [
          {
            id: "minimax",
            label: "MiniMax",
            enabled: true,
            apiKey: "test-key",
            llm: {
              defaultModel: "MiniMax-M2.5-highspeed",
              baseUrl: "https://api.example.com",
              apiType: "anthropic-messages",
              modelsEndpoint: "",
              models: [
                {
                  id: "MiniMax-M2.5-highspeed",
                  label: "MiniMax-M2.5-highspeed",
                  contextWindow: 200000,
                  thinking: false,
                },
              ],
            },
          },
        ],
        systemPrompt: { default: "You are a helpful assistant." },
      },
    },
    set: vi.fn(),
  },
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
          data-testid={props["data-testid"]}
          disabled={props.disabled}
          onClick={() => {
            mockIsOpen = !mockIsOpen;
          }}
        >
          {props.children}
        </button>
      ),
      ValueText: (props: any) => <span>{props.placeholder || props.children}</span>,
      Indicator: (props: any) => <span>{props.children}</span>,
      Positioner: (props: any) => (
        <div data-part="positioner" style={{ display: mockIsOpen ? "block" : "none" }}>
          {props.children}
        </div>
      ),
      Content: (props: any) => (
        <div data-testid={props["data-testid"]}>{props.children}</div>
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
      setOpen: (open: boolean) => {
        mockIsOpen = open;
      },
    })),
  };
});


describe("HomeAgentForm — race regression (form/signal sync after mount)", () => {
  beforeEach(() => {
    if (signalHandles.setSelectedWorkspaceId) {
      signalHandles.setSelectedWorkspaceId(null);
    }
    mockIsOpen = false;
    sharedOnValueChanges = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("loadWorkspaces resolves AFTER home mount → textarea must become enabled", async () => {
    expect(signalHandles.setSelectedWorkspaceId).toBeTypeOf("function");

    if (signalHandles.setSelectedWorkspaceId) {
      signalHandles.setSelectedWorkspaceId(null);
    }

    const { getByTestId } = render(() => <HomeAgentForm />);

    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    if (signalHandles.setSelectedWorkspaceId) {
      signalHandles.setSelectedWorkspaceId("ws-1");
    }

    await waitFor(() => {
      expect(textarea.disabled).toBe(false);
    }, { timeout: 1000 });
  });
});
