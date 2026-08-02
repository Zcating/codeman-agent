
// Scroll Region (滚动区) 布局契约 — per ADR-0039.
//
// 主栏（ResizablePanel#main）内「恰好一个」垂直滚动容器承载路由内容的滚动：
//   - 非 chat 路由：内容 wrapper（data-testid="main-content-scroll"）是唯一滚动区
//   - chat 路由：ChatView 消息区是唯一活动滚动区（wrapper 因 conversation-route
//     h-full overflow-hidden 恰好贴合、无溢出）
//
// 本模块是断言模块：findActiveScrollRegion / activeScrollRegions 供 vitest 与
// e2e 双端使用。注意 findActiveScrollRegion 必须自包含（无自由变量引用），
// 才能被 page.evaluate 序列化到浏览器上下文执行。

export const SCROLL_REGION_ATTR = "data-scroll-region";
export const MAIN_CONTENT_SCROLL_TESTID = "main-content-scroll";
export const MAIN_PANEL_SELECTOR = '[data-slot="resizable-panel"][data-id="main"]';

export interface ScrollRegionInfo {
  selector: string;
  testid: string | null;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** 在 root 下收集所有标记为滚动区的元素。 */
export function findScrollRegions(root: ParentNode = document.body): HTMLElement[] {
  return Array.from(root.querySelectorAll(`[${SCROLL_REGION_ATTR}]`)) as HTMLElement[];
}

/**
 * 活动滚动区 = scrollHeight 明显大于 clientHeight（内容真实溢出、滚动有意义）。
 * 「恰好一个活动滚动区」是 ADR-0039 的核心不变量：
 *   - 2 个 → V2.9 双滚动条回归
 *   - 0 个 → V2.10 无滚动通道回归
 */
export function activeScrollRegions(root: ParentNode = document.body): HTMLElement[] {
  return findScrollRegions(root).filter((el) => el.scrollHeight > el.clientHeight + 1);
}

export function activeScrollRegionCount(root: ParentNode = document.body): number {
  return activeScrollRegions(root).length;
}

/**
 * 主栏（或 rootSel 指定容器）内的活动滚动区信息；无则返回 null。
 * 自包含实现：字面量选择器内联，可在 e2e 里被 page.evaluate 序列化。
 */
export function findActiveScrollRegion(rootSel?: string): ScrollRegionInfo | null {
  const root =
    (rootSel
      ? document.querySelector(rootSel)
      : document.querySelector('[data-slot="resizable-panel"][data-id="main"]')) ??
    document.body;
  const regions = Array.from(root.querySelectorAll("[data-scroll-region]")) as HTMLElement[];
  const active = regions.filter((el) => el.scrollHeight > el.clientHeight + 1);
  const target = active[0] ?? null;
  if (!target) {
    return null;
  }
  const testid = target.getAttribute("data-testid");
  return {
    selector: testid ? `[data-testid="${testid}"]` : "[data-scroll-region]",
    testid,
    scrollTop: target.scrollTop,
    scrollHeight: target.scrollHeight,
    clientHeight: target.clientHeight,
  };
}
