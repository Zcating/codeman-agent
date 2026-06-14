//! SettingsPage 路由测试。
//!
//! Mocked: SettingsService Effect 服务（通过 src/__mocks__/@tauri-apps/api/core.ts）。
//! Link 从 @tanstack/solid-router mock 以避免需要 RouterProvider。

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./settings";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";
import type { Settings } from "../../../shared/lib/types";

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

  it("渲染 5 个标签页", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    // 推进计时器以刷新加载 draft 的异步 IIFE
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const tabs = container.querySelectorAll("nav button");
    expect(tabs.length).toBe(5);
  });

  it("点击 app 标签页激活它并显示 app 特定内容", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const user = userEvent.setup();
    const tabs = container.querySelectorAll("nav button");
    // App 标签页是第二个（index 1）
    await user.click(tabs[1]);
    // App 标签页按钮应有 active 样式
    expect(tabs[1].classList.contains("bg-primary-500")).toBe(true);
    // LLM 标签页不应再处于激活状态
    expect(tabs[0].classList.contains("bg-primary-500")).toBe(false);
  });

  it("header 有带正确文本的 Back 链接", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const backLink = container.querySelector("header a");
    expect(backLink?.textContent).toContain("Back");
  });

  it("footer 有 Save 按钮", async () => {
    vi.useFakeTimers();
    const { container } = render(() => <SettingsPage />);
    vi.advanceTimersByTime(0);
    vi.useRealTimers();
    const saveBtn = container.querySelector("footer button");
    expect(saveBtn?.textContent).toContain("Save");
  });
});
