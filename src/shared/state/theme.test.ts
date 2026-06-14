//! Theme bridge tests — verifies .dark class application on <html>.
//!
//! Mocks getSettingsBridge to return specific Settings.theme values.
//! Mocks matchMedia for system-theme resolution.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Settings } from "../types";

// Mutable mock settings — set in each test before importing
let mockTheme: Settings["theme"] = "dark";

vi.mock("../lib/tauri", () => ({
  getSettingsBridge: async (): Promise<Settings> => ({
    llm_providers: [],
    user_language: "en",
    theme: mockTheme,
    start_at_login: false,
    window: {
      remember_position: false,
      remember_size: false,
      default_size: { width: 800, height: 600 },
      min_size: { width: 400, height: 300 },
    },
    system_prompt: { default: "", user_can_edit: true },
    billing_providers: [],
    conversations: { auto_archive_after_days: 30, max_history: 1000 },
  }),
}));

// Import after vi.mock so the mock is applied
import { startThemeSync, _resetThemeSync } from "./theme";

describe("startThemeSync — .dark class application", () => {
  // Reset document state AND module-level started flag before each test
  beforeEach(() => {
    _resetThemeSync();
    document.documentElement.classList.remove("dark");
    mockTheme = "dark"; // default
  });

  it("theme='dark' → adds .dark class to documentElement", async () => {
    mockTheme = "dark";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("theme='light' → removes .dark class from documentElement", async () => {
    document.documentElement.classList.add("dark"); // Pre-set from previous dark theme
    mockTheme = "light";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("theme='system' + prefers-color-scheme:dark → adds .dark class", async () => {
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
          if (idx !== -1) listenerRegistry.splice(idx, 1);
        },
      }),
    });

    mockTheme = "system";
    startThemeSync();
    await new Promise((r) => setTimeout(r, 10));

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Cleanup
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

  it("theme='system' + prefers-color-scheme:light → removes .dark class", async () => {
    document.documentElement.classList.add("dark"); // Pre-set to verify removal

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

  it("startThemeSync() called twice → does not double-apply", async () => {
    mockTheme = "dark";
    startThemeSync();
    startThemeSync();
    await new Promise((r) => setTimeout(r, 20));

    // Only one .dark class should be present
    const darkClassCount = document.documentElement.classList.value.split(" ").filter((c) => c === "dark").length;
    expect(darkClassCount).toBe(1);
  });
});
