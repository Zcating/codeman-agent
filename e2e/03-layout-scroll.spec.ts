
// 03 — Layout contract: 页面级 ScrollArea 统一滚动模型 (ADR-0039)
//
// 守卫三个历史回归：
//   - V2.9  (2bf2d7d): SidebarInset overflow-y-auto → chat 页双滚动条 + 工具栏滚走
//   - V2.10 (回归):     移除后 wrapper 无滚动通道 → 非 chat 页无法滚动
//   - 2026-08-05 契约演进: 非 chat 页面最外层统一包 shadcn ScrollArea
//
// 场景 A：超高设置页（6 providers）→ 页面级 ScrollArea 是唯一活动滚动区，wheel 生效，工具栏钉住。
//         契约演进（2026-08-05）：设置页主栏内 now 有 wrapper + 页面 ScrollArea 两个
//         data-scroll-region，但活动滚动区是页面 ScrollArea（ViewPort），wrapper 不滚动。
// 场景 B：chat-view（长消息）→ 消息区是唯一活动滚动区，wrapper 恰好贴合不溢出，工具栏钉住。
//
// wheel 走 CDP Input.dispatchMouseEvent(mouseWheel) 真实输入路径（合成
// WheelEvent dispatchEvent 不触发 Chromium 默认滚动）。
//
// 断言锚点：[data-scroll-region]（shadcn ScrollArea 的 Viewport 契约标记，
// 即真正的滚动元素）+ [data-testid="main-content-scroll"]。

import { test, expect, assert, invoke, submitForm, type TauriPage } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import type { Settings } from "../src/renderer/shared/lib/types";
import * as path from "node:path";
import * as os from "node:os";

interface ScrollContractSnapshot {
  regionCount: number;
  activeCount: number;
  activeIsWrapper: boolean;
  wrapperOverflows: boolean;
  toolbarTop: number;
}

async function scrollContractSnapshot(page: TauriPage): Promise<ScrollContractSnapshot> {
  return await page.evaluate(() => {
    const main =
      document.querySelector('[data-slot="resizable-panel"][data-id="main"]') ?? document.body;
    const regions = Array.from(main.querySelectorAll("[data-scroll-region]")) as HTMLElement[];
    const active = regions.filter((el) => el.scrollHeight > el.clientHeight + 1);
    const wrapper = regions.find(
      (el) => el.getAttribute("data-testid") === "main-content-scroll",
    );
    const toolbar = document.querySelector('[data-testid="sidebar-toolbar"]');
    return {
      regionCount: regions.length,
      activeCount: active.length,
      activeIsWrapper:
        active.length === 1 && active[0]?.getAttribute("data-testid") === "main-content-scroll",
      wrapperOverflows: wrapper
        ? wrapper.scrollHeight > wrapper.clientHeight + 1
        : false,
      toolbarTop: toolbar ? Math.round(toolbar.getBoundingClientRect().top) : -1,
    };
  });
}

interface WheelResult {
  before: number;
  after: number;
  delta: number;
}

async function wheelActiveRegion(page: TauriPage, deltaY: number): Promise<WheelResult> {
  // 合成 WheelEvent dispatchEvent 不触发 Chromium 默认滚动——必须走 CDP
  // Input.dispatchMouseEvent(mouseWheel) 的真实输入路径（与 Playwright
  // mouse.wheel 同一机制）。
  const center = await page.evaluate(() => {
    const main =
      document.querySelector('[data-slot="resizable-panel"][data-id="main"]') ?? document.body;
    const regions = Array.from(main.querySelectorAll("[data-scroll-region]")) as HTMLElement[];
    const active = regions.filter((el) => el.scrollHeight > el.clientHeight + 1);
    const el = active[0];
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + Math.min(120, r.height / 2), before: el.scrollTop };
  });
  if (!center) {
    return { before: -1, after: -1, delta: 0 };
  }
  await (page as unknown as { conn: { send: (m: string, p: Record<string, unknown>, s?: string) => Promise<unknown> }; sessionId: string }).conn.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseWheel",
      x: Math.round(center.x),
      y: Math.round(center.y),
      deltaX: 0,
      deltaY,
    },
    (page as unknown as { sessionId: string }).sessionId,
  );
  await new Promise((r) => setTimeout(r, 150));
  const after = await page.evaluate(() => {
    const main =
      document.querySelector('[data-slot="resizable-panel"][data-id="main"]') ?? document.body;
    const regions = Array.from(main.querySelectorAll("[data-scroll-region]")) as HTMLElement[];
    const active = regions.filter((el) => el.scrollHeight > el.clientHeight + 1);
    return active[0] ? active[0].scrollTop : -1;
  });
  return { before: center.before, after, delta: after - center.before };
}

