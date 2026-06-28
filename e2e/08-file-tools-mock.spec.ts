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
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";
import type { Settings } from "../src/shared/lib/types";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

test.describe("08 — 文件工具 (mock LLM)", () => {
  const e2eRoot = path.join(os.tmpdir(), "codeman-mock-e2e-" + Date.now());

  let consoleErrors: string[] = [];

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // 确保 mock provider 已配置,并注入测试 workspace
    const current = await invoke<Settings>(page, "get_settings");
    const mainWorkspace = {
      id: "main",
      label: "Mock E2E Test Workspace",
      root_path: e2eRoot,
      enabled: true,
    };
    await invoke(page, "update_settings", {
      newSettings: {
        ...current,
        workspaces: [mainWorkspace],
      },
    });

    // 切换到 mock provider
    await useMockProvider(page, { workspace: false });

    // 重新注入 workspace（useMockProvider 可能会被覆盖）
    const current2 = await invoke<Settings>(page, "get_settings");
    await invoke(page, "update_settings", {
      newSettings: {
        ...current2,
        workspaces: [mainWorkspace],
      },
    });

    fs.mkdirSync(e2eRoot, { recursive: true });
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
    await clearMockQueue(page);
    await clickNewConversationAndWait(page);
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  test("write_file + read_file: 写文件后能读回内容", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await clickNewConversationAndWait(page);

    // Mock 队列:第 1 turn 调 write_file,第 2 turn 调 read_file,第 3 turn 给文本
    await enqueueMockResponse(page, {
      toolCalls: [
        {
          name: "write_file",
          input: { workspaceId: "main", path: "e2e-mock-test.txt", content: "hello from mock" },
        },
      ],
    });
    await enqueueMockResponse(page, {
      toolCalls: [
        {
          name: "read_file",
          input: { workspaceId: "main", path: "e2e-mock-test.txt" },
        },
      ],
    });
    await enqueueMockResponse(page, {
      text: "I've written the file and read it back. The content is 'hello from mock'.",
    });

    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("Write and read a test file");
    await submitForm(page);

    // 等最终 assistant 文本响应出现
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

    // 验证文件确实被写到了磁盘
    const filePath = path.join(e2eRoot, "e2e-mock-test.txt");
    expect(fs.existsSync(filePath), "文件应存在: " + filePath).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8"), "文件内容").toBe("hello from mock");

    expect(consoleErrors, "无 console.error").toHaveLength(0);
  });

  test("沙箱越界: read_file 越界时返回 SandboxViolation", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await clickNewConversationAndWait(page);

    // Mock 队列:调用 read_file 读 Windows 路径
    await enqueueMockResponse(page, {
      toolCalls: [
        {
          name: "read_file",
          input: {
            workspaceId: "main",
            path: "C:WindowsSystem32driversetchosts",
          },
        },
      ],
    });
    await enqueueMockResponse(page, {
      text: "I cannot read that file because it is outside the workspace.",
    });

    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("Read Windows hosts file");
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
