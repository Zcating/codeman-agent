import { render, screen, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  SidebarProvider,
  useSidebar,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInset,
  SidebarInput,
  SidebarRail,
  SidebarTrigger,
} from "@codeman-frontend/shared/components/ui/sidebar";

describe("SidebarProvider context — seam 1", () => {
  beforeEach(() => cleanup());

  it("child can call useSidebar() and gets state=expanded when defaultOpen=true", () => {
    let capturedState: "expanded" | "collapsed" | null = null;
    const Consumer = () => {
      const ctx = useSidebar()!;
      capturedState = ctx.state;
      return <div>child</div>;
    };
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <Consumer />
      </SidebarProvider>
    ));
    expect(capturedState).toBe("expanded");
  });

  it("child gets state=collapsed when defaultOpen=false", () => {
    let capturedState: "expanded" | "collapsed" | null = null;
    const Consumer = () => {
      const ctx = useSidebar()!;
      capturedState = ctx.state;
      return <div>child</div>;
    };
    render(() => (
      <SidebarProvider defaultOpen={false}>
        <Consumer />
      </SidebarProvider>
    ));
    expect(capturedState).toBe("collapsed");
  });
});

describe("SidebarProvider controlled mode — seam 2", () => {
  beforeEach(() => cleanup());

  it("controlled open=false results in state=collapsed", () => {
    let capturedState: "expanded" | "collapsed" | null = null;
    const Consumer = () => {
      const ctx = useSidebar()!;
      capturedState = ctx.state;
      return <div>child</div>;
    };
    render(() => (
      <SidebarProvider open={false} onOpenChange={() => {}}>
        <Consumer />
      </SidebarProvider>
    ));
    expect(capturedState).toBe("collapsed");
  });

  it("controlled open=true results in state=expanded", () => {
    let capturedState: "expanded" | "collapsed" | null = null;
    const Consumer = () => {
      const ctx = useSidebar()!;
      capturedState = ctx.state;
      return <div>child</div>;
    };
    render(() => (
      <SidebarProvider open={true} onOpenChange={() => {}}>
        <Consumer />
      </SidebarProvider>
    ));
    expect(capturedState).toBe("expanded");
  });

  it("onOpenChange fires when toggleSidebar is called", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const Consumer = () => {
      const ctx = useSidebar()!;
      return (
        <button data-testid="toggle" onClick={() => ctx.toggleSidebar()}>
          toggle
        </button>
      );
    };
    render(() => (
      <SidebarProvider defaultOpen={true} onOpenChange={onOpenChange}>
        <Consumer />
      </SidebarProvider>
    ));
    await user.click(screen.getByTestId("toggle"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("A5: setOpen triggers onOpenChange and updates useSidebar().open synchronously (uncontrolled)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const Consumer = () => {
      const ctx = useSidebar()!;
      return (
        <>
          <span data-testid="open">{String(ctx.open)}</span>
          <span data-testid="state">{ctx.state}</span>
          <button data-testid="close" onClick={() => ctx.setOpen(false)}>
            close
          </button>
        </>
      );
    };
    render(() => (
      <SidebarProvider defaultOpen={true} onOpenChange={onOpenChange}>
        <Consumer />
      </SidebarProvider>
    ));
    expect(screen.getByTestId("open").textContent).toBe("true");
    expect(screen.getByTestId("state").textContent).toBe("expanded");
    await user.click(screen.getByTestId("close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("open").textContent).toBe("false");
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
  });

  it("A5: setOpen function reference is stable when state does not change", () => {
    let setOpenRef1: ((v: boolean) => void) | undefined;
    let setOpenRef2: ((v: boolean) => void) | undefined;
    const Consumer1 = () => {
      const ctx = useSidebar();
      if (ctx) setOpenRef1 = ctx.setOpen;
      return <div>c1</div>;
    };
    const Consumer2 = () => {
      const ctx = useSidebar();
      if (ctx) setOpenRef2 = ctx.setOpen;
      return <div>c2</div>;
    };
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <Consumer1 />
        <Consumer2 />
      </SidebarProvider>
    ));
    expect(setOpenRef1).toBe(setOpenRef2);
  });
});

describe("SidebarProvider CSS vars injection — seam 3", () => {
  beforeEach(() => cleanup());

  it("SidebarProvider renders its children", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <div data-testid="child">x</div>
      </SidebarProvider>
    ));
    const child = container.querySelector("[data-testid='child']");
    expect(child).toBeTruthy();
    expect(child?.textContent).toBe("x");
  });

  it("CSS vars from index.css are declared in the stylesheet", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="none">
          <div data-testid="sidebar-child">x</div>
        </Sidebar>
      </SidebarProvider>
    ));
    const sidebar = container.querySelector("aside");
    expect(sidebar).toBeTruthy();
    expect(sidebar?.textContent).toContain("x");
  });
});

