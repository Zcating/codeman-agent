
import { setTimeout as sleep } from "node:timers/promises";

const CDP_HOST = "127.0.0.1";

export const CDP_INJECT_SCRIPT = `
window.__cdp = (() => {
  function resolveLocator(sel) {
    const parts = String(sel).split(/\\s+>>\\s+/);
    let elements = [document];
    for (const part of parts) {
      const m = /^__getByRole__(\\w+)__(.+)__(.+)$/.exec(part);
      if (m) {
        const role = m[1];
        const nameRe = new RegExp(m[2]);
        const roleSel = m[3];
        elements = elements.flatMap(el => Array.from(el.querySelectorAll(roleSel)))
          .filter(el => nameRe.test((el.textContent || "").trim()));
      } else if (part.startsWith("__getByText__")) {
        const re = new RegExp(part.slice("__getByText__".length));
        elements = elements.flatMap(el => Array.from(el.querySelectorAll("*")))
          .filter(el => re.test((el.textContent || "").trim()));
      } else if (part.startsWith("__filterText__")) {
        const re = new RegExp(part.slice("__filterText__".length));
        elements = elements.filter(el => re.test((el.textContent || "").trim()));
      } else {
        const m2 = /^nth=(\\d+)$/.exec(part);
        if (m2) {
          const idx = parseInt(m2[1], 10);
          elements = elements[idx] ? [elements[idx]] : [];
        } else {
          elements = elements.flatMap(el => Array.from(el.querySelectorAll(part)));
        }
      }
      if (elements.length === 0) break;
    }
    return elements;
  }
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }
  function click(sel) {
    const el = resolveLocator(sel)[0];
    if (!el) throw new Error("click: not found: " + sel);
    el.scrollIntoView({ block: "center" });
    el.click();
  }
  function fill(sel, value) {
    const el = resolveLocator(sel)[0];
    if (!el) throw new Error("fill: not found: " + sel);
    el.focus();
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function count(sel) { return resolveLocator(sel).length; }
  function textContent(sel) {
    const el = resolveLocator(sel)[0];
    return el ? el.textContent : null;
  }
  function isVisibleFor(sel) {
    return isVisible(resolveLocator(sel)[0]);
  }
  function isHiddenFor(sel) {
    return !isVisible(resolveLocator(sel)[0]);
  }
  function valueOf(sel) {
    const el = resolveLocator(sel)[0];
    return el && "value" in el ? el.value : null;
  }
  function isEnabled(sel) {
    const el = resolveLocator(sel)[0];
    return !!el && !el.disabled;
  }
  return { resolveLocator, click, fill, count, textContent, isVisibleFor, isHiddenFor, valueOf, isEnabled };
})();
`;

export class ElectronLocator {
  constructor(
    readonly page: ElectronPage,
    readonly selector: string,
  ) {}

  first(): ElectronLocator {
    return this.nth(0);
  }

  nth(n: number): ElectronLocator {
    return new ElectronLocator(this.page, `${this.selector} >> nth=${n}`);
  }

  locator(inner: string): ElectronLocator {
    return new ElectronLocator(this.page, `${this.selector} >> ${inner}`);
  }

  filter(opts: { hasText: string | RegExp }): ElectronLocator {
    const re = opts.hasText instanceof RegExp ? opts.hasText.source : escapeRe(opts.hasText);
    return new ElectronLocator(this.page, `${this.selector} >> __filterText__${re}`);
  }

  async click(): Promise<void>;
  async click(opts: { timeout?: number }): Promise<void>;
  async click(opts: { timeout?: number } = {}): Promise<void> {
    const timeout = opts.timeout ?? 5_000;
    const deadline = Date.now() + timeout;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        await this.page.evaluate(__cdpClick, this.selector);
        return;
      } catch (e) {
        lastErr = e;
        await sleep(50);
      }
    }
    throw new Error(
      `click timed out after ${timeout}ms: ${this.selector} (last error: ${String(lastErr)})`,
    );
  }

  async waitFor(opts: { state?: "visible" | "hidden"; timeout?: number } = {}): Promise<void> {
    const state = opts.state ?? "visible";
    const timeout = opts.timeout ?? 5_000;
    const fnName = state === "visible" ? "isVisibleFor" : "isHiddenFor";
    await waitFor(
      async () =>
        await this.page.evaluate(
          (args: { sel: string; fn: string }) =>
            (window as unknown as Record<string, (s: string) => boolean>)[args.fn](args.sel),
          { sel: this.selector, fn: fnName },
        ),
      timeout,
      `waitFor(${state}): ${this.selector}`,
    );
  }

  async fill(value: string): Promise<void> {
    await this.page.evaluate(__cdpFill, this.selector, value);
  }

  async textContent(): Promise<string | null> {
    return await this.page.evaluate(__cdpText, this.selector);
  }

  async count(): Promise<number> {
    return await this.page.evaluate(__cdpCount, this.selector);
  }
}

