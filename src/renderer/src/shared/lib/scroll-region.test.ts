
import { afterEach, describe, expect, it } from "vitest";
import {
  activeScrollRegionCount,
  activeScrollRegions,
  findActiveScrollRegion,
  findScrollRegions,
  MAIN_CONTENT_SCROLL_TESTID,
} from "@codeman-frontend/shared/lib/scroll-region";

function makeRegion(opts: { overflow: boolean; testid?: string }): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("data-scroll-region", "true");
  if (opts.testid) {
    el.setAttribute("data-testid", opts.testid);
  }
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    value: opts.overflow ? 2000 : 100,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    value: 100,
  });
  return el;
}

describe("scroll-region 断言模块 ", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("findScrollRegions 收集所有 data-scroll-region 标记", () => {
    const a = makeRegion({ overflow: true });
    const b = makeRegion({ overflow: false });
    document.body.append(a, b);
    expect(findScrollRegions(document.body)).toHaveLength(2);
  });

  it("activeScrollRegions 只保留真实溢出的滚动区", () => {
    const a = makeRegion({ overflow: true });
    const b = makeRegion({ overflow: false });
    document.body.append(a, b);
    expect(activeScrollRegions(document.body)).toHaveLength(1);
    expect(activeScrollRegions(document.body)[0]).toBe(a);
    expect(activeScrollRegionCount(document.body)).toBe(1);
  });

  it("正常布局：恰好一个活动滚动区（非 chat 页 = 主内容 wrapper）", () => {
    const wrapper = makeRegion({ overflow: true, testid: MAIN_CONTENT_SCROLL_TESTID });
    document.body.append(wrapper);
    const info = findActiveScrollRegion();
    expect(info).not.toBeNull();
    expect(info!.testid).toBe(MAIN_CONTENT_SCROLL_TESTID);
    expect(info!.selector).toBe(`[data-testid="${MAIN_CONTENT_SCROLL_TESTID}"]`);
    expect(info!.scrollHeight).toBe(2000);
    expect(activeScrollRegionCount(document.body)).toBe(1);
  });

  it("chat 布局：wrapper 恰好贴合（无溢出），消息区为唯一活动滚动区", () => {
    const wrapper = makeRegion({ overflow: false, testid: MAIN_CONTENT_SCROLL_TESTID });
    const messages = makeRegion({ overflow: true });
    document.body.append(wrapper, messages);
    expect(activeScrollRegionCount(document.body)).toBe(1);
    expect(findActiveScrollRegion()!.testid).toBeNull();
  });

  it("V2.9 回归：两个活动滚动区（双滚动条）→ count 2", () => {
    const a = makeRegion({ overflow: true });
    const b = makeRegion({ overflow: true });
    document.body.append(a, b);
    expect(activeScrollRegionCount(document.body)).toBe(2);
  });

  it("V2.10 回归：零个滚动区（无滚动通道）→ count 0 且 findActiveScrollRegion 返回 null", () => {
    document.body.replaceChildren(document.createElement("div"));
    expect(activeScrollRegionCount(document.body)).toBe(0);
    expect(findActiveScrollRegion()).toBeNull();
  });

  it("rootSel 限定查找范围（子容器内定位）", () => {
    const root = document.createElement("div");
    root.id = "root";
    const a = makeRegion({ overflow: true });
    root.append(a);
    document.body.append(root);
    expect(findActiveScrollRegion("#root")!.testid).toBeNull();
  });
});
