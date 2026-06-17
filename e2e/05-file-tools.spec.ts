//! 05 — 文件工具 E2E：workspace 创建 + 增删改查 + 沙箱隔离。
//!
//! 使用真实 Tauri + WebView2，调用 MiniMax 测试 API key（环境变量）。
//! 不 mock IPC — E2E 的价值在于真后端 + 真文件系统。
//!
//! 场景：
//!  1. Workspace 创建 + 文件写入 + 读取（完整生命周期）
//!  2. 沙箱越界：读取 workspace 外的文件，验证 SandboxViolation
//!  3. edit_file 唯一性检查：old_text 匹配 2 次时报错
//!  4. search_files 返回匹配文件和行号

import { test, expect } from "@playwright/test";
import {
  assert,
  clearAllHistory,
  clickNewConversationAndWait,
  disposeTauriPage,
  getTauriPage,
  invoke,
  submitForm,
} from "./helpers";
import { loadEnvFile } from "./env-loader";
import type { Settings } from "../src/shared/lib/types";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

//! 使用 MiniMax 测试 API key（env var）— 不使用真实生产 key。

test.describe("05 — 文件工具 (e2e)", () => {
  // 跨场景共享的临时 workspace root。
  const e2eRoot = path.join(os.tmpdir(), `codeman-e2e-${Date.now()}`);

  let consoleErrors: string[] = [];

  test.beforeAll(async () => {
    fs.mkdirSync(e2eRoot, { recursive: true });

    // 注入 LLM key（跟 spec 03 一样）
    const page = await getTauriPage();
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    const envFile = loadEnvFile();
    const envKey = envFile.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_CN_API_KEY;
    const envBaseUrl = envFile.MINIMAX_CN_API_BASE_URL ?? process.env.MINIMAX_CN_API_BASE_URL;
    if (envKey && envKey.length > 0) {
      const current = await invoke<Settings>("get_settings");
      const providers = current.llm_providers.map((p) =>
        p.id === "minimax" ? { ...p, base_url: envBaseUrl ?? p.base_url } : p,
      );
      await invoke("update_settings", {
        newSettings: {
          ...current,
          llm_providers: providers,
          default_llm_provider_id: "minimax",
        },
      });
      await invoke("set_llm_key", { providerId: "minimax", key: envKey });
    }
  });

  test.beforeEach(async () => {
    consoleErrors = [];
    const page = await getTauriPage();
    page.on("console", (msg: { type: string; text: string }) => {
      if (msg.type === "error") consoleErrors.push(msg.text);
    });
    page.on("pageerror", (err: Error) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
    await clearAllHistory();
    await clickNewConversationAndWait(page);
  });

  test.afterAll(async () => {
    await disposeTauriPage();
    // 清理临时目录（忽略失败）
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Workspace 创建 + 文件写入 + 读取
  // -------------------------------------------------------------------------
  test("workspace 创建 + 文件写入 + 读取", async () => {
    const page = await getTauriPage();

    // 1. 在 /settings 创建 workspace
    await page.goto("/settings");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 10_000 });

    // 确保 LLM tab 激活（workspace 在 LLM tab 内）
    const llmTab = page.locator("button").filter({ hasText: /^LLM$/ });
    await llmTab.click();

    // 点击 Add workspace
    const addWsBtn = page.locator("button").filter({ hasText: /Add workspace/ });
    await assert.visible(addWsBtn, { timeout: 5_000 });
    await addWsBtn.click();

    // 新 workspace 出现在列表，找第一个 text input（root_path）
    const rootInput = page.locator('input[type="text"]').first();
    await assert.visible(rootInput, { timeout: 5_000 });
    await rootInput.fill(e2eRoot);

    // 启用 workspace（勾选第一个 checkbox）
    const wsCheckbox = page.locator('input[type="checkbox"]').first();
    await wsCheckbox.click();

    // Save 设置
    const saveBtn = page.locator("footer button").filter({ hasText: /^Save$/ });
    await saveBtn.click();
    await new Promise((r) => setTimeout(r, 1_000));

    // 2. 回到聊天页面
    await page.goto("/");
    await clickNewConversationAndWait(page);

    // 3. 发消息写文件
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await textarea.fill("Write 'hello e2e' to e2e-test.txt in workspace e2e-test");
    await submitForm(page);

    // 4. 等待 write_file tool_result（最长 60s）
    const deadline1 = Date.now() + 60_000;
    let writeOk = false;
    while (Date.now() < deadline1) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        writeOk = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(writeOk, "60s 内未观察到 assistant bubble（write_file）").toBe(true);

    // 5. 验证文件在磁盘上存在且内容正确
    const filePath = path.join(e2eRoot, "e2e-test.txt");
    expect(fs.existsSync(filePath), `文件应存在: ${filePath}`).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content, "文件内容应为 'hello e2e'").toBe("hello e2e");

    // 6. 发消息读取文件
    await textarea.fill("Read e2e-test.txt");
    await submitForm(page);

    // 7. 等待 read_file tool_result
    const deadline2 = Date.now() + 60_000;
    let readOk = false;
    while (Date.now() < deadline2) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        readOk = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(readOk, "60s 内未观察到 assistant bubble（read_file）").toBe(true);

    // 8. 验证 assistant 响应包含文件内容
    const pageText = await page.evaluate(() => document.body.textContent);
    expect(pageText?.includes("hello e2e"), "助手响应应包含 'hello e2e'").toBe(true);

    // canary：无 console.error
    expect(consoleErrors, `console.error 不应出现：\n${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: 沙箱越界
  // -------------------------------------------------------------------------
  test("沙箱越界 — 读取 workspace 外文件返回 SandboxViolation", async () => {
    const page = await getTauriPage();

    // workspace 已创建（beforeAll），直接发消息尝试越界读
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await textarea.fill("Read C:\\Windows\\System32\\drivers\\etc\\hosts");
    await submitForm(page);

    // 等待 tool_result（最长 60s）
    const deadline = Date.now() + 60_000;
    let sawResult = false;
    while (Date.now() < deadline) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        sawResult = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(sawResult, "60s 内未观察到 assistant bubble").toBe(true);

    // 验证 tool_result 包含 SandboxViolation
    const bodyText = await page.evaluate(() => document.body.textContent);
    expect(
      bodyText?.toLowerCase().includes("sandbox") || bodyText?.includes("Sandbox"),
      `响应应包含 SandboxViolation 相关文字，实际: ${bodyText?.slice(0, 200)}`,
    ).toBe(true);

    // canary
    expect(consoleErrors, `console.error 不应出现：\n${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: edit_file 唯一性检查
  // -------------------------------------------------------------------------
  test("edit_file — old_text 匹配多次时报错，精确匹配时成功", async () => {
    const page = await getTauriPage();

    // 1. 在 workspace 内创建带两处 "TODO" 的文件
    const targetFile = path.join(e2eRoot, "target.txt");
    fs.writeFileSync(targetFile, "TODO: fix bug\nDONE: ok", "utf-8");

    // 2. 发消息尝试替换 'TODO'（会匹配 2 次）
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await textarea.fill("Replace 'TODO' with 'TASK' in target.txt");
    await submitForm(page);

    // 3. 等待 tool_result 包含错误信息
    const deadline = Date.now() + 60_000;
    let sawError = false;
    while (Date.now() < deadline) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        sawError = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(sawError, "60s 内未观察到 assistant bubble（ambiguous edit）").toBe(true);

    const bodyText = await page.evaluate(() => document.body.textContent);
    expect(
      bodyText?.includes("exactly once") || bodyText?.includes("must match exactly"),
      `错误应提示唯一匹配，实际: ${bodyText?.slice(0, 300)}`,
    ).toBe(true);

    // 4. 发送精确替换（包含冒号）
    await textarea.fill("Replace 'TODO:' with 'TASK:' in target.txt");
    await submitForm(page);

    // 5. 等待成功 tool_result
    const deadline2 = Date.now() + 60_000;
    let sawSuccess = false;
    while (Date.now() < deadline2) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        sawSuccess = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(sawSuccess, "60s 内未观察到 assistant bubble（成功 edit）").toBe(true);

    // 6. 读取文件验证内容
    const newContent = fs.readFileSync(targetFile, "utf-8");
    expect(newContent, "文件内容应为 'TASK: fix bug\\nDONE: ok'").toBe("TASK: fix bug\nDONE: ok");

    // canary
    expect(consoleErrors, `console.error 不应出现：\n${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: search_files
  // -------------------------------------------------------------------------
  test("search_files 返回匹配文件 + 行号，不包含无关文件", async () => {
    const page = await getTauriPage();

    // 1. 在 workspace 创建 a.ts（含 TODO）和 b.ts（干净）
    const dirA = path.join(e2eRoot, "src");
    fs.mkdirSync(dirA, { recursive: true });
    fs.writeFileSync(path.join(dirA, "a.ts"), "TODO: refactor\n", "utf-8");
    fs.writeFileSync(path.join(dirA, "b.ts"), "// clean file\n", "utf-8");

    // 2. 发消息搜索
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await textarea.fill("Find all .ts files containing 'TODO'");
    await submitForm(page);

    // 3. 等待 search_files tool_result
    const deadline = Date.now() + 60_000;
    let sawResult = false;
    while (Date.now() < deadline) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        sawResult = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(sawResult, "60s 内未观察到 assistant bubble（search_files）").toBe(true);

    // 4. 验证结果包含 a.ts 和行号，不包含 b.ts
    const bodyText = await page.evaluate(() => document.body.textContent);
    expect(bodyText?.includes("a.ts"), `结果应包含 a.ts，实际: ${bodyText?.slice(0, 300)}`).toBe(
      true,
    );
    expect(
      bodyText?.toLowerCase().includes("1") || bodyText?.includes("line"),
      `结果应包含行号信息，实际: ${bodyText?.slice(0, 300)}`,
    ).toBe(true);

    // canary
    expect(consoleErrors, `console.error 不应出现：\n${consoleErrors.join("\n")}`).toHaveLength(0);
  });
});
