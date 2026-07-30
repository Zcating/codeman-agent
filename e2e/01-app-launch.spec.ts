
import { test, assert, expect, invoke } from "./fixtures";
import type { Workspace } from "../src/renderer/shared/lib/types";

test.describe("01 — application launch", () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ tauriEnv }) => {
    consoleErrors = [];
    const { page } = tauriEnv;
    page.on("console", (msg) => {
      if (msg.type === "error") {
        consoleErrors.push(msg.text);
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
  });

  test("main window mounts SPA (settings link visible + no startup errors)", async ({
    tauriEnv,
  }) => {
    const { page } = tauriEnv;

    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 15_000;
        const check = () => {
          if (document.title.length > 0) {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            reject(
              new Error(
                "document.title still empty after 15s (SPA did not mount)",
              ),
            );
            return;
          }
          setTimeout(check, 100);
        };
        check();
      });
    });

    const title = await page.evaluate(() => document.title);
    expect(title.length, "document.title should be non-empty (SPA must have mounted)").toBeGreaterThan(
      0,
    );

    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    await assert.visible(page.getByRole("link", { name: /设置/i }));

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors during startup:\n${consoleErrors.join("\n")}`);
    }
  });

  test("D8-W: WorkspaceService usable immediately on app boot", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    const workspaces = await invoke<Workspace[]>(page, "listWorkspaces");
    expect(Array.isArray(workspaces)).toBe(true);
    await invoke(page, "addWorkspace", { label: "Boot Test", rootPath: `/tmp/boot-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}` });
    const after = await invoke<Workspace[]>(page, "listWorkspaces");
    expect(after.some((w) => w.label === "Boot Test")).toBe(true);
  });
});