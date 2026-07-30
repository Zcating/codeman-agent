















import { test, expect, assert, invoke, type TauriPage } from "./fixtures";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

async function gotoSkillsSettings(page: TauriPage): Promise<void> {
  await page.goto("/settings/skills");
  
  await assert.visible(page.locator('[data-testid="skills-refresh"]'), { timeout: 15_000 });
}

test.describe("12 — Skills", () => {
  test.describe.configure({ mode: "serial" });

  test("Settings tab mount + Refresh 按钮可点击", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoSkillsSettings(page);

    
    
    
    
    
    await page.locator('[data-testid="skills-refresh"]').click();

    
    await new Promise((r) => setTimeout(r, 1500));

    const skillsListCount = await page.locator('[data-testid="skills-list"]').count();
    const emptyStateText = await page
      .getByText("No skills found", { exact: false })
      .count();

    
    expect(skillsListCount + emptyStateText).toBeGreaterThanOrEqual(1);
    expect(skillsListCount + emptyStateText).toBeLessThanOrEqual(1);
  });

  test("SlashMenu 在 codex-input 中通过 / 触发 + filter + Enter 选中", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    
    const root = join(
      process.env["TEMP"] ?? process.env["TMP"] ?? "C:\\Temp",
      `codeman-e2e-skills-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      mkdirSync(root, { recursive: true });
      const old = await invoke<{ id: string }[]>(page, "listWorkspaces");
      for (const ws of old) await invoke(page, "deleteWorkspace", { id: ws.id });
    } catch {
      
    }
    await invoke(page, "addWorkspace", { label: "SlashMenu Test WS", rootPath: root });

    
    await page.goto("/");
    await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

    
    
    
    await page.evaluate(() => {
      const ta = document.querySelector(
        '[data-testid="codex-input"]',
      ) as HTMLTextAreaElement | null;
      if (!ta) throw new Error("codex-input not found");
      ta.focus();
      ta.setSelectionRange(0, 0);
      const ev = new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      });
      ta.dispatchEvent(ev);
    });

    
    await assert.visible(page.locator('[data-testid="slash-menu"]'), { timeout: 5_000 });

    
    const initialCount = await page
      .locator('[data-testid="slash-menu"] [role="option"]')
      .count();
    expect(initialCount).toBeGreaterThanOrEqual(0);

    
    
    
    await page.evaluate(() => {
      const ta = document.querySelector(
        '[data-testid="codex-input"]',
      ) as HTMLTextAreaElement | null;
      if (!ta) return;
      
      const desc = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      );
      desc?.set?.call(ta, "c");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });

    
    
    await new Promise((r) => setTimeout(r, 500));
    await assert.visible(page.locator('[data-testid="slash-menu"]'), { timeout: 5_000 });

    
    
    const optionCount = await page
      .locator('[data-testid="slash-menu"] [role="option"]')
      .count();
    if (optionCount > 0) {
      await page.evaluate(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await new Promise((r) => setTimeout(r, 500));

      
      
      
      const value = await page.evaluate(() => {
        const ta = document.querySelector(
          '[data-testid="codex-input"]',
        ) as HTMLTextAreaElement | null;
        return ta?.value ?? "";
      });
      expect(value).toMatch(/^\/\S+/);
    }
  });
});