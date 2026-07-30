












import { test, expect, assert, invoke, clickNewConversationAndWait, type TauriPage } from "./fixtures";

interface Settings {
  theme: "light" | "dark" | "system";
  [key: string]: unknown;
}

async function setTheme(
  page: TauriPage,
  theme: "light" | "dark" | "system",
) {
  const current = await invoke<Settings>(page, "getSettings");
  const next: Settings = { ...current, theme };
  await invoke<Settings>(page, "updateSettings", { newSettings: next });

  
  
  
  const wantDark = theme === "dark";
  if (theme === "system") {
    
    
    
    
    const deadline = Date.now() + 7_000;
    let ok = false;
    while (Date.now() < deadline) {
      const cls = await page.evaluate(() => document.documentElement.className);
      
      
      if (cls === "" || cls === "dark") {
        ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ok) {
      throw new Error("7s 内 system 主题仍未解析为 light 或 dark");
    }
    return;
  }

  const deadline = Date.now() + 7_000;
  let isDark = false;
  while (Date.now() < deadline) {
    isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (isDark === wantDark) {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`7s 内主题未切到 ${theme}; isDark=${isDark}`);
}

test.describe("04 — 主题", () => {
  test("light → dark → light 通过 update_settings", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    
    await assert.attached(page.locator("html"));

    
    
    
    
    
    
    try {
      const old = await invoke<{ id: string }[]>(page, "listWorkspaces");
      for (const ws of old) {await invoke(page, "deleteWorkspace", { id: ws.id });}
    } catch {  }
    await invoke(page, "addWorkspace", {
      label: "Theme Test Workspace",
      rootPath: `C:\\Temp\\codeman-e2e-theme-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
    });
    await clickNewConversationAndWait(page, { workspaceLabel: "Theme Test Workspace" });

    
    await page.goto("/");

    
    await setTheme(page, "light");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      false,
    );

    
    await setTheme(page, "dark");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      true,
    );

    
    await setTheme(page, "light");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      false,
    );

    
    await setTheme(page, "system");
    const finalClass = await page.evaluate(() => document.documentElement.className);
    expect(finalClass === "" || finalClass === "dark").toBe(true);
  });
});
