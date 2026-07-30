











import { assert, ElectronLocator, ElectronPage } from "./cdp-driver";
import type { Workspace } from "../src/renderer/shared/lib/types";
import * as path from "node:path";
import * as os from "node:os";


export { ElectronLocator, ElectronPage, assert };

export type TauriLocator = ElectronLocator;

export type TauriPage = ElectronPage;


export async function invoke<T = unknown>(
  page: ElectronPage,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await page.evaluate(
    async ([c, a]) => {
      const w = window as unknown as {
        codeman?: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
      };
      if (!w.codeman) {
        throw new Error(
          "window.codeman is missing — is the V3 Electron preload actually loaded?",
        );
      }
      try {
        return await w.codeman.invoke(c, a ?? {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null ? JSON.stringify(e) : String(e);
        throw new Error(`V3 invoke(${c}) failed: ${msg}`);
      }
    },
    [cmd, args ?? {}] as const,
  );
  return result as T;
}


export async function submitForm(p: ElectronPage): Promise<void> {
  await p.locator('button[type="submit"]').click();
}


export async function clearAllHistory(page: ElectronPage): Promise<void> {
  try {
    await invoke(page, "clearAllHistory");
  } catch {
    
  }
}


export async function cancelRunningAgent(page: ElectronPage): Promise<void> {
  
  let clicked = false;
  try {
    const cancelBtn = page.locator("button").filter({ hasText: /^取消$/ });
    await cancelBtn.first().click({ timeout: 10_000 });
    clicked = true;
  } catch {
    
  }
  if (clicked) {
    
    try {
      await page.locator('button[type="submit"]').waitFor({
        state: "visible",
        timeout: 10_000,
      });
    } catch {
      
    }
  }
}


export async function resetChatState(page: TauriPage): Promise<void> {
  try {
    await cancelRunningAgent(page);
    await invoke(page, "clearAllHistory");
  } catch {  }

  await page.goto("/");
  await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });
}


