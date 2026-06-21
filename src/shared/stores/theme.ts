//! Effect 鈫?Solid 涓婚妗ユ帴灞傘€?
//!
//! 灏?Settings.theme (light/dark/system) 妗ユ帴鍒?<html class="dark">銆?
//! Tailwind v4 dark variant 鐢?.dark class 瑙﹀彂銆?
//!
//! UI 鏆撮湶锛?
//! - theme$: Accessor<"light" | "dark"> 鈥?宸茶В鏋愮殑鏈夋晥涓婚
//! - startThemeSync(): void 鈥?骞傜瓑锛涘惎鍔ㄨ疆璇?+ media listener

import { createSignal, type Accessor } from "solid-js";
import { getSettingsBridge } from "../lib/tauri";

// 妯″潡绾х姸鎬?鈥?鍦ㄥ悓涓€ session 鍐呭娆¤皟鐢?startThemeSync() 鏃朵繚鎸併€?
// 娉ㄦ剰锛氬紑鍙戠幆澧冧笅浠庝笉娓呯悊锛坰tore 妯″紡涓棤 onCleanup锛夈€?
// 鐢熶骇浣跨敤锛氫粠 ChatView onMount 璋冪敤涓€娆?startThemeSync()銆?
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let mediaQuery: MediaQueryList | null = null;
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

// 宸茶В鏋愪富棰?signal 鈥?鍙細鏄?"light" 鎴?"dark"锛堢粷涓嶆槸 "system"锛?
const [theme, setTheme] = createSignal<"light" | "dark">("light");

/** UI 鏆撮湶鐨勫凡瑙ｆ瀽涓婚璁块棶鍣ㄣ€?*/
export const theme$: Accessor<"light" | "dark"> = theme;

/** 灏嗙郴缁熷亸濂借В鏋愪负 "light" 鎴?"dark"銆?*/
function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 灏?Settings.theme 鍊艰В鏋愪负鏈夋晥鐨?"light" 鎴?"dark"銆?*/
function resolveTheme(themeSetting: "light" | "dark" | "system"): "light" | "dark" {
  if (themeSetting === "system") {
    return resolveSystemTheme();
  }
  return themeSetting;
}

/** 鏍规嵁宸茶В鏋愪富棰樺 <html> 搴旂敤 .dark class銆?*/
function applyDarkClass(isDark: boolean): void {
  if (typeof document === "undefined") return;
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

/** 璁剧疆鍗曚釜 matchMedia listener 鐩戝惉绯荤粺涓婚銆傚箓绛?鈥?鍏堟竻鐞嗘棫 listener銆?*/
function setupMediaQueryListener(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

  // 娓呯悊涔嬪墠鐨?listener
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
 * 骞傜瓑涓婚鍚屾銆?
 *
 * 閫氳繃 getSettingsBridge() 璇诲彇 Settings.theme锛屽 <html> 搴旂敤 .dark class锛?
 * 鑻ヤ富棰樹负 "system" 鍒欒闃呯郴缁熷亸濂藉彉鍖栵紝骞舵瘡 5s 杞 Settings.theme 浠ュ湪鐢ㄦ埛鍙樻洿鏃堕噸鏂板簲鐢ㄣ€?
 *
 * 鍙畨鍏ㄥ娆¤皟鐢?鈥?鍙湁棣栨璋冪敤鐢熸晥銆?
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

/** 閲嶇疆涓婚鍚屾鐘舵€侊紙浠呬緵娴嬭瘯鐢級銆?*/
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