async function waitForActiveScrollRegion(page: TauriPage, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await scrollContractSnapshot(page);
    if (info.activeCount === 1) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("waitForActiveScrollRegion: 主栏内未出现恰好一个活动滚动区");
}

async function seedTallProviders(page: TauriPage): Promise<void> {
  const current = await invoke<Settings>(page, "getSettings");
  const providers = Array.from({ length: 6 }, (_, i) => ({
    id: `scroll-provider-${i}`,
    label: `Scroll Test Provider ${i}`,
    enabled: true,
    apiKey: "",
    llm: {
      defaultModel: "m",
      baseUrl: "http://127.0.0.1:59999/mock/anthropic",
      apiType: "anthropic-messages" as const,
      models: [
        {
          id: "m",
          label: "m",
          contextWindow: 100_000,
          deprecated: false,
          thinking: false,
        },
      ],
      modelsEndpoint: "",
    },
  }));
  await invoke(page, "updateSettings", { newSettings: { ...current, providers } });
  await page.evaluate(async () => {
    const w = window as unknown as {
      __appStore?: { refreshAsync: () => Promise<unknown> };
    };
    if (w.__appStore) {
      await w.__appStore.refreshAsync();
    }
  });
}

test.describe("03 — Layout contract: 主内容区 = 唯一滚动容器", () => {
  test.describe.configure({ mode: "serial" });

  test("A: 超高设置页 — 页面 ScrollArea 为唯一活动滚动区，wheel 生效，工具栏钉住", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    await seedTallProviders(page);
    await page.goto("/settings/llm");
    await assert.visible(page.locator('[data-testid="main-content-scroll"]'), { timeout: 15_000 });
    await waitForActiveScrollRegion(page);

    const snap = await scrollContractSnapshot(page);
    expect(snap.regionCount, "设置页主栏应有两个 data-scroll-region（wrapper + 页面 ScrollArea）").toBe(2);
    expect(snap.activeCount, "恰好一个活动滚动区").toBe(1);
    expect(snap.activeIsWrapper, "活动滚动区必须是页面 ScrollArea，不是 wrapper").toBe(false);
    expect(snap.wrapperOverflows, "wrapper 必须恰好贴合（页面 ScrollArea 接管滚动）").toBe(false);
    expect(snap.toolbarTop, "工具栏钉在顶部").toBe(0);

    // 活动滚动区必须是页面级 ScrollArea 的 Viewport（契约标记落点）
    const activeIsViewport = await page.evaluate(() => {
      const main =
        document.querySelector('[data-slot="resizable-panel"][data-id="main"]') ?? document.body;
      const regions = Array.from(main.querySelectorAll("[data-scroll-region]")) as HTMLElement[];
      const active = regions.filter((el) => el.scrollHeight > el.clientHeight + 1);
      return active.length === 1 && active[0]?.getAttribute("data-slot") === "scroll-area-viewport";
    });
    expect(activeIsViewport, "活动滚动区必须是 ScrollArea Viewport").toBe(true);

    const wheel = await wheelActiveRegion(page, 600);
    expect(wheel.before, "滚动前 scrollTop 应为 0").toBe(0);
    expect(wheel.delta, "wheel 向下应改变 scrollTop（V2.10 无滚动回归守卫）").toBeGreaterThan(0);

    const afterSnap = await scrollContractSnapshot(page);
    expect(afterSnap.toolbarTop, "滚动后工具栏仍钉在顶部").toBe(0);
    expect(afterSnap.activeCount, "滚动后仍恰好一个活动滚动区").toBe(1);
  });

  test("B: chat-view — 消息区为唯一活动滚动区，wrapper 不溢出，工具栏钉住", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    await useMockProvider(page);
    const ws = await invoke<{ id: string }>(page, "addWorkspace", {
      label: "Scroll Chat WS",
      rootPath: path.join(
        os.tmpdir(),
        `codeman-e2e-scroll-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
      ),
    });

    // 经 IPC 直建会话并导航（绕过 Home 表单：它有既有的 stale-onMount-error
    // bug —— 单个 workspace 自动选中后 setFieldValue 不重校验，表单永久不可提交）
    const conv = await invoke<{ id: string }>(page, "createConversation", {
      title: "E2E Test Conv",
      systemPrompt: null,
      workspaceId: ws.id,
    });
    await page.evaluate((convId: string) => {
      (window as unknown as { __router?: { navigate: (a: { to: string }) => void } }).__router?.navigate({
        to: `/conversation/${convId}`,
      });
    }, conv.id);
    await assert.visible(page.locator('textarea[placeholder="发条消息\u2026"]'), { timeout: 15_000 });

    // 一条超长消息 → 用户 bubble 单条即超高，消息区必然溢出
    const longText = Array.from({ length: 120 }, (_, i) => `scroll-line-${i}`).join("\n");
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill(longText);
    await submitForm(page);
    await assert.visible(
      page.locator("div.justify-end > div.bg-primary.text-primary-foreground").first(),
      { timeout: 10_000 },
    );
    await waitForActiveScrollRegion(page);

    // 等待 assistant 流式结束（chat-view 的 auto-scroll 会随消息追加移动 scrollTop，
    // 必须等流结束后 wheel 断言才稳定）
    const sendDeadline = Date.now() + 25_000;
    while (Date.now() < sendDeadline) {
      const runningCount = await page.locator('[aria-label="停止运行"]').count();
      if (runningCount === 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const snap = await scrollContractSnapshot(page);
    expect(snap.regionCount, "chat 页应有两个 data-scroll-region（wrapper + 消息区）").toBe(2);
    expect(snap.activeCount, "恰好一个活动滚动区（消息区）").toBe(1);
    expect(snap.activeIsWrapper, "活动滚动区不能是 wrapper").toBe(false);
    expect(snap.wrapperOverflows, "wrapper 必须恰好贴合（无双滚动条）").toBe(false);
    expect(snap.toolbarTop, "工具栏钉在顶部").toBe(0);

    // 双滚动条回归守卫：消息区 viewport 隐藏原生滚动条（zag 只注入
    // overflow:auto），否则与 shadcn 自定义 ScrollBar 并排 = 两个重复滚动条。
    const viewportScrollbarWidth = await page.evaluate(() => {
      const main =
        document.querySelector('[data-slot="resizable-panel"][data-id="main"]') ?? document.body;
      const vp = main.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"][data-scroll-region="true"]',
      );
      return vp ? getComputedStyle(vp).scrollbarWidth : "no-viewport";
    });
    expect(viewportScrollbarWidth, "消息区 viewport 原生滚动条应隐藏（scrollbar-width: none）").toBe(
      "none",
    );

    const wheel = await wheelActiveRegion(page, -400);
    expect(wheel.delta, "消息区 wheel 向上应改变 scrollTop").toBeLessThan(0);

    const afterSnap = await scrollContractSnapshot(page);
    expect(afterSnap.toolbarTop, "滚动后工具栏仍钉在顶部").toBe(0);
  });
});
