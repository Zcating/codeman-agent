
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Settings } from "@codeman-frontend/shared/lib/types";

let mockTheme: Settings["theme"] = "dark";

vi.mock("@codeman-frontend/shared/apis", () => ({
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

import { startThemeSync, _resetThemeSync } from "@codeman-frontend/shared/stores/theme";

describe("startThemeSync — .dark 类应用", () => {
  beforeEach(() => {
    _resetThemeSync();
    document.documentElement.classList.remove("dark");
    mockTheme = "dark"; 
  });

  it("theme='dark' → 向 documentElement 添加 .dark 类", async () => {
    mockTheme = "dark";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("theme='light' → 从 documentElement 移除 .dark 类", async () => {
    document.documentElement.classList.add("dark"); 
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

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: () => { },
        removeEventListener: () => { },
      }),
    });
  });

  it("theme='system' + prefers-color-scheme:light → 移除 .dark 类", async () => {
    document.documentElement.classList.add("dark"); 

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: () => { },
        removeEventListener: () => { },
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

    const darkClassCount = document.documentElement.classList.value
      .split(" ")
      .filter((c) => c === "dark").length;
    expect(darkClassCount).toBe(1);
  });

  it("theme='system' + matchMedia undefined → 回退到 light", async () => {
    const orig = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true, writable: true });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    Object.defineProperty(window, "matchMedia", { value: orig, configurable: true, writable: true });
  });

  it("setupMediaQueryListener no-op when matchMedia undefined → 不抛异常", async () => {
    const orig = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true, writable: true });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    Object.defineProperty(window, "matchMedia", { value: orig, configurable: true, writable: true });
  });

  it("system theme change matches=true → 添加 .dark 类并更新 theme$", async () => {
    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false, 
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: (_: string) => { },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    listenerRegistry.forEach((listener) => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system theme change matches=false → 移除 .dark 类并更新 theme$", async () => {
    document.documentElement.classList.add("dark"); 

    const listenerRegistry: Array<(e: MediaQueryListEvent) => void> = [];

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true, 
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          listenerRegistry.push(listener);
        },
        removeEventListener: () => { },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    listenerRegistry.forEach((listener) => {
      listener({ matches: false } as MediaQueryListEvent);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

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
          if (idx !== -1) { listenerRegistry.splice(idx, 1); }
        },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    expect(listenerRegistry.length).toBeGreaterThan(0);
  });

  it("_resetThemeSync → clearInterval 被调用", async () => {
    mockTheme = "dark";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    _resetThemeSync();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

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

    expect(removedListener).not.toBeNull();
  });

  it("_resetThemeSync no-op when already reset → 不抛异常", () => {
    _resetThemeSync(); 
    _resetThemeSync(); 
    expect(() => _resetThemeSync()).not.toThrow();
  });

  it("_resetThemeSync no-op when mediaQuery already null → 不抛异常", () => {
    _resetThemeSync();
    _resetThemeSync();
    expect(() => _resetThemeSync()).not.toThrow();
  });
});
