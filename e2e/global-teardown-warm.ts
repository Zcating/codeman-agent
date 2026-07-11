//! e2e/global-teardown-warm.ts — kill the shared Vite preview server.
//!
//! Runs ONCE after all workers finish (or fail). The vite preview child
//! was stashed by globalSetup on `globalThis`; we kill it here so port 1420
//! is freed for the next e2e run. Best-effort — if the child already died
//! (e.g. user killed it manually), we silently succeed.

import { spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export default async function globalTeardown(): Promise<void> {
  const pid = (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_PID as
    | number
    | undefined;
  const child = (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_CHILD as
    | ChildProcess
    | undefined;

  if (child && !child.killed) {
    try {
      child.kill("SIGKILL");
    } catch {
      // already dead
    }
  }

  // Belt-and-suspenders: taskkill in case the child tree has stragglers
  // (e.g. a Node child process holding the port).
  if (pid) {
    try {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
      });
    } catch {
      // ignore
    }
  }

  // Final: ensure port 1420 is free for the next run.
  spawnSync("node", ["scripts/kill-port.mjs", "1420", "1421"], {
    stdio: "ignore",
  });

  // Clear globals so a `--retries` doesn't see stale state.
  delete (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_PID;
  delete (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_CHILD;
}