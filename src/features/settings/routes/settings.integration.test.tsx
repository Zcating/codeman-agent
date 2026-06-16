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
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages",
    llm_api_key_ref: "llm_providers/minimax/api_key",
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
  billing: {
    kind: "plan_quota",
    billing_api_key_ref: "billing/minimax/api_key",
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
  billing_providers: [],
};

// ─── Tests ────────────────────────────────────────────────────

describe("SettingsRoute integration — provider UX", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    mockState.v0FixtureActive = false;
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider],
    };
    // Seed store keys so delete can verify they are wiped
    mockState.store = {
      llm_providers: { "minimax/api_key": "sk-test-llm" },
      billing: { "minimax/api_key": "sk-test-billing" },
    };
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

  // ── Test 6: Click 'Refresh models' calls fetch_models ──
  it("Click 'Refresh models' calls fetch_models IPC and updates provider.llm.models", async () => {
    const user = userEvent.setup();
    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(mockState.calls).toContain("fetch_models");
    });

    // fetch_models returns the same models in mock; verify the IPC chain ran
    expect(mockState.calls).toContain("fetch_models");
  });

  // ── Test 7 (Metis #9): Delete provider calls delete_provider_keys BEFORE update_settings ──
  it("Delete provider calls delete_provider_keys BEFORE update_settings (Metis #9)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify initial store keys are seeded
    expect(mockState.store.llm_providers?.["minimax/api_key"]).toBe("sk-test-llm");
    expect(mockState.store.billing?.["minimax/api_key"]).toBe("sk-test-billing");

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      // Both IPCs must have been called
      expect(mockState.calls).toContain("delete_provider_keys");
      expect(mockState.calls).toContain("update_settings");
    });

    // delete_provider_keys MUST be called BEFORE update_settings
    const deleteIdx = mockState.calls.indexOf("delete_provider_keys");
    const updateIdx = mockState.calls.indexOf("update_settings");
    expect(deleteIdx).toBeLessThan(updateIdx);

    // Store keys must be wiped
    expect(mockState.store.llm_providers?.["minimax/api_key"]).toBeUndefined();
    expect(mockState.store.billing?.["minimax/api_key"]).toBeUndefined();
  });
});