export async function setupWorkspaceAndCreateConvViaIpc(
  p: TauriPage,
  opts: { workspaceLabel?: string; workspaceRoot?: string; title?: string } = {},
): Promise<{ workspaceId: string; convId: string }> {
  const label = opts.workspaceLabel ?? "E2E Test Workspace";
  const root = opts.workspaceRoot ?? path.join(os.tmpdir(), `codeman-e2e-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const title = opts.title ?? "E2E Test Conv";

  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  
  try {
    const oldWorkspaces = await invoke<{ id: string }[]>(p, "listWorkspaces");
    for (const ws of oldWorkspaces) {
      await invoke(p, "deleteWorkspace", { id: ws.id });
    }
  } catch {  }

  
  const actualWsId = (await invoke<Workspace>(p, "addWorkspace", { label, rootPath: root })).id;

  
  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  
  const { convId } = await clickNewConversationAndWait(p, { workspaceLabel: label, title });

  return { workspaceId: actualWsId, convId };
}


export async function submitHomeAgentForm(p: TauriPage, text: string): Promise<void> {
  await p.locator("[data-testid='codex-input']").fill(text);
  await p.locator("[data-testid='codex-send']").click();
}


export async function clickNewConversationAndWait(
  p: TauriPage,
  opts: { workspaceLabel?: string; title?: string } = {},
): Promise<{ convId: string }> {
  
  await p.goto("/");

  
  
  
  await p.evaluate(() => {
    const w = window as unknown as { __chatStore?: { loadWorkspacesAsync: () => Promise<void> } };
    return w.__chatStore?.loadWorkspacesAsync() ?? Promise.resolve();
  });

  
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  
  
  
  
  
  
  
  
  
  
  
  
  
  const wsLabel = opts.workspaceLabel;
  await p.evaluate(async (label: string | null) => {
    const trigger = document.querySelector('[data-testid="workspace-select-trigger"]') as HTMLElement;
    if (!trigger) {return;}
    const triggerText = (trigger.textContent ?? "").trim();
    const needsSelect = label !== null || triggerText === "" || triggerText === "Select a workspace…";
    if (!needsSelect) {return;}
    trigger.click();
    
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const content = document.querySelector('[data-testid="workspace-select-content"]');
      if (content) {
        const items = content.querySelectorAll<HTMLElement>('[role="option"]');
        if (items.length > 0) {
          if (label !== null) {
            for (const item of Array.from(items)) {
              const text = (item.textContent ?? "").trim();
              if (text === label) { item.click(); break; }
            }
          } else {
            items[0]!.click();
          }
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }, wsLabel ?? null);
  await new Promise((r) => setTimeout(r, 300));

  
  const text = opts.title ?? "E2E Test Conv";
  await p.locator('[data-testid="codex-input"]').fill(text);

  await p.locator('[data-testid="codex-send"]').click();

  
  await assert.visible(
    p.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );

  
  
  const convId = await p.evaluate(() => {
    const w = window as unknown as {
      __router?: {
        state: {
          location: {
            pathname: string;
            params?: Record<string, unknown>;
          };
        };
      };
    };
    if (w.__router) {
      
      const params = w.__router.state.location.params;
      if (params && typeof params === "object" && "convId" in params) {
        return String((params as { convId: unknown }).convId);
      }
      const m = w.__router.state.location.pathname.match(/\/conversation\/(.+)/);
      if (m) {return m[1] ?? null;}
    }
    const m = window.location.pathname.match(/\/conversation\/(.+)/);
    return m?.[1] ?? null;
  });
  if (!convId) {
    throw new Error("clickNewConversationAndWait: no convId in URL after navigation");
  }

  return { convId };
}




export async function ensureWorkspaceByPath(
  p: TauriPage,
  opts: { rootPath: string; label?: string; selectAsLastUsed?: boolean },
): Promise<string> {
  const workspaces = await invoke<{ id: string; rootPath: string }[]>(p, "listWorkspaces");
  const existing = workspaces.find((ws) => ws.rootPath === opts.rootPath);
  if (existing) {
    return existing.id;
  }
  
  const label = opts.label ?? opts.rootPath.split(/[/\\]/).pop() ?? "E2E WS";
  const id = (await invoke<Workspace>(p, "addWorkspace", { label, rootPath: opts.rootPath })).id;
  return id;
}


export async function expandWorkspace(p: TauriPage, workspaceId: string): Promise<void> {
  
  
  const isOpen = await p.evaluate((id: string) => {
    
    const item = document.querySelector(`[data-value="${id}"]`);
    return item?.getAttribute("data-state") === "open";
  }, workspaceId);
  if (!isOpen) {
    await p.locator(`[data-value="${workspaceId}"] button`).first().click();
  }
}


export async function clickConv(p: TauriPage, convId: string): Promise<void> {
  await p.locator(`[data-value="${convId}"]`).click();
}


export async function nthConv(
  p: TauriPage,
  n: number,
  scope?: { workspaceId?: string },
): Promise<{ convId: string; workspaceId: string }> {
  const result = await p.evaluate(
    (args: { n: number; workspaceId?: string }) => {
      if (args.workspaceId) {
        
        const ws = document.querySelector(`[data-value="${args.workspaceId}"]`);
        if (!ws) {return null;}
        
        const convs = Array.from(ws.querySelectorAll('a[data-value]'));
        const el = convs[args.n];
        if (!el) {return null;}
        
        return {
          convId: el.getAttribute("data-value")!,
          workspaceId: args.workspaceId,
        };
      } else {
        
        const convs = Array.from(document.querySelectorAll(`aside [data-value]`));
        const el = convs[args.n];
        if (!el) {return null;}
        
        const parentWs = el.closest("[data-value]");
        return {
          convId: el.getAttribute("data-value")!,
          workspaceId: parentWs?.getAttribute("data-value") ?? "",
        };
      }
    },
    { n, workspaceId: scope?.workspaceId },
  );
  if (!result) {throw new Error(`nthConv(${n}): not found`);}
  return result;
}


export async function resetSidebar(p: TauriPage): Promise<void> {
  await clearAllHistory(p);
  try {
    const workspaces = await invoke<{ id: string }[]>(p, "listWorkspaces");
    for (const ws of workspaces) {
      await invoke(p, "deleteWorkspace", { id: ws.id });
    }
  } catch {
    
  }
}








export async function getTauriPage(): Promise<never> {
  throw new Error(
    "getTauriPage() is removed in the multi-worker refactor. " +
      "Use the tauriEnv fixture: `test('...', async ({ tauriEnv }) => { const { page } = tauriEnv; ... })`",
  );
}


export async function disposeTauriPage(): Promise<void> {
  
}