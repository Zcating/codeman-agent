//! vitest global setup — runs before all test files.
//!
//! 集中 mock 调用(per 项目约定 ADR-0020 + 用户决策):
//!
//! **不在本文件 mock 的模块**:
//!
//! - `solid-js/store` —— 6 个 settings/shared 测试文件需要 mock(jsdom 不跑 Solid reactive),
//!   但 `conversations.store.test.ts` 用 `createRoot` + 真 Solid runtime(per chat/AGENTS.md
//!   "Store 测试" 段)。全局 mock 会让 `createStore` 返回 plain proxy,无法与真 Solid
//!   signal/effect 兼容,导致 `conversations.store.test.ts` 26 个测试全部 `TypeError`。
//!   妥协:6 个 settings/shared 测试文件**内联** 28 行 `vi.mock("solid-js/store", () => {...})`,
//!   不进 setup。详见 ADR-0020 § "Why not 全局 mock solid-js/store"。

import "@testing-library/jest-dom";

// ─── DOM polyfill ───────────────────────────────────────────────

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// ─── V3 IPC Mock (window.codeman) ──────────────────────────────
//
// Static import triggers ipc-mock.ts side effects: sets up
// `window.codeman` on the jsdom global so V3 ipc.ts finds the mock
// at runtime. Tests that need mockState import it directly from
// `../__mocks__/ipc-mock` (relative path).
import "./src/__mocks__/ipc-mock";