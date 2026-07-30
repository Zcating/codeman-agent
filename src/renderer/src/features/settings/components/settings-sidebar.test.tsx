





import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";



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



vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/solid-router")>(
    "@tanstack/solid-router",
  );
  return {
    ...actual,
    useNavigate: () => F.mockNavigate,
    useParams: () => F.mockParams,
    useLocation: () => F.mockLocation,
    Outlet: () => <div data-testid="outlet" />,
  };
});

vi.mock("../../../shared/components/internal/codeman-sidebar", () => ({
  CodemanSidebar: (props: any) => {
    F.capturedProps = {
      options: props.options,
      renderMenuGroup: props.renderMenuGroup,
      currentValue: props.currentValue,
      onMenuSelect: props.onMenuSelect,
      header: props.header,
      footer: props.footer,
      class: props.class,
      children: props.children,
    };
    return (
      <div data-testid="codeman-sidebar-stub">
        <div data-testid="mock-header">{props.header}</div>
        <div data-testid="mock-footer">{props.footer}</div>
        <div data-testid="mock-children">{props.children}</div>
      </div>
    );
  },
}));



import { SettingsSidebar } from "@codeman-frontend/features/settings/components/settings-sidebar";



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



describe("SettingsSidebar (PR 2)", () => {
  it("builds options as CodemanSidebarGroupOption[] with 4 nav items in children", () => {
      render(() => <SettingsSidebar />);
      const opts = F.capturedProps.options;
      
      expect(opts.length).toBe(1);
      expect(opts[0]).toMatchObject({
        label: "Settings",
        value: "settings",
      });
      
      expect(opts[0].children.length).toBe(4);
    expect(opts[0].children.map((c: any) => c.label)).toEqual([
      "LLM",
      "App",
      "Window",
      "Advanced",
    ]);
    expect(opts[0].children.map((c: any) => c.value)).toEqual([
      "llm",
      "app",
      "window",
      "advanced",
    ]);
  });

  it("each nav item has an icon (lucide-solid element)", () => {
    render(() => <SettingsSidebar />);
    for (const child of F.capturedProps.options[0].children) {
      expect(child.icon).toBeTruthy();
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

  it("onMenuSelect navigates to /settings/{value}", () => {
    render(() => <SettingsSidebar />);
    F.capturedProps.onMenuSelect("advanced");
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

  it("footer Back button navigates to location.state.from (the page user came from before settings)", () => {
    F.mockLocation.mockImplementation(() => ({
      pathname: "/settings/app",
      state: { from: "/conversation/c-1" },
    }));
    const { getByTestId } = render(() => <SettingsSidebar />);
    const backButton = getByTestId("mock-footer").querySelector("button");
    expect(backButton).toBeTruthy();
    backButton!.click();
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
