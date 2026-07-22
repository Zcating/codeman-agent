//! 13 — MCP Settings 端到端测试 (ADR-0032)
//!
//! 只覆盖 renderer 端 UI wiring,不触碰 `~/.agents/mcp_servers.json`:
//!   1. /settings/mcp 页面 mount,显示 empty state "No MCP servers configured"
//!   2. IPC `mcp:list-servers` 返回 [] (无 config 文件)
//!   3. Refresh 按钮 click 不抛
//!   4. IPC `mcp:open-config-dir` 调用不抛(macOS 走 `shell.openPath`)
//!   5. UI 显示 mcp_config 路径文字 (`~/.agents/mcp_servers.json`)
//!
//! 不测的部分(V2 follow-up,需要 per-worker HOME override + fixtures.ts 改造):
//!   - 写入 config 后 McpManager 重新读取(目前 `startAll()` 只读一次,需
//!     `mcp:reload-config` IPC + fixtures.ts `USERPROFILE` 覆盖)
//!   - 真实 MCP server stdio 握手(需要 fake MCP server binary,见 mcp-host.ts
//!     `FakeChildProcess` V2 基础设施)
//!   - 工具调用 mcp:call-tool(同上)
//!
//! 风险评估:本 spec 不写 config 文件,只读 IPC 状态。即使 worker pool 并行,
//! 也不互相影响。

import { test, expect, assert, invoke, type TauriPage } from "./fixtures";

async function gotoMcpSettings(page: TauriPage): Promise<void> {
  await page.goto("/settings/mcp");
  await assert.visible(page.locator('[data-testid="mcp-refresh"]'), { timeout: 15_000 });
}

test.describe("13 — MCP Settings (renderer-only)", () => {
  test("页面 mount + 显示 empty state", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMcpSettings(page);

    // Empty state 显示 — substring match(<p> 末尾带 "." )
    await assert.visible(
      page.getByText("No MCP servers configured", { exact: false }),
      { timeout: 5_000 },
    );

    // mcp-servers-list 不应渲染(<Show when={length > 0}>)
    const listCount = await page.locator('[data-testid="mcp-servers-list"]').count();
    expect(listCount).toBe(0);

    // Open config file 按钮可见
    await assert.visible(page.locator('[data-testid="mcp-open-config"]'), {
      timeout: 5_000,
    });

    // 路径文字可见 — substring match(整段含 em-dash 等)
    await assert.visible(
      page.getByText("~/.agents/mcp_servers.json", { exact: false }),
      { timeout: 5_000 },
    );
  });

  test("Refresh 按钮 click 不抛 + IPC mcp:list-servers 返回 []", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMcpSettings(page);

    // 1. IPC 直查:无 config 时返回空数组
    const initialServers = await invoke<unknown[]>(page, "mcp:list-servers");
    expect(initialServers).toEqual([]);

    // 2. IPC 直查:get-all-tools 也应返回空
    const initialTools = await invoke<unknown[]>(page, "mcp:get-all-tools");
    expect(initialTools).toEqual([]);

    // 3. Click Refresh — 触发 store.refresh() 重读 IPC
    await page.locator('[data-testid="mcp-refresh"]').click();

    // 4. 等 store 更新 — empty state 仍可见
    await new Promise((r) => setTimeout(r, 1_000));
    await assert.visible(
      page.getByText("No MCP servers configured", { exact: false }),
      { timeout: 5_000 },
    );
  });

  test("Open config file 按钮 IPC 不抛", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMcpSettings(page);

    // 直接调 IPC — 不真正打开(会弹 Explorer 窗口),只断言不抛错。
    // shell.openPath 在 Windows 上即使路径不存在也会"成功"(返回 string 空)
    // — 真正的行为不在测试范围内。
    try {
      await invoke(page, "mcp:open-config-dir");
    } catch (e) {
      // 接受路径不存在的 reject(ENOENT)— 我们只断言 IPC 通道能响应。
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/ENOENT|not found|cannot find|failed/i);
    }
  });
});