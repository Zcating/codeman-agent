//! ProviderCard V1.5 tests — 7 tests covering render, toggle, refresh, dropdown,
//! billing subform visibility, and delete wipes keys (Metis #9).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { ProviderCard } from "./provider-card";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";

// ─── Fixtures ─────────────────────────────────────────────────

const mockProvider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages" as const,
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
  billing: { kind: "plan_quota" as const, billing_api_key_ref: "billing/minimax/api_key" },
};

const mockProviderNoBilling = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: false,
  llm: {
    default_model: "deepseek-chat",
    base_url: "https://api.deepseek.com/anthropic",
    api_type: "anthropic-messages" as const,
    llm_api_key_ref: "llm_providers/deepseek/api_key",
    models: [{ id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false }],
    models_endpoint: "https://api.deepseek.com/models",
  },
};

// ─── Helpers ──────────────────────────────────────────────────

const renderCard = (provider = mockProvider) =>
  render(() => <ProviderCard provider={provider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

// ─── Tests ────────────────────────────────────────────────────

describe("ProviderCard", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── Test 1: renders 1 card with provider label ──
  it("renders 1 card with provider label and id", () => {
    renderCard();
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("minimax")).toBeInTheDocument(); // code element
  });

  // ── Test 2: enabled toggle calls update_settings ──
  it("toggling enabled checkbox calls update_settings with enabled=false", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />
    ));

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);

    await user.click(checkbox);

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "minimax", enabled: false }),
    );
  });

  // ── Test 3: Refresh models button calls fetch_models IPC ──
  it("Refresh models button calls fetch_models IPC", async () => {
    const user = userEvent.setup();
    renderCard();

    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);

    expect(mockState.calls).toContain("fetch_models");
  });

  // ── Test 4: model dropdown calls update_settings on change ──
  it("model dropdown calls update_settings with new model", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("MiniMax-M2.5-highspeed");

    await user.selectOptions(select, "MiniMax-M2.1-highspeed");

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "minimax",
        llm: expect.objectContaining({ default_model: "MiniMax-M2.1-highspeed" }),
      }),
    );
  });

  // ── Test 5: LLM-only provider hides billing subform ──
  it("LLM-only provider (no billing) hides billing subform", () => {
    render(() => (
      <ProviderCard provider={mockProviderNoBilling as any} onUpdate={vi.fn()} onDelete={vi.fn()} />
    ));

    // LLM section visible
    expect(screen.getByText("LLM")).toBeInTheDocument();
    // Billing section NOT visible
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });

  // ── Test 6: provider with billing renders billing subform ──
  it("provider with billing renders billing subform with kind dropdown", () => {
    renderCard();

    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Kind")).toBeInTheDocument();

    const selects = document.querySelectorAll("select");
    // 2 selects: model + billing kind
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  // ── Test 7: delete button wipes keys via delete_provider_keys IPC (Metis #9) ──
  it("delete button calls delete_provider_keys before update_settings", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    // Mock confirm to return true
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={onDelete} />);

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    // delete_provider_keys MUST be called BEFORE update_settings (Metis #9)
    const deleteIdx = mockState.calls.indexOf("delete_provider_keys");
    const updateIdx = mockState.calls.indexOf("update_settings");
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThan(deleteIdx);

    expect(onDelete).toHaveBeenCalledWith("minimax");
  });
});