export class ElectronPage {
  constructor(
    readonly conn: CDPConnection,
    readonly sessionId: string,
  ) {}

  async reinjectCdp(): Promise<void> {
    const currentResult = await this.conn.send(
      "Runtime.evaluate",
      {
        expression: CDP_INJECT_SCRIPT,
        returnByValue: true,
        awaitPromise: false,
      },
      this.sessionId,
    );
    if (currentResult.exceptionDetails) {
      throw new Error(
        currentResult.exceptionDetails.exception?.description ??
          currentResult.exceptionDetails.text ??
          "reinjectCdp current page failed",
      );
    }
    const futureResult = await this.conn.send(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source: CDP_INJECT_SCRIPT,
      },
      this.sessionId,
    );
    if (futureResult.exceptionDetails) {
      throw new Error(
        futureResult.exceptionDetails.exception?.description ??
          futureResult.exceptionDetails.text ??
          "reinjectCdp future pages failed",
      );
    }
  }

  async evaluate<T = unknown>(fn: (...args: any[]) => T | Promise<T>, ...args: any[]): Promise<T> {
    const expr = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(", ")})`;
    const result = await this.conn.send(
      "Runtime.evaluate",
      { expression: expr, returnByValue: true, awaitPromise: true },
      this.sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Runtime.evaluate failed",
      );
    }
    return result.result.value as T;
  }

  async url(): Promise<string> {
    return await this.evaluate(() => location.href);
  }

  async goto(path: string): Promise<void> {
    await this.evaluate((p: string) => {
      return new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const check = () => {
          if (Date.now() > deadline) {
            reject(
              new Error(
                `goto(${p}): page not loaded after 30s (URL=${document.URL})`,
              ),
            );
            return;
          }
          const w = window as unknown as { codeman?: unknown; __router?: { navigate: (args: { to: string }) => void } };
          if (document.URL !== "about:blank" && w.codeman) {
            if (w.__router) {
              w.__router.navigate({ to: p });
            } else {
              history.pushState(null, "", p);
              dispatchEvent(new PopStateEvent("popstate"));
            }
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }, path);
  }

  locator(selector: string): ElectronLocator {
    return new ElectronLocator(this, selector);
  }

  getByRole(role: "link" | "button" | "textbox", options: { name: RegExp | string }): ElectronLocator {
    const sel = roleSelFor(role);
    const nameSrc = options.name instanceof RegExp ? options.name.source : escapeRe(options.name);
    return new ElectronLocator(this, `__getByRole__${role}__${nameSrc}__${sel}`);
  }

  getByText(text: string, options: { exact?: boolean } = {}): ElectronLocator {
    const re = options.exact === false ? escapeRe(text) : `^${escapeRe(text)}$`;
    return new ElectronLocator(this, `__getByText__${re}`);
  }

  on(event: "console", handler: (e: { type: string; text: string }) => void): void;
  on(event: "pageerror", handler: (e: Error) => void): void;
  on(event: string, handler: unknown): void {
    if (event === "console") {
      (this as any).consoleHandler = handler;
    }
    if (event === "pageerror") {
      (this as any).pageErrorHandler = handler;
    }
  }

  close(): void {
    this.conn.close();
  }
}

const __cdpClick = (sel: string) => (window as any).__cdp.click(sel);
const __cdpFill = (sel: string, value: string) => (window as any).__cdp.fill(sel, value);
const __cdpText = (sel: string) => (window as any).__cdp.textContent(sel);
const __cdpCount = (sel: string) => (window as any).__cdp.count(sel);


type Locator = ElectronLocator;
type Page = ElectronPage;

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(50);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms: ${label}`);
}

