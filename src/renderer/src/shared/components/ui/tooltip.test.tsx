//! tooltip.test.tsx — Contract tests for Tooltip primitive wrapping @ark-ui/solid.
import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach } from "vitest";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

describe("Tooltip open/close — seam 12", () => {
  beforeEach(() => cleanup());

  it("Tooltip with open=true renders Content", () => {
    render(() => (
      <Tooltip open={true}>
        <TooltipTrigger data-testid="trigger">Hover me</TooltipTrigger>
        <TooltipContent data-testid="content">Tooltip text</TooltipContent>
      </Tooltip>
    ));

    // Content should be visible when open=true
    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("Tooltip with open=false does not render Content or renders hidden", () => {
    render(() => (
      <Tooltip open={false}>
        <TooltipTrigger data-testid="trigger">Hover me</TooltipTrigger>
        <TooltipContent data-testid="content">Tooltip text</TooltipContent>
      </Tooltip>
    ));

    // Trigger should still be there
    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    // Content should either not be in DOM or be hidden
    const content = document.querySelector("[data-testid='content']");
    if (content) {
      // If it exists, it should have hidden attribute or similar
      expect(content.hasAttribute("hidden") || content.getAttribute("aria-hidden") === "true" || !content.textContent?.trim()).toBeTruthy();
    }
  });

  it("TooltipTrigger renders button by default", () => {
    render(() => (
      <Tooltip open={true}>
        <TooltipTrigger>Hover</TooltipTrigger>
        <TooltipContent>tip</TooltipContent>
      </Tooltip>
    ));
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("Tooltip structural", () => {
  beforeEach(() => cleanup());

  it("TooltipContent renders with proper styling wrapper", () => {
    render(() => (
      <Tooltip open={true}>
        <TooltipTrigger>trigger</TooltipTrigger>
        <TooltipContent>tip content</TooltipContent>
      </Tooltip>
    ));
    // Content should be in the DOM
    expect(screen.getByText("tip content")).toBeInTheDocument();
  });

  it("Tooltip renders children (trigger) correctly", () => {
    render(() => (
      <Tooltip open={true}>
        <TooltipTrigger data-testid="btn">Button Text</TooltipTrigger>
        <TooltipContent>Tooltip content here</TooltipContent>
      </Tooltip>
    ));
    expect(screen.getByTestId("btn")).toBeInTheDocument();
  });

  it("Tooltip renders even without children content (graceful)", () => {
    render(() => (
      <Tooltip open={true}>
        <TooltipTrigger>trigger</TooltipTrigger>
      </Tooltip>
    ));
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
