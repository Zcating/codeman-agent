
import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach } from "vitest";
import { Tooltip, TooltipTrigger, TooltipContent } from "@codeman-frontend/shared/components/ui/tooltip";

describe("Tooltip open/close — seam 12", () => {
  beforeEach(() => cleanup());

  it("Tooltip with open=true renders Content", () => {
    render(() => (
      <Tooltip open={true}>
        <TooltipTrigger data-testid="trigger">Hover me</TooltipTrigger>
        <TooltipContent data-testid="content">Tooltip text</TooltipContent>
      </Tooltip>
    ));

    
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

    
    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    
    const content = document.querySelector("[data-testid='content']");
    if (content) {
      
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
