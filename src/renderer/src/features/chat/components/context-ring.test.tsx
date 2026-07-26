//! ContextRing — chat-view 发送按钮左侧的 context window 进度指示器 (V2.6, ADR-0036)。
//!
//! Props in, DOM out 契约(< 50 LOC)。
//! 不测 chat-view 集成 — 那层归 `chat-view.test.tsx`。

import { createSignal } from "solid-js";
import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { ContextRing } from "@codeman-frontend/features/chat/components/context-ring";

afterEach(() => cleanup());

describe("ContextRing", () => {
  it("renders percentage label and token pair", () => {
    const { container } = render(() => (
      <ContextRing percentage={32} usedTokens={64000} totalTokens={200000} />
    ));

    const root = container.querySelector('[data-testid="context-ring"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute("data-context-pct")).toBe("32");
    expect(root?.getAttribute("aria-label")).toBe("context usage 32%");

    // 32% rounded label + 64K/200K compact format
    expect(root?.textContent).toContain("32%");
    expect(root?.textContent).toContain("64K/200K");
  });

  // 空态(`totalTokens <= 0` 不渲染)由调用方用 `<Show>` 控制,见 chat-view.test.tsx —
  // ContextRing 现在是无条件渲染的纯展示组件。

  it("clamps percentage to [0, 100] range and rounds to nearest integer", () => {
    const over = render(() => (
      <ContextRing percentage={150} usedTokens={1} totalTokens={1} />
    ));
    expect(over.container.querySelector('[data-context-pct]')?.getAttribute("data-context-pct")).toBe("100");
    over.unmount();

    const under = render(() => (
      <ContextRing percentage={-20} usedTokens={0} totalTokens={1} />
    ));
    expect(under.container.querySelector('[data-context-pct]')?.getAttribute("data-context-pct")).toBe("0");
  });

  it("renders an SVG with two circles (track + arc)", () => {
    const { container } = render(() => (
      <ContextRing percentage={50} usedTokens={1000} totalTokens={2000} />
    ));
    const svg = container.querySelector('[data-testid="context-ring"] svg');
    expect(svg).toBeTruthy();
    // track (stroke-muted) + arc (stroke-primary) = 2 circles
    expect(svg?.querySelectorAll("circle")).toHaveLength(2);
    // arc's stroke-dashoffset scales with percentage — 50% → half circumference offset
    const arc = svg?.querySelectorAll("circle")[1];
    expect(arc?.getAttribute("stroke-dashoffset")).toBeTruthy();
    expect(arc?.getAttribute("stroke-linecap")).toBe("round");
  });

  it("includes tooltip with percentage and token pair", () => {
    const { container } = render(() => (
      <ContextRing percentage={45} usedTokens={90000} totalTokens={200000} />
    ));
    const root = container.querySelector('[data-testid="context-ring"]');
    expect(root?.getAttribute("title")).toBe("45% · 90K / 200K tokens");
  });

  it("reactively updates displayed percentage and tooltip when props change", () => {
    // 这一条是 P0 防回归:保证 ContextRing 的派生值真的响应 props,
    // 而不是组件首次挂载时一次性 const 算死。用 `const pct = Math.round(...)`
    // 那版这条会挂 — 详见 context-ring.tsx 顶部 note。
    const [percentage, setPercentage] = createSignal(20);
    const [usedTokens, setUsedTokens] = createSignal(40_000);

    const { container } = render(() => (
      <ContextRing
        percentage={percentage()}
        usedTokens={usedTokens()}
        totalTokens={200_000}
      />
    ));

    const root = () => container.querySelector('[data-testid="context-ring"]');
    expect(root()?.getAttribute("data-context-pct")).toBe("20");
    expect(root()?.getAttribute("title")).toBe("20% · 40K / 200K tokens");
    expect(root()?.textContent).toContain("20%");

    setPercentage(73);
    expect(root()?.getAttribute("data-context-pct")).toBe("73");
    expect(root()?.getAttribute("title")).toBe("73% · 40K / 200K tokens");
    expect(root()?.textContent).toContain("73%");

    setUsedTokens(150_000);
    expect(root()?.getAttribute("title")).toBe("73% · 150K / 200K tokens");
  });
});