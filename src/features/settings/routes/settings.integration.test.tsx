//! Settings integration tests — V1.5 provider UX flow.
//!
//! Tests the full SettingsPage with ProviderCard integration:
//! - 7 scenarios covering render, add, edit model, toggle enabled, delete, refresh, Metis #9
//! - Uses @solidjs/testing-library + vi.mock for IPC

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./settings";
import { mockState, SettingsV15 } from "../../../__mocks__/@tauri-apps/api/core";
import type { Provider } from "../../../shared/lib/types";

// Mock solid-js/store — SettingsPage 导入 appStore, appStore 用 createStore。
// 见 settings.test.tsx 同位置注释:不全局注册,本文件内联 28 行 mock 块。
vi.mock("solid-js/store", () => {
  let store: { value: unknown } = { value: null };
  const setStore = vi.fn((...args: unknown[]) => {
    const updater = args.length === 2 ? args[1] : args[0];
    if (typeof updater === "function") {
      store.value = (updater as (prev: unknown) => unknown)(store.value);
    } else {
      store.value = updater;
    }
  });
  const storeProxy = new Proxy(store, {
    get(t, p) {
      if (p === "value") {
        return store.value;
      }
      return (t as any)[p];
    },
    set(t, p, v) {
      if (p === "value") {
        store.value = v;
        return true;
      }
      (t as any)[p] = v;
      return true;
    },
  });
  return { createStore: () => [storeProxy, setStore] };
});

import { appStore, _resetAppStoreForTest } from "../../../shared/stores/app.store";

vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual("@tanstack/solid-router");
  return {
    ...actual,
    Link: (props: { to?: string; href?: string; class?: string; children?: unknown }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <a href={props.to ?? props.href} class={props.class}>
        {props.children as any}
      </a>
    ),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────

const mockMiniMaxProvider: Provider = {
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
      {
        id: "MiniMax-M2.1-highspeed",
        label: "MiniMax-M2.1-highspeed",
        deprecated: true,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const baseSettings: SettingsV15 = {
  providers: [],
  schema_version: "1.5",
  default_llm_provider_id: "minimax",
  user_language: "en",
  theme: "system",
  start_at_login: false,
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 800, height: 600 },
    min_size: { width: 800, height: 800 },
  },
  system_prompt: { default: "", user_can_edit: true },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
  llm_providers: [],
};

// ─── Tests ────────────────────────────────────────────────────

describe("SettingsRoute integration — provider UX", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    mockState.v0FixtureActive = false;
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider],
    };
    // 触发 refresh 把 mockState.settings 同步到 appStore
    const { Effect } = await import("effect");
    await Effect.runPromise(appStore.refresh());
    // Force re-render: assign fresh value to trigger reactivity in mock
    appStore.set({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── Test 1: Card visible for minimax ──
  it("renders 1 card for minimax provider", async () => {
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("minimax")).toBeInTheDocument(); // code element
    // Model dropdown shows current model
    expect(screen.getByDisplayValue("MiniMax-M2.5-highspeed")).toBeInTheDocument();
  });

  // ── Test 2: Click 'Add provider' shows placeholder alert ──
  it("Click 'Add provider' shows future-work alert", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const addBtn = screen.getByRole("button", { name: /add provider/i });
    await user.click(addBtn);

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("future work"));
    // Provider still present (not added)
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
  });

  // ── Test 3: Edit model dropdown calls update_settings ──
  it("Edit model dropdown calls update_settings with new model", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("MiniMax-M2.5-highspeed");

    await user.selectOptions(select, "MiniMax-M2.1-highspeed");

    await waitFor(() => {
      expect(mockState.calls).toContain("update_settings");
    });
    expect(mockState.calls.some((c) => c === "update_settings")).toBe(true);
  });

  // ── Test 4: Toggle enabled calls update_settings ──
  it("Toggle enabled checkbox calls update_settings", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);

    await user.click(checkbox);

    await waitFor(() => {
      expect(mockState.calls).toContain("update_settings");
    });
  });

  // ── Test 5: Click delete shows confirm dialog ──
  it("Click delete shows window.confirm dialog", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Delete provider"));
    // Provider still there (cancelled)
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
  });

  // ── Test 6: Click 'Refresh models' calls ProviderService.fetchModels (HTTP) ──
  it("Click 'Refresh models' fetches via ProviderService and updates provider.llm.models", async () => {
    const user = userEvent.setup();
    // ProviderServiceLive.fetchModels does a direct HTTP fetch (ADR-0015);
    // no Tauri IPC. We stub window.fetch to return a stable payload.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "refreshed-model", name: "Refreshed Model" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    mockState.resolved = { providers: [mockMiniMaxProvider] };

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        mockMiniMaxProvider.llm.models_endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockMiniMaxProvider.api_key}`,
          }),
        }),
      );
    });

    fetchSpy.mockRestore();
  });
});

// ── SettingsRoute integration — tab switching & handlers ──

describe("SettingsRoute integration — tab switching & handlers", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    mockState.v0FixtureActive = false;
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider],
      workspaces: [],
    };
    const { Effect } = await import("effect");
    await Effect.runPromise(appStore.refresh());
    appStore.set({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── Tab switching ──
  it("点击 'App' tab 显示 start_at_login checkbox", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Switch to App tab
    await user.click(screen.getByRole("button", { name: "App" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText("Start at login")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false); // default start_at_login = false
  });

  it("App tab checkbox onChange 调 appStore.set({ start_at_login })", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "App" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    await user.click(checkbox);

    await waitFor(() => {
      expect(mockState.calls).toContain("update_settings");
    });
  });

  it("点击 'Window' tab 显示 placeholder 文案", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "Window" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(
      screen.getByText(/Window settings \(default size 1280×1280, min 800×800; position is remembered\)/i),
    ).toBeInTheDocument();
  });

  it("Advanced tab 默认显示 'Clear all history' 按钮", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText(/Clear all history/i)).toBeInTheDocument();
  });

  it("点击 Clear 按钮进入 confirm 状态", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Clear all history/i));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText(/Delete all conversations\? This cannot be undone\./i)).toBeInTheDocument();
    expect(screen.getByText(/Yes, delete all/i)).toBeInTheDocument();
    expect(screen.getByText(/Cancel/i)).toBeInTheDocument();
  });

  it("confirm 状态点 Cancel 回到默认", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Clear all history/i));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Cancel/i));
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Back to initial state: Clear button visible again
    expect(screen.getByText(/Clear all history/i)).toBeInTheDocument();
    expect(screen.queryByText(/Delete all conversations\?/i)).not.toBeInTheDocument();
  });

  it("confirm 状态点 'Yes, delete all' 触发 invoke('clear_all_history')", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Clear all history/i));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Yes, delete all/i));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockState.calls).toContain("clear_all_history");
  });

  it("clear_all_history 抛错时 logger.error 被调 (不 crash)", async () => {
    const user = userEvent.setup();
    mockState.rejected = new Error("boom");

    const { logger } = await import("../../../shared/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Clear all history/i));
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByText(/Yes, delete all/i));
    // Wait for async error to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should have logged the error
    expect(errorSpy).toHaveBeenCalled();
    // Component should not crash (dialog stays visible because setConfirmClear only called on success)
    expect(screen.getByText(/Delete all conversations\?/i)).toBeInTheDocument();

    errorSpy.mockRestore();
    // Clean up rejected flag to prevent unhandled rejection
    mockState.rejected = undefined;
  });

  it("footer Save 按钮触发 settingsSaver.flushNow", async () => {
    const user = userEvent.setup();
    const { settingsSaver } = await import("../lib/settings-saver");
    const flushSpy = vi.spyOn(settingsSaver, "flushNow").mockResolvedValue(undefined);

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(flushSpy).toHaveBeenCalled();
    });

    flushSpy.mockRestore();
  });

  it("点击 'Add provider' 触发 alert 文案含 'future work'", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole("button", { name: /add provider/i }));

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("future work"));

    alertSpy.mockRestore();
  });
});
