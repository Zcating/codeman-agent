


















import { test, expect, assert, invoke, type TauriPage } from "./fixtures";

async function gotoMcpSettings(page: TauriPage): Promise<void> {
  await page.goto("/settings/mcp");
  await assert.visible(page.locator('[data-testid="mcp-refresh"]'), { timeout: 15_000 });
}

test.describe("13 — MCP Settings (renderer-only)", () => {
  test("页面 mount + 显示 empty state", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMcpSettings(page);

    
    await assert.visible(
      page.getByText("No MCP servers configured", { exact: false }),
      { timeout: 5_000 },
    );

    
    const listCount = await page.locator('[data-testid="mcp-servers-list"]').count();
    expect(listCount).toBe(0);

    
    await assert.visible(page.locator('[data-testid="mcp-open-config"]'), {
      timeout: 5_000,
    });

    
    await assert.visible(
      page.getByText("~/.agents/mcp_servers.json", { exact: false }),
      { timeout: 5_000 },
    );
  });

  test("Refresh 按钮 click 不抛 + IPC mcp:list-servers 返回 []", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMcpSettings(page);

    
    const initialServers = await invoke<unknown[]>(page, "mcp:list-servers");
    expect(initialServers).toEqual([]);

    
    const initialTools = await invoke<unknown[]>(page, "mcp:get-all-tools");
    expect(initialTools).toEqual([]);

    
    await page.locator('[data-testid="mcp-refresh"]').click();

    
    await new Promise((r) => setTimeout(r, 1_000));
    await assert.visible(
      page.getByText("No MCP servers configured", { exact: false }),
      { timeout: 5_000 },
    );
  });

  test("Open config file 按钮 IPC 不抛", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMcpSettings(page);

    
    
    
    try {
      await invoke(page, "mcp:open-config-dir");
    } catch (e) {
      
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/ENOENT|not found|cannot find|failed/i);
    }
  });
});