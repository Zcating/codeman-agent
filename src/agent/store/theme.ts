//! Effect → Solid bridge for theme.
//!
//! Bridges Settings.theme (light/dark/system) to <html class="dark">.
//! Tailwind v4 dark variant is triggered by the .dark class.
//!
//! UI surface:
//! - theme$: Accessor<"light" | "dark"> — resolved effective theme
//! - startThemeSync(): void — idempotent; starts polling + media listener

import { createSignal, type Accessor } from "solid-js";
import { getSettingsBridge } from "../../lib/tauri";

// Module-level state — survives multiple startThemeSync() calls within a session.
// Note: in dev this is never cleaned up (no onCleanup in the store pattern).
// Production use: call startThemeSync() once from ChatView onMount.
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let mediaQuery: MediaQueryList | null = null;
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

// Resolved theme signal — only ever "light" or "dark" (never "system")
const [theme, setTheme] = createSignal<"light" | "dark">("light");

/** UI-facing accessor for the resolved theme. */
export const theme$: Accessor<"light" | "dark"> = theme;

/** Resolve system preference to "light" or "dark". */
function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Resolve a Settings.theme value to the effective "light" or "dark". */
function resolveTheme(themeSetting: "light" | "dark" | "system"): "light" | "dark" {
  if (themeSetting === "system") {
    return resolveSystemTheme();
  }
  return themeSetting;
}

/** Apply .dark class to <html> based on resolved theme. */
function applyDarkClass(isDark: boolean): void {
  if (typeof document === "undefined") return;
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

/** Setup a single matchMedia listener for system theme. Idempotent — cleans up old listener first. */
function setupMediaQueryListener(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

  // Clean up any previous listener
  if (mediaQuery && mediaQueryListener) {
    mediaQuery.removeEventListener("change", mediaQueryListener);
    mediaQueryListener = null;
    mediaQuery = null;
  }

  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQueryListener = (e: MediaQueryListEvent) => {
    applyDarkClass(e.matches);
    setTheme(e.matches ? "dark" : "light");
  };
  mediaQuery.addEventListener("change", mediaQueryListener);
}

/**
 * Idempotent theme sync.
 *
 * Reads Settings.theme via getSettingsBridge(), applies .dark class to <html>,
 * subscribes to system preference changes if theme is "system", and polls
 * Settings.theme every 5s to re-apply on user change.
 *
 * Safe to call multiple times — only the first call has effect.
 */
export function startThemeSync(): void {
  if (started) return;
  started = true;

  const applyTheme = async () => {
    const settings = await getSettingsBridge();
    const resolved = resolveTheme(settings.theme);
    applyDarkClass(resolved === "dark");
    setTheme(resolved);
    setupMediaQueryListener();
  };

  // Initial apply
  applyTheme();

  // Poll every 5s for Settings.theme changes
  intervalId = setInterval(applyTheme, 5000);
}

/** Reset theme sync state (for testing only). */
export function _resetThemeSync(): void {
  started = false;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (mediaQuery && mediaQueryListener) {
    mediaQuery.removeEventListener("change", mediaQueryListener);
    mediaQuery = null;
    mediaQueryListener = null;
  }
}
