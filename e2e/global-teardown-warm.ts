
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
    }
  }

  if (pid) {
    try {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
      });
    } catch {
    }
  }

  spawnSync("node", ["scripts/kill-port.mjs", "1420", "1421"], {
    stdio: "ignore",
  });

  delete (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_PID;
  delete (globalThis as Record<string, unknown>).__E2E_VITE_PREVIEW_CHILD;
}