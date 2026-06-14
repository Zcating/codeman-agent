//! e2e/global-teardown.ts — 杀死 global-setup 生成的 Tauri 进程。
//!
//! 皮带和背带：我们先杀死精确的子进程，然后扫掉 dev 端口上的任何遗留
//! 进程。这样避免测试中途失败时留下僵尸 cargo / tauri / webview2 进程。

import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PORTS } from "../playwright.config";

const KILL_PORT = "node scripts/kill-port.mjs";

export default async function globalTeardown(): Promise<void> {
  const child = (globalThis as Record<string, unknown>).__TAURI_E2E_CHILD as
    | { kill: (sig: string) => void; pid?: number }
    | undefined;
  const pid = (globalThis as Record<string, unknown>).__TAURI_E2E_PID as number | undefined;

  // 1. 先尝试子进程 — tauri dev 是 `cargo run` 和 webview helper 的父进程，
  //    所以杀死它应该级联。
  if (child?.kill) {
    try {
      child.kill("SIGTERM");
    } catch {
      // 已经死了
    }
  }

  // 2. 皮带和背带：终止任何仍绑定在 dev 端口上的东西。
  //    这捕获 webview2、cargo 和没有随父进程干净死去的 `tauri dev` shell。
  await sleep(1000);
  spawnSync(KILL_PORT, [String(PORTS.VITE_PORT), "1421", String(PORTS.TAURI_DRIVER_PORT)], {
    stdio: "inherit",
  });

  // 3. 在 Windows 上，偶尔会有 tauri.exe 在不同父进程下被留下。
  //    taskkill /F /IM tauri.exe 是最后手段 — 在这里安全，
  //    因为我们是该 exe 在 CI/本地环境中的唯一消费者。
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/IM", "tauri.exe", "/T"], { stdio: "ignore" });
    spawnSync("taskkill", ["/F", "/IM", "codeman-agent.exe", "/T"], { stdio: "ignore" });
  }

  // 4. 清除全局变量以便重跑（例如 --retries）时从头开始。
  (globalThis as Record<string, unknown>).__TAURI_E2E_CHILD = undefined;
  (globalThis as Record<string, unknown>).__TAURI_E2E_PID = undefined;

  // Pid 保留供将来日志使用；引用以便 eslint 不丢弃它。
  void pid;
}
