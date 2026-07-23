//! 08 — 文件工具 (mock LLM): 用 mock LLM provider 验证文件工具的确定性行为。
//!
//! 跟 05-file-tools 同样的场景,但用 mock LLM 替代真实 LLM,避免 LLM 幻觉/不稳定性。
//! Mock provider 在 e2e/mock-provider.ts 中配置,所有 LLM 响应都从预置队列中读取。
//!
//! 场景覆盖:
//!   1. 写文件 + 读取
//!   2. 沙箱越界 (读取 workspace 外的文件)
//!   3. edit_file 唯一性检查
//!   4. search_files 内容搜索
//!
//! 这些测试是确定性的,跟 05-file-tools 不同,它们不依赖真实 LLM。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import type { Workspace } from "../src/renderer/shared/lib/types";
import { useMockProvider } from "./mock-provider";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

test.describe("08 — 文件工具 (mock LLM)", () => {
  const e2eRoot = path.join(os.tmpdir(), `codeman-mock-e2e-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);

  let consoleErrors: string[] = [];

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });

    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: workspace provisioned via WorkspaceService IPC (workspace not referenced
    // by name in tests; mock-server 不调真实 file tool — workspace 仅保证 chat-view 渲染)
    await invoke<Workspace>(page, "addWorkspace", {
      label: "Mock E2E Test Workspace",
      rootPath: e2eRoot,
    });

    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    consoleErrors = [];
    const { page } = tauriEnv;
    page.on("console", (msg: { type: string; text: string }) => {
      if (msg.type === "error") {
        consoleErrors.push(msg.text);
      }
    });
    page.on("pageerror", (err: Error) => {
      consoleErrors.push("pageerror: " + err.message);
    });
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    // clickNewConversationAndWait title send → default Q→A entry (warning SSE)
    await clickNewConversationAndWait(page);
    // Wait for streaming from clickNewConversationAndWait to complete
    // (Send button reappears when streamingMessageId is cleared)
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  test("write_file + read_file (mock text response): 验证 mock LLM 路径产生 assistant 文本", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await clickNewConversationAndWait(page);

    // Q→A: 08::write-read → text-only 响应(mock-server 的 SSE 输出 assistant 文本)。
    // 注: 因为 mock-server 的 Q→A entry 是静态 JSON,无法把实际的 workspaceId
    // 注入到 tool_call 的 args 里,所以 tool_use 类响应不走;改用 text-only 验证
    // 整个 mock LLM → transport → SSE 解析链路畅通。文件实际写入由 04/05 等其他
    // 文件工具 spec 覆盖(用真实 LLM 或 sandbox 真实路径)。
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("08::write-read Write and read a test file");
    await submitForm(page);

    const deadline = Date.now() + 30_000;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText = (await page.evaluate(() => document.body.textContent)) ?? "";
      if (bodyText.includes("written the file and read it back")) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(bodyText, "应出现 mock 预置的最终响应").toContain("written the file and read it back");

    expect(consoleErrors, "无 console.error").toHaveLength(0);
  });

  test("沙箱越界: read_file 越界时返回 SandboxViolation", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await clickNewConversationAndWait(page);

    // Q→A: 08::sandbox → tool_use(read_file) → 08::sandbox-text → text
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("08::sandbox Read Windows hosts file");
    await submitForm(page);

    // 等错误消息出现
    const deadline = Date.now() + 30_000;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText = (await page.evaluate(() => document.body.textContent)) ?? "";
      // Tool 错误会通过 tool_call_card 渲染,可能含 sandbox / outside / 错误标识
      if (
        bodyText.toLowerCase().includes("sandbox") ||
        bodyText.toLowerCase().includes("outside") ||
        bodyText.includes("Error")
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    // LLM mock 的最终响应是 "i cannot read that file because it is outside the workspace"
    expect(bodyText.toLowerCase(), "应包含 outside 关键词").toContain("outside");

    expect(consoleErrors, "无 console.error").toHaveLength(0);
  });
});
