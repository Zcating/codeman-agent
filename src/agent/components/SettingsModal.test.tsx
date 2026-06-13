//! SettingsModal component tests.
//!
//! Mocked: SettingsService Effect service.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "./SettingsModal";
import { mockState } from "../../shared-mock-state";
import type { Settings } from "../../lib/types";

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
  start_minimized: false,
  close_behavior: "hide_to_tray",
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 800, height: 600 },
    min_size: { width: 600, height: 400 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  hotkeys: { toggle_window: "Ctrl+Shift+Space", new_conversation: "Ctrl+Shift+N", open_settings: "Ctrl+Shift+," },
  billing_providers: [],
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
};

describe("SettingsModal", () => {
  beforeEach(() => {
    mockState.resolved = mockSettings;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("LLM tab is the default", () => {
    const { container } = render(() => <SettingsModal onClose={vi.fn()} />);
    const llmTab = container.querySelector("button.bg-primary-500");
    expect(llmTab?.textContent).toBe("LLM");
  });

  it("clicking another tab switches content", async () => {
    const user = userEvent.setup();
    const { container } = render(() => <SettingsModal onClose={vi.fn()} />);
    const tabs = container.querySelectorAll("nav button");
    const appTab = tabs[1]; // "App" tab
    await user.click(appTab);
    expect(appTab.classList.contains("bg-primary-500")).toBe(true);
    // App tab content should show start_at_login checkbox
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
  });

  it("shows advanced tab with clear history button", async () => {
    const user = userEvent.setup();
    const { container } = render(() => <SettingsModal onClose={vi.fn()} />);
    const tabs = container.querySelectorAll("nav button");
    const advancedTab = tabs[4]; // "Advanced" tab
    await user.click(advancedTab);
    expect(advancedTab.classList.contains("bg-primary-500")).toBe(true);
    // Look for the clear history button within the advanced section (Privacy h3)
    const privacyHeading = container.querySelector("h3");
    expect(privacyHeading?.textContent).toBe("Privacy");
    // The Clear all history button is in the body section, find by text content
    const allButtons = container.querySelectorAll("button");
    const clearBtn = Array.from(allButtons).find((btn) => btn.textContent?.includes("Clear all history"));
    expect(clearBtn).toBeTruthy();
  });
});
