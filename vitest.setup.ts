//! vitest global setup — runs before all test files.
//!
//! 集中 3rd-party `vi.mock()` 调用(per 项目约定 ADR-0020 + 用户决策):
//!
//! | 3rd-party module       | mock 唯一源                                                  | 触发方式                          |
//! | ---------------------- | ------------------------------------------------------------ | --------------------------------- |
//! | `@tauri-apps/api/core` | `src/__mocks__/@tauri-apps/api/core.ts`                      | `vi.mock` 显式注册(导入 impl 文件)|
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
import { vi } from "vitest";

// ─── DOM polyfill ───────────────────────────────────────────────

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// ─── 3rd-party mocks ────────────────────────────────────────────

/**
 * `@tauri-apps/api/core` —— 委托给 `src/__mocks__/@tauri-apps/api/core.ts` 的实现。
 *
 * `vi.mock("module", () => import("./path"))` 形式让 vitest 把 mock 文件的全部
 * export(`mockState` / `invoke` / `SettingsV15` / type)映射到 import 的模块名上。
 * 测试文件 `import { mockState } from "@tauri-apps/api/core"` 实际拿到的是
 * `src/__mocks__/@tauri-apps/api/core.ts` 的导出。
 */
vi.mock("@tauri-apps/api/core", () => import("./src/__mocks__/@tauri-apps/api/core"));

/**
 * V3 (T5/T6): statically import the mock module to trigger its side
 * effects (window.codeman initialization). Without this import, the mock
 * module never loads in V3 because ipc.ts no longer imports from
 * `@tauri-apps/api/core` — the vi.mock factory is a virtual mapping only
 * that only loads on actual import of the mocked module.
 */
import "./src/__mocks__/@tauri-apps/api/core";