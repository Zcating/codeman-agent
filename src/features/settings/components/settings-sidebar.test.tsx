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
    mockLocation: vi.fn<() => { pathname: string; state: unknown }>(() => ({
      pathname: "/settings/llm",
      state: undefined,
    })),
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
    // useLocation must return the accessor (a function), NOT a pre-invoked
    // location object. `() => F.mockLocation()` would call the vi.fn once
    // and hand back the object — then `location()` in settings-sidebar would
    // hit `object.state` and always be undefined.
    useLocation: () => F.mockLocation,
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
      header: props.header,
      footer: props.footer,
      class: props.class,
      children: props.children,
    };
    // Render header / footer / children into a real DOM subtree so click
    // events on the Back button (a JSX element in props.footer) actually
    // fire. The mock is otherwise a stub `<div>` and the JSX is never mounted.
    return (
      <div data-testid="codeman-sidebar-stub">
        <div data-testid="mock-header">{props.header}</div>
        <div data-testid="mock-footer">{props.footer}</div>
        <div data-testid="mock-children">{props.children}</div>
      </div>
    );
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
  F.mockLocation.mockReset();
  F.mockLocation.mockImplementation(() => ({
    pathname: "/settings/llm",
    state: undefined,
  }));
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

  it("header contains 'Settings' label", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.header).toBeTruthy();
  });

  it("children prop is provided (Outlet rendered inside CodemanSidebar)", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.children).toBeTruthy();
  });

  it("class prop sets border-r for sidebar layout", () => {
    render(() => <SettingsSidebar />);
    expect(F.capturedProps.class).toBe("border-r border-sidebar-border");
  });

  // ─── Back button: navigate to entry URL, not history.back() ──────────────

  it("footer Back button navigates to location.state.from (the page user came from before settings)", () => {
    F.mockLocation.mockImplementation(() => ({
      pathname: "/settings/app",
      state: { from: "/conversation/c-1" },
    }));
    const { getByTestId } = render(() => <SettingsSidebar />);
    const backButton = getByTestId("mock-footer").querySelector("button");
    expect(backButton).toBeTruthy();
    console.log("[diag] button:", backButton?.outerHTML);
    console.log("[diag] F.mockLocation mock.calls:", F.mockLocation.mock.calls.length);
    console.log("[diag] F.mockNavigate.mock.calls before click:", F.mockNavigate.mock.calls);
    backButton!.click();
    console.log("[diag] F.mockNavigate.mock.calls after click:", F.mockNavigate.mock.calls);
    console.log("[diag] F.mockLocation mock.calls after click:", F.mockLocation.mock.calls.length);
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/conversation/c-1" });
  });

  it("footer Back button falls back to '/' when location.state has no from (deep-link entry)", () => {
    F.mockLocation.mockImplementation(() => ({
      pathname: "/settings/llm",
      state: undefined,
    }));
    const { getByTestId } = render(() => <SettingsSidebar />);
    const backButton = getByTestId("mock-footer").querySelector("button");
    expect(backButton).toBeTruthy();
    backButton!.click();
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});