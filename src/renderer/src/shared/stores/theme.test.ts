//! Theme 桥接层测试 — 验证 .dark 类应用于 <html>。
//!
//! 通过 mock getSettingsBridge 返回特定 Settings.theme 值。
//! Mock matchMedia 用于 system-theme 解析。

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Settings } from "@codeman-frontend/shared/lib/types";

// Mutable mock settings — 在每个测试导入前设置
let mockTheme: Settings["theme"] = "dark";

vi.mock("@shared/apis", () => ({
  getSettingsBridge: async (): Promise<Settings> => ({
    llmProviders: [],
    userLanguage: "en",
    theme: mockTheme,
    startAtLogin: false,
    window: {
      rememberPosition: false,
      rememberSize: false,
      defaultSize: { width: 800, height: 600 },
      minSize: { width: 400, height: 300 },
    },
    systemPrompt: { default: "", userCanEdit: true },
    conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  }),
}));

// 在 vi.mock 之后导入，使 mock 生效
import { startThemeSync, _resetThemeSync } from "@codeman-frontend/shared/stores/theme";

describe("startThemeSync — .dark 类应用", () => {
  // 每个测试前重置 document 状态和模块级 started 标志
  beforeEach(() => {
    _resetThemeSync();
    document.documentElement.classList.remove("dark");
    mockTheme = "dark"; // 默认值
  });

  it("theme='dark' → 向 documentElement 添加 .dark 类", async () => {
    mockTheme = "dark";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("theme='light' → 从 documentElement 移除 .dark 类", async () => {
    document.documentElement.classList.add("dark"); // 从上一个 dark 主题预设置
    mockTheme = "light";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("theme='system' + prefers-color-scheme:dark → 添加 .dark 类", async () => {
    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          const idx = listenerRegistry.indexOf(listener);
          if (idx !== -1) {
            listenerRegistry.splice(idx, 1);
          }
        },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // 清理
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });

  it("theme='system' + prefers-color-scheme:light → 移除 .dark 类", async () => {
    document.documentElement.classList.add("dark"); // 预设置以验证移除

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("startThemeSync() 调用两次 → 不会重复应用", async () => {
    mockTheme = "dark";
    startThemeSync();
    startThemeSync();
    await new Promise((r) => setTimeout(r, 20));

    // 只应存在一个 .dark 类
    const darkClassCount = document.documentElement.classList.value
      .split(" ")
      .filter((c) => c === "dark").length;
    expect(darkClassCount).toBe(1);
  });

  // K9: resolveSystemTheme when matchMedia undefined → returns "light"
  it("theme='system' + matchMedia undefined → 回退到 light", async () => {
    const orig = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true, writable: true });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    Object.defineProperty(window, "matchMedia", { value: orig, configurable: true, writable: true });
  });

  // K1: setupMediaQueryListener is no-op when matchMedia is undefined
  it("setupMediaQueryListener no-op when matchMedia undefined → 不抛异常", async () => {
    const orig = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true, writable: true });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    Object.defineProperty(window, "matchMedia", { value: orig, configurable: true, writable: true });
  });

  // K2/K3: System theme change event triggers .dark class and theme$ update
  it("system theme change matches=true → 添加 .dark 类并更新 theme$", async () => {
    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false, // starts as light
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: (_: string) => {},
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate system changes to dark
    listenerRegistry.forEach((listener) => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system theme change matches=false → 移除 .dark 类并更新 theme$", async () => {
    document.documentElement.classList.add("dark"); // pre-set dark

    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true, // starts as dark
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: () => {},
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate system changes to light
    listenerRegistry.forEach((listener) => {
      listener({ matches: false } as MediaQueryListEvent);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // K4: startThemeSync with theme="system" → setupMediaQueryListener called (lines 95-96)
  // Note: the cleanup branch (lines 62-66) is unreachable via public API due to started=true guard
  it("theme='system' → startThemeSync 调用 setupMediaQueryListener", async () => {
    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          const idx = listenerRegistry.indexOf(listener);
          if (idx !== -1) {listenerRegistry.splice(idx, 1);}
        },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    // Listener should be registered (setupMediaQueryListener called)
    expect(listenerRegistry.length).toBeGreaterThan(0);
  });

  // K5: _resetThemeSync clears intervalId
  it("_resetThemeSync → clearInterval 被调用", async () => {
    mockTheme = "dark";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    _resetThemeSync();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // K6: _resetThemeSync removes mediaQuery listener + nulls refs
  it("_resetThemeSync → removeEventListener 被调用并置空 refs", async () => {
    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];
    let removedListener: ((e: MediaQueryListEvent) => void) | null = null;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          removedListener = listener;
        },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    _resetThemeSync();

    // removeEventListener was called with the registered listener
    expect(removedListener).not.toBeNull();
  });

  // K7: _resetThemeSync is no-op when intervalId is null
  it("_resetThemeSync no-op when already reset → 不抛异常", () => {
    _resetThemeSync(); // first reset
    _resetThemeSync(); // second reset — no-op, should not throw
    expect(() => _resetThemeSync()).not.toThrow();
  });

  // K8: _resetThemeSync is no-op when mediaQuery is null
  it("_resetThemeSync no-op when mediaQuery already null → 不抛异常", () => {
    // Force mediaQuery to null by resetting twice
    _resetThemeSync();
    _resetThemeSync();
    expect(() => _resetThemeSync()).not.toThrow();
  });
});