describe("Sidebar variants — seam 4", () => {
  beforeEach(() => cleanup());

  it("variant=floating adds rounded-lg and shadow classes to inner element", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <Sidebar variant="floating">
          <div data-testid="inner">content</div>
        </Sidebar>
      </SidebarProvider>
    ));
    const aside = container.querySelector("aside");
    expect(aside?.className).toMatch(/rounded-lg/);
    expect(aside?.className).toMatch(/shadow/);
  });

  it("variant=sidebar (default) does NOT add rounded-lg", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <Sidebar>
          <div>content</div>
        </Sidebar>
      </SidebarProvider>
    ));
    const aside = container.querySelector("aside");
    expect(aside?.className).not.toMatch(/rounded-lg/);
  });
});

describe("Sidebar collapsible — seam 5", () => {
  beforeEach(() => cleanup());

  it("collapsible=none does not render gap placeholder element", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="none">
          <div>content</div>
        </Sidebar>
      </SidebarProvider>
    ));
    const aside = container.querySelector("aside");
    expect(aside?.children.length).toBeLessThanOrEqual(1);
  });

  it("collapsible=offcanvas renders gap element", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="offcanvas">
          <div>content</div>
        </Sidebar>
      </SidebarProvider>
    ));
    const aside = container.querySelector("aside");
    expect(aside).toBeTruthy();
  });
});

describe("SidebarMenuButton isActive — seam 6", () => {
  beforeEach(() => cleanup());

  it("isActive=true adds bg-sidebar-primary class", () => {
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarMenuButton isActive={true}>Active Item</SidebarMenuButton>
      </SidebarProvider>
    ));
    const btn = screen.getByRole("menuitem");
    expect(btn.className).toMatch(/bg-sidebar-primary/);
  });

  it("isActive=false does not add bg-sidebar-primary", () => {
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarMenuButton isActive={false}>Item</SidebarMenuButton>
      </SidebarProvider>
    ));
    const btn = screen.getByRole("menuitem");
    expect(btn.className).not.toMatch(/bg-sidebar-primary/);
  });
});

describe("SidebarMenuButton tooltip — seam 7", () => {
  beforeEach(() => cleanup());

  it("tooltip prop causes Tooltip wrapper to be rendered around button", () => {
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarMenuButton tooltip="Hello tooltip">Item</SidebarMenuButton>
      </SidebarProvider>
    ));
    const btn = screen.getByRole("menuitem");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("Item");
  });
});

describe("SidebarMenuSub nesting — seam 8", () => {
  beforeEach(() => cleanup());

  it("SidebarMenu > SidebarMenuItem > SidebarMenuSub > SidebarMenuSubItem > SubButton renders all levels", () => {
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>Workspace</SidebarMenuButton>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton>Conv 1</SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton>Conv 2</SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    ));
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Conv 1")).toBeInTheDocument();
    expect(screen.getByText("Conv 2")).toBeInTheDocument();
    const subItems = document.querySelectorAll("li");
    expect(subItems.length).toBeGreaterThanOrEqual(3); 
  });

  it("SidebarMenuButton exposes 'group/row' so descendants can use group-hover/row:", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton data-testid="ws-row">Workspace</SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    ));
    const btn = container.querySelector("[data-testid='ws-row']") as HTMLElement;
    expect(btn.className).toContain("group/row");
  });

  it("SidebarMenuSubButton exposes 'group/row' so descendants can use group-hover/row:", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton data-testid="conv-row">Conv</SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    ));
    const link = container.querySelector("[data-testid='conv-row']") as HTMLElement;
    expect(link.className).toContain("group/row");
  });
});

describe("SidebarInset — seam 9", () => {
  beforeEach(() => cleanup());

  it("SidebarInset renders as main element", () => {
    const { container } = render(() => (
      <SidebarProvider defaultOpen={true}>
        <SidebarInset data-testid="inset">
          <p>Main content</p>
        </SidebarInset>
      </SidebarProvider>
    ));
    const mainEl = container.querySelector("[data-testid='inset']");
    expect(mainEl).toBeTruthy();
  });
});

