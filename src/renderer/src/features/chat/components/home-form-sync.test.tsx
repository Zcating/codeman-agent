//! home-form-sync.test.tsx — Regression test for the form/signal sync race in
//! `HomeAgentForm` (T2 of the textarea-disabled bug).
//!
//! ## Background
//!
//! `chat.store.loadWorkspaces()` runs **after** `HomeAgentForm` mounts (see
//! `src/index.tsx:32-58`). `createForm()` captures `defaultValues.workspaceId`
//! from `initialWorkspaceId()` which reads `selectedWorkspaceId$()` **once** —
//! at that moment, the signal is still `null` because no workspaces have loaded.
//!
//! Even after the upstream fix in `chat.store.ts:510-511` (auto-select on 1
//! workspace) sets the signal, the form's `state.values.workspaceId` stays `""`.
//! The textarea is gated by `form.state.values.workspaceId === ""` so it remains
//! disabled.
//!
//! ## Why this file (not part of home.test.tsx)
//!
//! `home.test.tsx` hoists a `createSignal` inside `vi.hoisted(require("solid-js"))`,
//! which resolves via Node CJS and creates a **second** Solid instance — not the
//! same one production code's `import { ... } from "solid-js"` uses. Solid's
//! runtime warns "You appear to have multiple instances of Solid" because the
//! signal's store is bound to one Solid, while `createEffect` in `home.tsx`
//! subscribes in a different one — the setter doesn't re-fire the effect.
//!
//! For this test we need a real Solid signal reachable from production code.
//! The cleanest fix is `vi.mock` with `await import("solid-js")` so the same
//! module graph is used.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@solidjs/testing-library";
import { HomeAgentForm } from "@codeman-frontend/features/chat/components/home";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";

// ─── Shared signal handle (hoisted to be visible inside vi.mock factory) ────

// We cannot create the signal inside `vi.hoisted` because `require("solid-js")`
// resolves via CJS (separate instance). Instead, vi.hoisted only carries the
// SETTER handle; vi.mock factory builds the signal via `await import("solid-js")`
// (ESM, same graph as production), then assigns the setter here.
const signalHandles = vi.hoisted(() => ({
  setSelectedWorkspaceId: null as ((id: string | null) => void) | null,
}));

// ─── Mock chat.store (with same-instance Solid signal) ──────────────────────

vi.mock("../stores/chat.store", async () => {
  const { createSignal } = await import("solid-js");
  const [getSelected, setSelected] = createSignal<string | null>(null);

  // Expose setter to test body via hoisted handle.
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── Mock codeman-toast (HomeAgentForm imports it) ──────────────────────────

vi.mock("../../../shared/components/internal/codeman-toast", () => ({
  codemanToast: { error: vi.fn(), success: vi.fn() },
  ToasterMount: () => null,
}));

// ─── Mock @tanstack/solid-router (HomeAgentForm uses useNavigate) ────────────

vi.mock("@tanstack/solid-router", () => ({
  useNavigate: vi.fn(() => (_opts: { to: string }) => undefined),
}));

// ─── Mock settings-saver ────────────────────────────────────────────────────

vi.mock("../../settings/lib/settings-saver", () => ({
  settingsSaver: {
    scheduleSave: vi.fn(),
    cancelPending: vi.fn(),
    flushNow: vi.fn(),
  },
}));

// ─── Mock appStore ──────────────────────────────────────────────────────────

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
                  deprecated: false,
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

// ─── Mock @ark-ui/solid Select (jsdom doesn't run real Ark UI portals) ──────

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

// ─── Tests ─────────────────────────────────────────────────────────────────

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
    // Sanity: ensure the signal handle is wired (vi.mock factory ran).
    expect(signalHandles.setSelectedWorkspaceId).toBeTypeOf("function");

    // Boot-state pre-loadWorkspaces: no selection, no real workspaces yet
    // (mocked workspaces$() returns 1 item unconditionally, but the signal
    // being null drives the race — see home.tsx:107 initialWorkspaceId).
    if (signalHandles.setSelectedWorkspaceId) {
      signalHandles.setSelectedWorkspaceId(null);
    }

    const { getByTestId } = render(() => <HomeAgentForm />);

    // Pre-condition: with selectedWorkspaceId$ = null at createForm() time,
    // form.state.values.workspaceId === "" → textarea is disabled.
    const textarea = getByTestId("codex-input") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    // Simulate chat.store.loadWorkspaces() resolving AFTER mount:
    // setSelectedWorkspaceId(ws.id) is the trigger fired by chat.store.ts:510-511.
    // Workspaces$() already returns 1 item from our mock.
    if (signalHandles.setSelectedWorkspaceId) {
      signalHandles.setSelectedWorkspaceId("ws-1");
    }

    // The fix (createEffect on signal → form.setFieldValue) must propagate
    // the new selection into the form so `isInputDisabled()` flips to false
    // and the textarea unlocks.
    await waitFor(() => {
      expect(textarea.disabled).toBe(false);
    }, { timeout: 1000 });
  });
});
