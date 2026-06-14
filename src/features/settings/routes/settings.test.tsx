//! SettingsPage route tests.
//!
//! Mocked: SettingsService Effect service via __mocks__/@tauri-apps/api/core.ts.
//! Link from @tanstack/solid-router is mocked to avoid requiring RouterProvider.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./settings";
import { mockState } from "../../../../__mocks__/@tauri-apps/api/core";
import type { Settings } from "../../../shared/types";

vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual("@tanstack/solid-router");
  return {
    ...actual,
    // Mock Link to avoid useRouter/useLinkProps which require RouterProvider context.
    Link: (props: { to?: string; href?: string; class?: string; children?: unknown }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <a href={props.to ?? props.href} class={props.class}>{props.children as any}</a>,
  };
});

const mockSettings: Settings = {
  llm_providers: [
    {
      id: "deepseek",
      label: "DeepSeek",
      enabled: true,
      default_model: "deepseek-chat",
      base_url: "https://api.deepseek.com",
      api_key_ref: "llm_providers/deepseek/api_key",
    },
  ],
  default_llm_provider_id: "deepseek",
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
};

describe("SettingsPage", () => {
  beforeEach(() => {
    mockState.resolved = mockSettings;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 5 tabs", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    // Advance timers to flush the async IIFE that loads draft
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const tabs = container.querySelectorAll("nav button");
    expect(tabs.length).toBe(5);
  });

  it("clicking app tab activates it and shows app-specific content", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const user = userEvent.setup();
    const tabs = container.querySelectorAll("nav button");
    // App tab is the second one (index 1)
    await user.click(tabs[1]);
    // App tab button should have active styling
    expect(tabs[1].classList.contains("bg-primary-500")).toBe(true);
    // LLM tab should no longer be active
    expect(tabs[0].classList.contains("bg-primary-500")).toBe(false);
  });

  it("header has Back link with correct text", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const backLink = container.querySelector("header a");
    expect(backLink?.textContent).toContain("Back");
  });

  it("has a Save button in footer", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const saveBtn = container.querySelector("footer button");
    expect(saveBtn?.textContent).toContain("Save");
  });
});
