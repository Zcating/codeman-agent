//! V3 IPC shim — re-exports from `./ipc` (V3 canonical).
//!
//! Per V3 consensus 1.3 shim approach: this file is a 3-line re-export so
//! existing 50+ consumers keep importing from `@/shared/lib/tauri` without
//! churn. The actual IPC source is `./ipc` (uses `window.codeman` from
//! Electron preload; no more `@tauri-apps/api/core`).
//!
//! T5 will delete this file (V3.1 cleanup per plan).

export * from "./ipc";
