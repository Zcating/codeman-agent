
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