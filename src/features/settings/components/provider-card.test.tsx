//! ProviderCard 组件测试。
//!
//! Mocked: LLMProviderService Effect 服务（通过直接导入）。

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { ProviderCard } from "./provider-card";
import type { LLMProvider } from "../../../shared/types";
import { mockState } from "../../../shared/shared-mock-state";

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

  it("渲染全部 6 个控件", () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onChange={onChange} onDelete={onDelete} />
    ));

    // Card 渲染为 rounded-lg border（Card 7 子组件）
    expect(container.querySelector('[class*="rounded-lg"][class*="border"]')).toBeTruthy();

    // enabled checkbox
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();

    // label span
    const labelSpan = Array.from(container.querySelectorAll('span')).find(s => s.textContent === "DeepSeek");
    expect(labelSpan?.textContent).toBe("DeepSeek");

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
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === "Delete");
    expect(deleteBtn?.textContent).toBe("Delete");
  });

  it('"Set API key" 按钮切换输入字段', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onChange={onChange} onDelete={onDelete} />
    ));

    // 初始时，无 API key 输入可见（显示按钮）
    const setKeyBtn = container.querySelector('button');
    expect(setKeyBtn?.textContent).toContain("Set API key");

    // 点击 "Set API key"
    await user.click(setKeyBtn!);

    // 现在应显示 password 输入框 + Save + Cancel 按钮
    const passwordInput = container.querySelector('input[type="password"]');
    expect(passwordInput).toBeTruthy();

    const allBtns = container.querySelectorAll("button");
    expect(allBtns[0].textContent).toBe("Save");
    expect(allBtns[1].textContent).toBe("Cancel");
  });

  it("点击 Test 在未设置 API key 时显示失败状态", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ProviderCard provider={mockProvider} onChange={onChange} onDelete={onDelete} />
    ));

    const testBtn = container.querySelectorAll("button")[1];
    await user.click(testBtn!);

    // Status span 显示失败消息
    const status = Array.from(container.querySelectorAll('span')).find(s => s.textContent === "Set API key first");
    expect(status?.textContent).toBe("Set API key first");
  });
});
