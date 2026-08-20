import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("tone 'warning' renders with amber classes", () => {
    render(() => <StatusBadge tone="warning" label="caution" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("text-amber-700");
    expect(badge.className).toContain("dark:text-amber-300");
    expect(badge.className).toContain("bg-amber-100");
    expect(badge.className).toContain("dark:bg-amber-900/40");
  });

  it("tone 'success' renders with emerald classes", () => {
    render(() => <StatusBadge tone="success" label="ok" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("text-emerald-700");
    expect(badge.className).toContain("dark:text-emerald-300");
    expect(badge.className).toContain("bg-emerald-100");
    expect(badge.className).toContain("dark:bg-emerald-900/40");
  });

  it("tone 'destructive' renders with destructive classes", () => {
    render(() => <StatusBadge tone="destructive" label="error" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("text-destructive");
    expect(badge.className).toContain("bg-destructive/10");
  });

  it("no label prop renders fallback '—'", () => {
    render(() => <StatusBadge tone="neutral" data-testid="badge" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("empty string label renders fallback '—'", () => {
    render(() => <StatusBadge tone="neutral" label="" data-testid="badge" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("dot=true renders dot span with tone dot color", () => {
    render(() => <StatusBadge tone="success" label="running" dot data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    const dot = badge.querySelector("span");
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain("bg-emerald-500");
  });

  it("dot=false (default) renders no dot span", () => {
    render(() => <StatusBadge tone="neutral" label="idle" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    const dots = badge.querySelectorAll("span");
    expect(dots.length).toBe(1);
  });

  it("size='sm' applies sm classes", () => {
    render(() => <StatusBadge tone="info" label="tiny" size="sm" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("text-[10px]");
    expect(badge.className).toContain("px-1.5");
    expect(badge.className).toContain("py-0.5");
  });

  it("size='md' (default) applies md classes", () => {
    render(() => <StatusBadge tone="info" label="normal" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("text-xs");
    expect(badge.className).toContain("px-2");
    expect(badge.className).toContain("py-0.5");
  });

  it("aria-label format is {tone}: {label}", () => {
    render(() => <StatusBadge tone="warning" label="caution" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.getAttribute("aria-label")).toBe("warning: caution");
  });

  it("aria-label uses fallback '—' when no label", () => {
    render(() => <StatusBadge tone="neutral" data-testid="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.getAttribute("aria-label")).toBe("neutral: —");
  });

  it("data-testid passes through", () => {
    render(() => <StatusBadge tone="success" label="ok" data-testid="my-badge" />);
    const badge = screen.getByTestId("my-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("ok");
  });
});
