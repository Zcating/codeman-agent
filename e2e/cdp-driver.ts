//! e2e/cdp-driver.ts — 直接通过 Chrome DevTools Protocol 驱动 WebView2。
//!
//! 背景：Playwright 的 `chromium.connectOverCDP` 在连接 WebView2 时会调用
//! `Browser.setDownloadBehavior`，但 WebView2 的 CDP 服务响应 "Browser
//! context management is not supported"，导致 Playwright 关闭 WS 抛出。
//! 走标准 Playwright API 跑不通；改为直接连 WebView2 的 WS endpoint + 用
//! `Runtime.evaluate` 驱动页面 + 包装 Playwright 风格的 Page/Locator API。
//!
//! 注入策略：connect 时把 `__cdp` 工具对象挂到 `window`，所有 Locator 操作
//! 都通过 `__cdp.resolve(selector)` 在页面里跑 JS 找元素 + 触发动作。
//! 这样不依赖 CDP 的 DOM 协议（WebView2 也部分实现），纯 Runtime.evaluate。

import { setTimeout as sleep } from "node:timers/promises";

const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9333;

/** 注入到页面的工具对象。所有 Locator 操作最终调它。导出供 helpers 在 page reload 后 re-inject。 */
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

/** Locator — 支持 Playwright 风格链式。 */
export class TauriLocator {
  constructor(
    readonly page: TauriPage,
    readonly selector: string,
  ) {}

  first(): TauriLocator {
    return this.nth(0);
  }

  nth(n: number): TauriLocator {
    return new TauriLocator(this.page, `${this.selector} >> nth=${n}`);
  }

  locator(inner: string): TauriLocator {
    return new TauriLocator(this.page, `${this.selector} >> ${inner}`);
  }

  /** 过滤匹配的元素 — 用 `hasText` 缩小范围。 */
  filter(opts: { hasText: string | RegExp }): TauriLocator {
    const re = opts.hasText instanceof RegExp ? opts.hasText.source : escapeRe(opts.hasText);
    return new TauriLocator(this.page, `${this.selector} >> __filterText__${re}`);
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

/** Page — 包装 CDP 连接 + 提供 Playwright 风格的查询/事件 API。 */
export class TauriPage {
  constructor(
    readonly conn: CDPConnection,
    readonly sessionId: string,
  ) {}

  /** 重新注入 __cdp helper(page reload 后 window.__cdp 会丢失)。 */
  async reinjectCdp(): Promise<void> {
    await this.evaluate(new Function(CDP_INJECT_SCRIPT) as any);
  }

  /** 在页面里跑 JS。函数会被序列化后通过 Runtime.evaluate 传过去。 */
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

  /** 导航到指定 URL — 走 history.pushState 让 TanStack Router 接住。 */
  async goto(path: string): Promise<void> {
    await this.evaluate((p: string) => {
      history.pushState(null, "", p);
      dispatchEvent(new PopStateEvent("popstate"));
    }, path);
  }

  locator(selector: string): TauriLocator {
    return new TauriLocator(this, selector);
  }

  getByRole(role: "link" | "button" | "textbox", options: { name: RegExp | string }): TauriLocator {
    const sel = roleSelFor(role);
    const nameSrc = options.name instanceof RegExp ? options.name.source : escapeRe(options.name);
    return new TauriLocator(this, `__getByRole__${role}__${nameSrc}__${sel}`);
  }

  getByText(text: string, options: { exact?: boolean } = {}): TauriLocator {
    const re = options.exact === false ? escapeRe(text) : `^${escapeRe(text)}$`;
    return new TauriLocator(this, `__getByText__${re}`);
  }

  on(event: "console", handler: (e: { type: string; text: string }) => void): void;
  on(event: "pageerror", handler: (e: Error) => void): void;
  on(event: string, handler: unknown): void {
    if (event === "console") (this as any).consoleHandler = handler;
    if (event === "pageerror") (this as any).pageErrorHandler = handler;
  }

  close(): void {
    this.conn.close();
  }
}

// 在 Runtime.evaluate 字符串里跑的函数体（被 toString 后注入到页面）
const __cdpClick = (sel: string) => (window as any).__cdp.click(sel);
const __cdpFill = (sel: string, value: string) => (window as any).__cdp.fill(sel, value);
const __cdpText = (sel: string) => (window as any).__cdp.textContent(sel);
const __cdpCount = (sel: string) => (window as any).__cdp.count(sel);

// ---- 断言工具 ----

type Locator = TauriLocator;
type Page = TauriPage;

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
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

// ---- 内部 ----

function roleSelFor(role: "link" | "button" | "textbox"): string {
  if (role === "link") return `a,[role="link"]`;
  if (role === "button") return `button,[role="button"],input[type="button"],input[type="submit"]`;
  return `input,textarea,[role="textbox"]`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- CDP 传输 ----

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
        if (msg.error) reject(new Error(`${msg.error.code ?? ""} ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        const handler = this.eventHandlers.get(msg.method);
        if (handler) handler(msg.params);
      }
    } catch {
      // ignore parse errors
    }
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg: Record<string, unknown> = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
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
      // ignore
    }
  }
}

/** 顶层入口 — 连 WebView2,attach 页面,返回 TauriPage。 */
export async function connectTauri(): Promise<TauriPage> {
  const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/version`);
  if (!res.ok) throw new Error(`CDP /json/version returned ${res.status}`);
  const info = (await res.json()) as { webSocketDebuggerUrl: string };
  if (!info.webSocketDebuggerUrl) throw new Error("CDP /json/version missing webSocketDebuggerUrl");

  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")));
  });

  const conn = new CDPConnection(ws);

  // 找 Tauri 页面 target
  const { targetInfos } = (await conn.send("Target.getTargets")) as {
    targetInfos: Array<{ targetId: string; type: string; url: string; title?: string }>;
  };
  const tauri = targetInfos.find(
    (t) =>
      t.type === "page" && (t.url.includes("localhost:1420") || t.url.includes("127.0.0.1:1420")),
  );
  if (!tauri) {
    throw new Error(
      `No Tauri page target found. Have ${targetInfos.length} targets: ${targetInfos
        .map((t) => `${t.type}@${t.url}`)
        .join(", ")}`,
    );
  }

  const { sessionId } = (await conn.send("Target.attachToTarget", {
    targetId: tauri.targetId,
    flatten: true,
  })) as { sessionId: string };
  await conn.send("Page.enable", {}, sessionId);
  await conn.send("Runtime.enable", {}, sessionId);

  const page = new TauriPage(conn, sessionId);

  // 注入 __cdp 工具
  await page.evaluate(new Function(CDP_INJECT_SCRIPT) as any);

  // 转发 console / pageerror
  conn.on("Runtime.consoleAPICalled", (params) => {
    // 通过 evaluate 把事件回传出来太重；直接在 Node 端拼一份 message
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
