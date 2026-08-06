
import { createSignal } from "solid-js";
import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    expect(root?.textContent).toContain("32%");
    expect(root?.textContent).toContain("64K/200K");
  });


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
    expect(svg?.querySelectorAll("circle")).toHaveLength(2);
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

describe("ContextRing compaction integration (onCompact)", () => {
  it("onCompact 传入时渲染可点击的用量环 trigger；未传入时保持纯展示", () => {
    const { container } = render(() => (
      <ContextRing
        percentage={10}
        usedTokens={20_000}
        totalTokens={200_000}
        onCompact={vi.fn()}
      />
    ));
    expect(container.querySelector('[data-testid="usage-ring-trigger"]')).toBeTruthy();
    // popover 未打开：详情与压缩按钮不渲染（无常驻按钮）
    expect(container.querySelector('[data-testid="usage-ring-popover"]')).toBeNull();
    expect(container.querySelector('[data-testid="compact-now-button"]')).toBeNull();

    const { container: plain } = render(() => (
      <ContextRing percentage={10} usedTokens={20_000} totalTokens={200_000} />
    ));
    expect(plain.querySelector('[data-testid="usage-ring-trigger"]')).toBeNull();
    expect(plain.querySelector('[data-testid="context-ring"]')).toBeTruthy();
  });

  it("点击 trigger → popover 显示完整数字用量与「立即压缩」按钮，点击按钮调 onCompact", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const onCompact = vi.fn();
    const { container } = render(() => (
      <ContextRing
        percentage={12}
        usedTokens={24_000}
        totalTokens={200_000}
        onCompact={onCompact}
      />
    ));

    const trigger = container.querySelector('[data-testid="usage-ring-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await user.click(trigger);

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="usage-ring-popover"]')).toBeTruthy();
    });
    // 完整数字（千分位），非 K/M 缩写
    expect(container.querySelector('[data-testid="usage-ring-popover"]')?.textContent).toContain("24,000");
    expect(container.querySelector('[data-testid="usage-ring-popover"]')?.textContent).toContain("200,000");

    const btn = container.querySelector('[data-testid="compact-now-button"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("立即压缩");
    await user.click(btn);
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it("compacting=true → popover 内显示 spinner 而非压缩按钮", async () => {
    const user = (await import("@testing-library/user-event")).default;
    const { container } = render(() => (
      <ContextRing
        percentage={50}
        usedTokens={100_000}
        totalTokens={200_000}
        compacting
        onCompact={vi.fn()}
      />
    ));

    const trigger = container.querySelector('[data-testid="usage-ring-trigger"]') as HTMLButtonElement;
    await user.click(trigger);
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="compaction-spinner"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-testid="compact-now-button"]')).toBeNull();
  });
});