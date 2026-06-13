//! ProviderCard component tests.
//!
//! Mocked: LLMProviderService Effect service via direct import.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { ProviderCard } from "./ProviderCard";
import type { LLMProvider } from "../../lib/types";
import { mockState } from "../../shared-mock-state";

const mockProvider: LLMProvider = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: true,
  default_model: "deepseek-chat",
  base_url: "https://api.deepseek.com",
  api_key_ref: "llm_providers/deepseek/api_key",
};

describe("ProviderCard", () => {
  beforeEach(() => {
    mockState.resolved = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders all 6 controls", () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onChange={onChange} onDelete={onDelete} />
    ));

    // enabled checkbox
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();

    // label span
    expect(container.querySelector(".provider-card__label")?.textContent).toBe("DeepSeek");

    // model input
    const modelInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement | null;
    expect(modelInput?.value).toBe("deepseek-chat");

    // base_url input
    const baseUrlInput = container.querySelectorAll('input[type="text"]')[1] as HTMLInputElement | null;
    expect(baseUrlInput?.value).toBe("https://api.deepseek.com");

    // Set API key button
    const setKeyBtn = container.querySelector('button');
    expect(setKeyBtn?.textContent).toContain("Set API key");

    // Test button
    const testBtn = container.querySelectorAll("button")[1];
    expect(testBtn?.textContent).toBe("Test");

    // Delete button
    const deleteBtn = container.querySelector(".provider-card__delete");
    expect(deleteBtn?.textContent).toBe("Delete");
  });

  it('"Set API key" button toggles the input field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onChange={onChange} onDelete={onDelete} />
    ));

    // Initially, no API key input visible (button is shown)
    const setKeyBtn = container.querySelector('button');
    expect(setKeyBtn?.textContent).toContain("Set API key");

    // Click "Set API key"
    await user.click(setKeyBtn!);

    // Now the password input + Save + Cancel buttons should be visible
    const passwordInput = container.querySelector('input[type="password"]');
    expect(passwordInput).toBeTruthy();

    const allBtns = container.querySelectorAll("button");
    expect(allBtns[0].textContent).toBe("Save");
    expect(allBtns[1].textContent).toBe("Cancel");
  });

  it("clicking Test shows fail status when no API key set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onChange={onChange} onDelete={onDelete} />
    ));

    const testBtn = container.querySelectorAll("button")[1];
    await user.click(testBtn!);

    // Since hasApiKey returns false, test should show fail
    const status = container.querySelector(".provider-card__test-status--fail");
    expect(status?.textContent).toBe("Set API key first");
  });
});