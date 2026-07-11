//! 01 — Application launch: cold-start Tauri and verify the SPA mounted.
//!
//! Canary spec. If this fails, the entire e2e pipeline is broken (wrong CDP
//! port, webview not loaded, or app panicked on startup). All other specs
//! implicitly depend on this passing.
//!
//! V2.1 polish: home layout depends on `activeId`. With active conv, the
//! app shows ChatLayout (sidebar `<aside>` + textarea). Without active
//! conv, it shows HomeAgentForm (codex-input + codex-send). This canary
//! only asserts on elements common to both: settings link + no console
//! errors. It proves webview loaded, SPA mounted, IPC working — without
//! coupling to a specific layout.

import { test, assert, expect, invoke } from "./fixtures";
import type { Workspace } from "../src/shared/lib/types";

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

    // Wait for SPA to mount. `document.title` gets set after Solid's
    // RouterProvider renders; checking it immediately often returns ""
    // because the fixture's `connectTauri` returns as soon as the CDP
    // session is up — the app's bootstrap() is still running. Poll up
    // to 15s for the title to be set.
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

    // document.title gets set after Solid SPA mounts; empty means mount failed.
    const title = await page.evaluate(() => document.title);
    expect(title.length, "document.title should be non-empty (SPA must have mounted)").toBeGreaterThan(
      0,
    );

    // Settings link is in the footer in both layouts (V2.1) — universal.
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    await assert.visible(page.getByRole("link", { name: /设置/i }));

    // No uncaught errors at startup. Some apps log harmless warnings —
    // canary only watches `error` level.
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors during startup:\n${consoleErrors.join("\n")}`);
    }
  });

  test("D8-W: WorkspaceService usable immediately on app boot", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    const workspaces = await invoke<Workspace[]>(page, "list_workspaces");
    expect(Array.isArray(workspaces)).toBe(true);
    await invoke(page, "add_workspace", { label: "Boot Test", rootPath: "/tmp/boot-test" });
    const after = await invoke<Workspace[]>(page, "list_workspaces");
    expect(after.some((w) => w.label === "Boot Test")).toBe(true);
  });
});