export const assert = {
  async visible(locator: Locator, opts: { timeout?: number } = {}): Promise<void> {
    await waitFor(
      async () =>
        await locator.page.evaluate((s) => (window as any).__cdp.isVisibleFor(s), locator.selector),
      opts.timeout ?? 5_000,
      `visible: ${locator.selector}`,
    );
  },
  async hidden(locator: Locator, opts: { timeout?: number } = {}): Promise<void> {
    await waitFor(
      async () =>
        await locator.page.evaluate((s) => (window as any).__cdp.isHiddenFor(s), locator.selector),
      opts.timeout ?? 5_000,
      `hidden: ${locator.selector}`,
    );
  },
  async count(locator: Locator, expected: number, opts: { timeout?: number } = {}): Promise<void> {
    await waitFor(
      async () => (await locator.count()) === expected,
      opts.timeout ?? 5_000,
      `count(${expected}): ${locator.selector}`,
    );
  },
  async value(locator: Locator, expected: string, opts: { timeout?: number } = {}): Promise<void> {
    await waitFor(
      async () =>
        (await locator.page.evaluate((s) => (window as any).__cdp.valueOf(s), locator.selector)) ===
        expected,
      opts.timeout ?? 5_000,
      `value("${expected}"): ${locator.selector}`,
    );
  },
  async urlMatches(page: Page, regex: RegExp, opts: { timeout?: number } = {}): Promise<void> {
    await waitFor(
      async () => regex.test(await page.url()),
      opts.timeout ?? 5_000,
      `urlMatches(${regex}): current=${await page.url()}`,
    );
  },
  async enabled(locator: Locator, opts: { timeout?: number } = {}): Promise<void> {
    await waitFor(
      async () =>
        await locator.page.evaluate((s) => (window as any).__cdp.isEnabled(s), locator.selector),
      opts.timeout ?? 5_000,
      `enabled: ${locator.selector}`,
    );
  },
  async attached(locator: Locator, opts: { timeout?: number } = {}): Promise<void> {
    await this.visible(locator, opts);
  },
};


function roleSelFor(role: "link" | "button" | "textbox"): string {
  if (role === "link") {
    return `a,[role="link"]`;
  }
  if (role === "button") {
    return `button,[role="button"],input[type="button"],input[type="submit"]`;
  }
  return `input,textarea,[role="textbox"]`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


class CDPConnection {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private eventHandlers = new Map<string, (params: any) => void>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (event) => this.onMessage(event));
  }

  private onMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(String(event.data));
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`${msg.error.code ?? ""} ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        const handler = this.eventHandlers.get(msg.method);
        if (handler) {
          handler(msg.params);
        }
      }
    } catch {
    }
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg: Record<string, unknown> = { id, method, params };
      if (sessionId) {
        msg.sessionId = sessionId;
      }
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(method: string, handler: (params: any) => void): void {
    this.eventHandlers.set(method, handler);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
    }
  }
}

export async function connectElectron(opts: {
  cdpUrl?: string;
  pageUrlPattern?: RegExp;
} = {}): Promise<ElectronPage> {
  const cdpUrl = opts.cdpUrl ?? `http://${CDP_HOST}:9222`;
    const pageUrlPattern = opts.pageUrlPattern ?? /.*/;
  const res = await fetch(`${cdpUrl}/json/version`);
  if (!res.ok) {
    throw new Error(`CDP /json/version returned ${res.status} at ${cdpUrl}`);
  }
  const info = (await res.json()) as { webSocketDebuggerUrl: string };
  if (!info.webSocketDebuggerUrl) {
    throw new Error("CDP /json/version missing webSocketDebuggerUrl");
  }

  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")));
  });

  const conn = new CDPConnection(ws);

  const { targetInfos } = (await conn.send("Target.getTargets")) as {
    targetInfos: Array<{ targetId: string; type: string; url: string; title?: string }>;
  };
  console.log(`[cdp] ${cdpUrl} targets:`, targetInfos.map((t) => `${t.type}@${t.url}`).join(", "));
  const pageTargets = targetInfos.filter((t) => t.type === "page");
  if (pageTargets.length === 0) {
    throw new Error(
      `No page target found. Have ${targetInfos.length} targets: ${targetInfos
        .map((t) => `${t.type}@${t.url}`)
        .join(", ")}`,
    );
  }
  const target =
    pageUrlPattern.source === ".*"
      ? pageTargets[0]!
      : pageTargets.find((t) => pageUrlPattern.test(t.url)) ?? pageTargets[0]!;

  const { sessionId } = (await conn.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  })) as { sessionId: string };
  await conn.send("Page.enable", {}, sessionId);
  await conn.send("Runtime.enable", {}, sessionId);

  const page = new ElectronPage(conn, sessionId);

  await page.evaluate(new Function(CDP_INJECT_SCRIPT) as any);
  await conn.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: CDP_INJECT_SCRIPT,
    },
    sessionId,
  );

  conn.on("Runtime.consoleAPICalled", (params) => {
    const text = (params.args ?? []).map((a: any) => a.value ?? a.description ?? "").join(" ");
    (page as any).consoleHandler?.({ type: params.type, text });
  });
  conn.on("Runtime.exceptionThrown", (params) => {
    const text =
      params.exceptionDetails?.exception?.description ??
      params.exceptionDetails?.text ??
      "page error";
    (page as any).pageErrorHandler?.(new Error(text));
  });

  return page;
}

export const connectTauri = connectElectron;

export type TauriPage = ElectronPage;
export type TauriLocator = ElectronLocator;
export { ElectronPage as TauriPageClass };