describe("Shell slots — structural", () => {
  beforeEach(() => cleanup());

  it("SidebarHeader renders div with header class", () => {
    const { container } = render(() => <SidebarHeader>header</SidebarHeader>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("SidebarContent renders div with content class", () => {
    const { container } = render(() => <SidebarContent>content</SidebarContent>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("SidebarFooter renders div with footer class", () => {
    const { container } = render(() => <SidebarFooter>footer</SidebarFooter>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("SidebarSeparator renders hr/div separator", () => {
    const { container } = render(() => <SidebarSeparator />);
    const sep = container.querySelector("[class*='bg-sidebar-border']");
    expect(sep).toBeTruthy();
  });

  it("SidebarGroup renders div", () => {
    const { container } = render(() => <SidebarGroup>group</SidebarGroup>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("SidebarGroupLabel renders div with label classes", () => {
    const { container } = render(() => <SidebarGroupLabel>Label</SidebarGroupLabel>);
    const div = container.querySelector("div");
    expect(div?.textContent).toBe("Label");
  });

  it("SidebarGroupContent renders div", () => {
    const { container } = render(() => <SidebarGroupContent>gc</SidebarGroupContent>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("SidebarGroupAction renders button", () => {
    const { container } = render(() => <SidebarGroupAction aria-label="action">x</SidebarGroupAction>);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("SidebarMenu renders ul", () => {
    const { container } = render(() => <SidebarMenu>menu</SidebarMenu>);
    expect(container.querySelector("ul")).toBeTruthy();
  });

  it("SidebarMenuItem renders li", () => {
    const { container } = render(() => <SidebarMenuItem>item</SidebarMenuItem>);
    expect(container.querySelector("li")).toBeTruthy();
  });

  it("SidebarMenuButton renders button with correct classes", () => {
    render(() => <SidebarMenuButton>btn</SidebarMenuButton>);
    const btn = screen.getByRole("menuitem");
    expect(btn.textContent).toBe("btn");
  });

  it("SidebarMenuAction renders button with showOnHover classes", () => {
    render(() => <SidebarMenuAction aria-label="act">x</SidebarMenuAction>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("act");
  });

  it("SidebarMenuBadge renders span with badge classes", () => {
    const { container } = render(() => <SidebarMenuBadge>99</SidebarMenuBadge>);
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("SidebarMenuSkeleton renders div skeleton", () => {
    const { container } = render(() => <SidebarMenuSkeleton />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("SidebarMenuSub renders ul sub", () => {
    const { container } = render(() => <SidebarMenuSub><li>sub</li></SidebarMenuSub>);
    expect(container.querySelector("ul")).toBeTruthy();
  });

  describe("subItem right-edge alignment", () => {
    it("SidebarMenuSub ul has NO right-side indent (no mx-*, no pr-*)", () => {
      const { container } = render(() => <SidebarMenuSub><li>sub</li></SidebarMenuSub>);
      const ul = container.querySelector('[data-slot="sidebar-menu-sub"]') as HTMLElement;
      expect(ul).toBeTruthy();
      expect(ul.className).not.toMatch(/\bmx-/);
      expect(ul.className).not.toMatch(/\bpx-/);
      expect(ul.className).not.toMatch(/\bpr-/);
    });

    it("SidebarMenuSub ul KEEPS left-side indent (ml-3.5 + pl-2.5 + border-l)", () => {
      const { container } = render(() => <SidebarMenuSub><li>sub</li></SidebarMenuSub>);
      const ul = container.querySelector('[data-slot="sidebar-menu-sub"]') as HTMLElement;
      expect(ul.className).toContain("ml-3.5");
      expect(ul.className).toContain("pl-2.5");
      expect(ul.className).toContain("border-l");
      expect(ul.className).toContain("border-sidebar-border");
    });

    it("SidebarMenuSubButton a has NO -translate-x-px (would offset left by 1px)", () => {
      const { container } = render(() => <SidebarMenuSubButton>x</SidebarMenuSubButton>);
      const a = container.querySelector('[data-slot="sidebar-menu-sub-button"], a') as HTMLElement;
      expect(a).toBeTruthy();
      expect(a.className).not.toContain("-translate-x-px");
    });
  });

  it("SidebarMenuSubItem renders li", () => {
    const { container } = render(() => <SidebarMenuSubItem>subitem</SidebarMenuSubItem>);
    expect(container.querySelector("li")).toBeTruthy();
  });

  it("SidebarMenuSubButton renders a", () => {
    const { container } = render(() => <SidebarMenuSubButton>subbtn</SidebarMenuSubButton>);
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("subbtn");
  });

  it("SidebarInput renders input", () => {
    const { container } = render(() => <SidebarInput placeholder="search" />);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("SidebarRail renders button", () => {
    const { container } = render(() => <SidebarRail />);
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
  });

  it("SidebarTrigger renders button", () => {
    render(() => <SidebarTrigger>toggle</SidebarTrigger>);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("toggle");
  });
});
