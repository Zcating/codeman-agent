
import { createSignal, type Accessor } from "solid-js";
import { getSettingsBridge } from "@codeman-frontend/shared/apis";

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let mediaQuery: MediaQueryList | null = null;
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

const [theme, setTheme] = createSignal<"light" | "dark">("light");

export const theme$: Accessor<"light" | "dark"> = theme;

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(themeSetting: "light" | "dark" | "system"): "light" | "dark" {
  if (themeSetting === "system") {
    return resolveSystemTheme();
  }
  return themeSetting;
}

function applyDarkClass(isDark: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function setupMediaQueryListener(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }

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

export function startThemeSync(): void {
  if (started) {
    return;
  }
  started = true;

  const applyTheme = async () => {
    const settings = await getSettingsBridge();
    const resolved = resolveTheme(settings.theme);
    applyDarkClass(resolved === "dark");
    setTheme(resolved);
    setupMediaQueryListener();
  };

  applyTheme();

  intervalId = setInterval(applyTheme, 5000);
}

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
