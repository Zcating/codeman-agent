//! vitest global setup — runs before all test files.
//!
//! 集中 mock 调用(per 项目约定 + 用户决策):
//!
//! **不在本文件 mock 的模块**:
//!
//! - `solid-js/store` —— 6 个 settings/shared 测试文件需要 mock(jsdom 不跑 Solid reactive),
//!   但 `conversations.store.test.ts` 用 `createRoot` + 真 Solid runtime(per chat/AGENTS.md
//!   "Store 测试" 段)。全局 mock 会让 `createStore` 返回 plain proxy,无法与真 Solid
//!   signal/effect 兼容,导致 `conversations.store.test.ts` 26 个测试全部 `TypeError`。
//!   妥协:6 个 settings/shared 测试文件**内联** 28 行 `vi.mock("solid-js/store", () => {...})`,
//!   不进 setup。详见 § "Why not 全局 mock solid-js/store`。

import "@testing-library/jest-dom";

// ─── DOM polyfill ───────────────────────────────────────────────

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// ─── ResizeObserver mock ────────────────────────────────────────
//
// jsdom does not fully implement ResizeObserver. Add a minimal mock
// so ark-ui splitter component can render in tests.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe(_target: Element): void {}
    unobserve(_target: Element): void {}
    disconnect(): void {}
  };
}

// ─── IntersectionObserver mock ─────────────────────────────────
//
// jsdom does not implement IntersectionObserver. zag-js scroll-area
// machine calls trackViewportVisibility on mount — add a minimal mock
// so ark-ui ScrollArea can render in tests.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  window.IntersectionObserver = class IntersectionObserver {
    observe(_target: Element): void {}
    unobserve(_target: Element): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [0];
  } as unknown as typeof IntersectionObserver;
}

// ─── localStorage polyfill ─────────────────────────────────────
//
// jsdom requires a proper origin (non-opaque) for localStorage to work.
// Vitest's jsdom environment may not configure this correctly in all cases.
// Provide a memory-based fallback so tests can run without modifying the
// jsdom configuration globally. Placed here (centralized) rather than per-test.
if (typeof window !== "undefined" && window.localStorage) {
  const orig = window.localStorage;
  if (typeof orig.clear !== "function") {
    // localStorage exists but is incomplete - replace with our polyfill
    const memory = new Map<string, string>();
    const polyfill: Storage = {
      getItem: (k) => memory.has(k) ? memory.get(k)! : null,
      setItem: (k, v) => { memory.set(k, String(v)); },
      removeItem: (k) => { memory.delete(k); },
      clear: () => { memory.clear(); },
      key: (i) => Array.from(memory.keys())[i] ?? null,
      get length() { return memory.size; },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: polyfill });
  }
} else if (typeof window !== "undefined") {
  // localStorage doesn't exist at all - create it
  const memory = new Map<string, string>();
  const polyfill: Storage = {
    getItem: (k) => memory.has(k) ? memory.get(k)! : null,
    setItem: (k, v) => { memory.set(k, String(v)); },
    removeItem: (k) => { memory.delete(k); },
    clear: () => { memory.clear(); },
    key: (i) => Array.from(memory.keys())[i] ?? null,
    get length() { return memory.size; },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: polyfill });
}

// ─── V3 IPC Mock (window.codeman) ──────────────────────────────
//
// Static import triggers ipc-mock.ts side effects: sets up
// `window.codeman` on the jsdom global so V3 ipc.ts finds the mock
// at runtime. Tests that need mockState import it directly from
// `../__mocks__/ipc-mock` (relative path).
import "./src/renderer/src/__mocks__/ipc-mock";