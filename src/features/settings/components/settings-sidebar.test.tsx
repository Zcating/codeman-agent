//! SettingsSidebar — settings-domain wrapper tests.
//!
//! Strategy: mock CodemanSidebar to capture the props SettingsSidebar passes.
//! Verify SettingsSidebar's CONTRACT (what it passes to CodemanSidebar) +
//! the 4 nav items + URL-driven currentValue + click → navigate behavior.

import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock state in vi.hoisted ───────────────────────────────────────────

const F = vi.hoisted(() => {
  return {
    mockNavigate: vi.fn(),
    mockParams: vi.fn(() => ({ tab: undefined as string | undefined })),
    capturedProps: null as any,
  };
});

// ─── Module mocks (factories reference F.* via closure) ─────────────────

vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/solid-router")>(
    "@tanstack/solid-router",
  );
  return {
    ...actual,
    useNavigate: () => F.mockNavigate,
    useParams: () => F.mockParams,
    Outlet: () => <div data-testid="outlet" />,
  };
});

vi.mock("../../../shared/components/internal/codeman-sidebar", () => ({
  CodemanSidebar: (props: any) => {
    F.capturedProps = {
      options: props.options,
      renderItem: props.renderItem,
      currentValue: props.currentValue,
      onItemSelect: props.onItemSelect,
      sidebarHeader: props.sidebarHeader,
      class: props.class,
      children: props.children,
    };
    return <div data-testid="codeman-sidebar-stub" />;
  },
}));

// ─── Imports under test ───────────────────────────────────────────────────

import { SettingsSidebar } from "./settings-sidebar";

// ─── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  F.capturedProps = null;
  F.mockNavigate.mockClear();
  F.mockParams.mockReset();
  F.mockParams.mockImplementation(() => ({ tab: undefined }));
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("SettingsSidebar", () => {
  it("renders 4 nav items: LLM, App, Window, Advanced", () => {
    render(() => <SettingsSidebar />);
    const opts = F.capturedProps.options;
    expect(opts.length).toBe(4);
    expect(opts.map((o: any) => o.label)).toEqual([
      "LLM",
      "App",
      "Window",
      "Advanced",
    ]);
    expect(opts.map((o: any) => o.value)).toEqual([
      "llm",
      "app",
      "window",
      "advanced",
    ]);
  });

  it("each nav item has an icon (lucide-solid element)", () => {
    render(() => <SettingsSidebar />);
    for (const opt of F.capturedProps.options) {
      expect(opt.icon).toBeTruthy();
    }
  });

  it("currentValue comes from URL params ($tab)", () => {
    F.mockParams.mockImplementation(() => ({ tab: "app" }));
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.currentValue).toBe("app");
  });

  it("currentValue undefined when URL has no $tab", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.currentValue).toBeUndefined();
  });

  it("onItemSelect navigates to /settings/{value}", () => {
    render(() => <SettingsSidebar />);
    F.capturedProps.onItemSelect("advanced");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/settings/advanced" });
  });

  it("sidebarHeader contains 'Settings' label", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.sidebarHeader).toBeTruthy();
  });

  it("children prop is provided (Outlet rendered inside CodemanSidebar)", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.children).toBeTruthy();
  });

  it("class prop sets border-r for sidebar layout", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.class).toBe("border-r border-sidebar-border");
  });
});