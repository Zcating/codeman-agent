//! Effect → Solid 主题桥接层。
//!
//! 将 Settings.theme (light/dark/system) 桥接到 <html class="dark">。
//! Tailwind v4 dark variant 由 .dark class 触发。
//!
//! UI 暴露：
//! - theme$: Accessor<"light" | "dark"> — 已解析的有效主题
//! - startThemeSync(): void — 幂等；启动轮询 + media listener

import { createSignal, type Accessor } from "solid-js";
import { getSettingsBridge } from "@codeman-frontend/shared/apis";

// 模块级状态 — 在同一 session 内多次调用 startThemeSync() 时保持。
// 注意：开发环境下从不清理（store 模式中无 onCleanup）。
// 生产使用：从 ChatView onMount 调用一次 startThemeSync()。
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let mediaQuery: MediaQueryList | null = null;
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

// 已解析主题 signal — 只会是 "light" 或 "dark"（绝不是 "system"）
const [theme, setTheme] = createSignal<"light" | "dark">("light");

/** UI 暴露的已解析主题访问器。*/
export const theme$: Accessor<"light" | "dark"> = theme;

/** 将系统偏好解析为 "light" 或 "dark"。*/
function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 将 Settings.theme 值解析为有效的 "light" 或 "dark"。*/
function resolveTheme(themeSetting: "light" | "dark" | "system"): "light" | "dark" {
  if (themeSetting === "system") {
    return resolveSystemTheme();
  }
  return themeSetting;
}

/** 根据已解析主题对 <html> 应用 .dark class。*/
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

/** 设置单个 matchMedia listener 监听系统主题。幂等 — 先清理旧 listener。*/
function setupMediaQueryListener(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }

  // 清理之前的 listener
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
 * 幂等主题同步。
 *
 * 通过 getSettingsBridge() 读取 Settings.theme，对 <html> 应用 .dark class；
 * 若主题为 "system" 则监听系统偏好变化，并每 5s 轮询 Settings.theme 以在用户变更时重新应用。
 *
 * 可安全多次调用 — 只有首次调用生效。
 */
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

  // Initial apply
  applyTheme();

  // Poll every 5s for Settings.theme changes
  intervalId = setInterval(applyTheme, 5000);
}

/** 重置主题同步状态（仅供测试用）。*/
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
