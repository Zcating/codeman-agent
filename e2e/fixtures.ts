



































import { test as base, expect, type WorkerInfo } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync, rmSync, createWriteStream, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir, homedir } from "node:os";

import { connectElectron, type ElectronPage } from "./cdp-driver";
import { BASE_PORTS } from "../playwright.config";






const BASE_MOCK_PORT = 50000;
export const MOCK_BASE_URL_FOR_WORKER = (idx: number): string =>
  `http://127.0.0.1:${BASE_MOCK_PORT + idx}/mock/anthropic`;






const MOCK_BASE_URL_INJECT = (baseUrl: string) =>
  `window.__mockBaseUrl = ${JSON.stringify(baseUrl)};`;


export type ElectronEnv = {
  page: ElectronPage;
  workerIndex: number;
  cdpUrl: string;
  workerDataDir: string;
};

export type TauriEnv = ElectronEnv;


const PACKAGED_BIN = resolve(
  process.cwd(),
  "release",
  "win-unpacked",
  process.platform === "win32" ? "codeman-agent.exe" : "codeman-agent",
);
const LOCAL_BIN = resolve(
  process.cwd(),
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
const ELECTRON_BIN = existsSync(PACKAGED_BIN) ? PACKAGED_BIN : LOCAL_BIN;


const APP_ENTRY = existsSync(PACKAGED_BIN)
  ? null
  : resolve(process.cwd(), "dist-electron", "main", "index.js");




async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 404) {return;}
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(500);
  }
  throw new Error(
    `Timed out waiting for ${url} after ${timeoutMs}ms (last error: ${String(lastErr)})`,
  );
}

export const test = base.extend<{}, { tauriEnv: ElectronEnv; electronEnv: ElectronEnv }>({
  tauriEnv: [
    async ({}, use, workerInfo: WorkerInfo) => {
      const idx = workerInfo.parallelIndex;
      const cdpPort = BASE_PORTS.BASE_ELECTRON_CDP_PORT + idx;
      const cdpUrl = `http://127.0.0.1:${cdpPort}`;
      const userDataDir = join(tmpdir(), `codeman-e2e-w${idx}`);
      const logPath = join(userDataDir, "electron.log");

      
      
      
      rmSync(userDataDir, { recursive: true, force: true });
      mkdirSync(userDataDir, { recursive: true });

      
      
      
      
      
      const electronAppData = join(
        process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"),
        `codeman-agent.w${idx}`,
      );
      try {
        rmSync(electronAppData, { recursive: true, force: true });
      } catch {
        
      }

      
      
      
      const args = [`--remote-debugging-port=${cdpPort}`];
      if (APP_ENTRY) {args.push(APP_ENTRY);}

      const child: ChildProcess = spawn(
        ELECTRON_BIN,
        args,
        {
          env: {
            ...process.env,
            CODEMAN_TEST_WORKER: `w${idx}`,
            
            
            
            
            
            
            
            
            
            
            
            CODEMAN_MOCK_PORT: String(BASE_MOCK_PORT + idx),
            
            
            
            
            ELECTRON_DISABLE_GPU: "1",
            ELECTRON_NO_ATTACH_CONSOLE: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
          cwd: process.cwd(),
        },
      );

      
      const logStream = createWriteStream(logPath);
      child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk));
      child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk));

      let electronExitCode: number | null = null;
      child.once("exit", (code) => {
        electronExitCode = code;
      });

      try {
        
        await waitForUrl(`${cdpUrl}/json/version`, 60_000);


        
        
        
        
        
        const page = await connectElectron({
            cdpUrl,
            pageUrlPattern: /app:\/\/.*|file:\/\/.*index\.html/,
        });

        
        
        
        
        
        const mockBaseUrl = MOCK_BASE_URL_FOR_WORKER(idx);
        const injectScript = MOCK_BASE_URL_INJECT(mockBaseUrl);
        
        await page.conn.send(
          "Runtime.evaluate",
          {
            expression: injectScript,
            returnByValue: true,
            awaitPromise: false,
          },
          page.sessionId,
        );
        
        
        await page.conn.send(
          "Page.addScriptToEvaluateOnNewDocument",
          { source: injectScript },
          page.sessionId,
        );

        
        try {
          const probe = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            bodyChars: document.body?.innerText?.length ?? 0,
            bodySample: document.body?.innerText?.slice(0, 200) ?? "",
            asideExists: !!document.querySelector("aside"),
            codemanExists: !!(window as unknown as { codeman?: unknown }).codeman,
            codemanKeys: (window as unknown as { codeman?: { [k: string]: unknown } }).codeman
              ? Object.keys((window as unknown as { codeman: { [k: string]: unknown } }).codeman).length
              : 0,
          }));
          console.log(
            `[tauriEnv w${idx}] page probe: ${JSON.stringify(probe)}`,
          );
        } catch (probeErr) {
          console.log(
            `[tauriEnv w${idx}] page probe failed: ${String(probeErr)}`,
          );
        }

        const env: ElectronEnv = {
          page,
          workerIndex: idx,
          cdpUrl,
          workerDataDir: userDataDir,
        };

        await use(env);
      } catch (e) {
        if (electronExitCode !== null) {
          throw new Error(
            `Electron exited with code ${electronExitCode} before fixtures ready. ` +
              `Log: ${logPath}\nOriginal error: ${String(e)}`,
          );
        }
        throw e;
      } finally {
        try {
          child.kill("SIGKILL");
        } catch {
          
        }
        await sleep(500);
        try {
          logStream.end();
        } catch {
          
        }
        console.log(`[tauriEnv w${idx}] log preserved at ${logPath}`);
      }
    },
    { scope: "worker", auto: true },
  ],
  
  electronEnv: [
    async ({ tauriEnv }, use) => {
      await use(tauriEnv);
    },
    { scope: "worker", auto: false },
  ],
});

export { expect };





export {
  invoke,
  assert,
  cancelRunningAgent,
  clearAllHistory,
  clickNewConversationAndWait,
  disposeTauriPage,
  expandWorkspace,
  getTauriPage,
  nthConv,
  resetChatState,
  resetSidebar,
  setupWorkspaceAndCreateConvViaIpc,
  submitForm,
  submitHomeAgentForm,
} from "./helpers";

export type { TauriLocator, TauriPage } from "./helpers";