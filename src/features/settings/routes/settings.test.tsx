//! SettingsPage 路由测试 (V1.5)。
//!
//! Mocked: SettingsService Effect 服务（通过 src/__mocks__/@tauri-apps/api/core.ts）。
//! V1.5: 测试 providers[] 渲染，空状态、2 providers 场景。
//! Link 从 @tanstack/solid-router mock 以避免需要 RouterProvider。

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { SettingsPage } from "./settings";
import { mockState, SettingsV15 } from "../../../__mocks__/@tauri-apps/api/core";
import type { Provider } from "../../../shared/lib/types";

vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual("@tanstack/solid-router");
  return {
    ...actual,
    // Mock Link 以避免需要 useRouter/useLinkProps（需要 RouterProvider context）。
    Link: (props: { to?: string; href?: string; class?: string; children?: unknown }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <a href={props.to ?? props.href} class={props.class}>
        {props.children as any}
      </a>
    ),
  };
});

// V1.5 mock providers
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
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
  billing: {
    kind: "plan_quota",
    billing_api_key_ref: "billing/minimax/api_key",
  },
};

const mockDeepSeekProvider: Provider = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: true,
  llm: {
    default_model: "deepseek-chat",
    base_url: "https://api.deepseek.com/anthropic",
    api_type: "anthropic-messages",
    llm_api_key_ref: "llm_providers/deepseek/api_key",
    models: [{ id: "deepseek-chat", label: "DeepSeek Chat", deprecated: false, thinking: false }],
    models_endpoint: "https://api.deepseek.com/anthropic/v1/models",
  },
  billing: {
    kind: "balance",
    billing_api_key_ref: "billing/deepseek/api_key",
  },
};

const baseSettings: SettingsV15 = {
  providers: [],
  schema_version: "1.5",
  default_llm_provider_id: "minimax",
  user_language: "en",
  theme: "dark",
  start_at_login: false,
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 800, height: 600 },
    min_size: { width: 600, height: 400 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  billing_providers: [],
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
  llm_providers: [],
};

describe("SettingsPage — V1.5 provider rendering", () => {
  beforeEach(() => {
    // Reset to default V1.5 settings with 1 provider (MiniMax)
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider],
    };
    // Clear resolved so the mock handler is used
    mockState.resolved = undefined;
    mockState.v0FixtureActive = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 1 card for 1 provider (MiniMax)", async () => {
    render(() => <SettingsPage />);
    // Wait for async loading to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // MiniMax provider card should be visible
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    // Should NOT show empty state
    expect(screen.queryByText(/No providers configured/i)).not.toBeInTheDocument();
  });

  it("renders 2 cards for 2 providers", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
    };

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
  });

  it("shows empty state when providers[] is empty", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [],
    };

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText(/No providers configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Add your first provider/i)).toBeInTheDocument();
  });

  it("renders 5 tabs", async () => {
    const { container } = render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const tabs = container.querySelectorAll("nav button");
    expect(tabs.length).toBe(5);
  });

  it("header has Back link with correct text", async () => {
    const { container } = render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const backLink = container.querySelector("header a");
    expect(backLink?.textContent).toContain("Back");
  });

  it("footer has Save button", async () => {
    const { container } = render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const saveBtn = container.querySelector("footer button");
    expect(saveBtn?.textContent).toContain("Save");
  });
});
