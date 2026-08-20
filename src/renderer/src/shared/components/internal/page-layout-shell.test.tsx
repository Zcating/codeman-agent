import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { PageLayoutShell } from "@codeman-frontend/shared/components/internal/page-layout-shell";

describe("PageLayoutShell", () => {
  beforeEach(() => {
    if (!document.getElementById("root")) {
      const root = document.createElement("div");
      root.id = "root";
      document.body.appendChild(root);
    }
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  });

  it("renders title as h2", () => {
    render(() => (
      <PageLayoutShell title="Test Title" body={<div>body content</div>} />
    ));
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("Test Title");
  });

  it("renders description when provided", () => {
    render(() => (
      <PageLayoutShell
        title="Test Title"
        description="Test description text"
        body={<div>body content</div>}
      />
    ));
    expect(screen.getByText("Test description text")).toBeInTheDocument();
  });

  it("renders without description when absent", () => {
    render(() => (
      <PageLayoutShell title="Test Title" body={<div>body content</div>} />
    ));
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("Test Title");
  });

  it("renders body inside ScrollArea", () => {
    render(() => (
      <PageLayoutShell title="Test Title" body={<div>body content</div>} />
    ));
    const scrollArea = document.querySelector("[data-slot='scroll-area']");
    expect(scrollArea).toBeInTheDocument();
  });

  it("renders footer in pinned-bottom div when provided", () => {
    render(() => (
      <PageLayoutShell
        title="Test Title"
        body={<div>body content</div>}
        footer={<button>Action</button>}
      />
    ));
    const footerDiv = document.querySelector(".flex.justify-end.px-4.py-3.bg-background");
    expect(footerDiv).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("renders without footer when absent", () => {
    render(() => (
      <PageLayoutShell title="Test Title" body={<div>body content</div>} />
    ));
    const footerDiv = document.querySelector(".flex.justify-end.px-4.py-3.bg-background");
    expect(footerDiv).not.toBeInTheDocument();
  });

  it("ScrollArea has data-scroll-region and data-testid passes through", () => {
    render(() => (
      <PageLayoutShell
        title="Test Title"
        body={<div>body content</div>}
        data-testid="my-testid"
      />
    ));
    const viewport = document.querySelector("[data-slot='scroll-area-viewport']");
    expect(viewport).toHaveAttribute("data-scroll-region", "true");
    expect(viewport).toHaveAttribute("data-testid", "my-testid");
  });
});
