//! SettingsModal component tests.
//!
//! Mocked: SettingsService Effect service.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("LLM tab is the default", () => {
    const { container } = render(() => <SettingsModal onClose={vi.fn()} />);
    const llmTab = container.querySelector(".settings-modal__tab--active");
    expect(llmTab?.textContent).toBe("LLM");
  });

  it("clicking another tab switches content", async () => {
    const user = userEvent.setup();
    const { container } = render(() => <SettingsModal onClose={vi.fn()} />);
    const appTab = container.querySelectorAll(".settings-modal__tab")[1]; // "App" tab
    await user.click(appTab);
    expect(appTab.classList.contains("settings-modal__tab--active")).toBe(true);
    // App tab content should show start_at_login checkbox
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
  });

  it("shows advanced tab with clear history button", async () => {
    const user = userEvent.setup();
    const { container } = render(() => <SettingsModal onClose={vi.fn()} />);
    const advancedTab = container.querySelectorAll(".settings-modal__tab")[4]; // "Advanced" tab
    await user.click(advancedTab);
    expect(advancedTab.classList.contains("settings-modal__tab--active")).toBe(true);
    const clearBtn = container.querySelector("button");
    expect(clearBtn?.textContent).toContain("Clear all history");
  });
});