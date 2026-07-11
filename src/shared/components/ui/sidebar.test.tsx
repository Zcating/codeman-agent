import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarRail,
  SidebarTrigger,
} from "./sidebar";

describe("ui/sidebar primitive", () => {
  afterEach(() => cleanup());

  describe("Sidebar root", () => {
    it("renders as <aside> with bg-sidebar class", () => {
      const { container } = render(() => <Sidebar>child</Sidebar>);
      const aside = container.querySelector("aside");
      expect(aside).toBeTruthy();
      expect(aside?.className).toContain("bg-sidebar");
      expect(aside?.className).toContain("text-sidebar-foreground");
      expect(aside?.getAttribute("aria-label")).toBe("Sidebar");
    });

    it("renders children", () => {
      const { container } = render(() => <Sidebar><span data-testid="c">x</span></Sidebar>);
      expect(container.querySelector("[data-testid='c']")?.textContent).toBe("x");
    });
  });

  describe("Header / Content / Footer", () => {
    it("SidebarHeader has border-b", () => {
      const { container } = render(() => <SidebarHeader>x</SidebarHeader>);
      expect(container.querySelector("div")?.className).toContain("border-b");
    });
    it("SidebarContent is scrollable", () => {
      const { container } = render(() => <SidebarContent>x</SidebarContent>);
      expect(container.querySelector("div")?.className).toContain("overflow-y-auto");
    });
    it("SidebarFooter has border-t", () => {
      const { container } = render(() => <SidebarFooter>x</SidebarFooter>);
      expect(container.querySelector("div")?.className).toContain("border-t");
    });
  });

  describe("Group sub-components", () => {
    it("SidebarGroup has flex-col class", () => {
      const { container } = render(() => <SidebarGroup>x</SidebarGroup>);
      expect(container.querySelector("div")?.className).toContain("flex-col");
    });
    it("SidebarGroupLabel renders uppercase text-xs", () => {
      const { container } = render(() => <SidebarGroupLabel>Workspaces</SidebarGroupLabel>);
      const div = container.querySelector("div");
      expect(div?.className).toContain("uppercase");
      expect(div?.className).toContain("text-xs");
      expect(div?.textContent).toBe("Workspaces");
    });
    it("SidebarGroupContent renders children", () => {
      const { container } = render(() => <SidebarGroupContent><span data-testid="gc">y</span></SidebarGroupContent>);
      expect(container.querySelector("[data-testid='gc']")?.textContent).toBe("y");
    });
  });

  describe("Menu sub-components", () => {
    it("SidebarMenu has role=menu", () => {
      const { container } = render(() => <SidebarMenu>x</SidebarMenu>);
      expect(container.querySelector("ul")?.getAttribute("role")).toBe("menu");
    });
    it("SidebarMenuItem has role=none", () => {
      const { container } = render(() => <SidebarMenuItem>x</SidebarMenuItem>);
      expect(container.querySelector("li")?.getAttribute("role")).toBe("none");
    });
    it("SidebarMenuButton isActive=true uses sidebar-primary classes", () => {
      const { container } = render(() => <SidebarMenuButton isActive>x</SidebarMenuButton>);
      expect(container.querySelector("button")?.className).toContain("bg-sidebar-primary");
    });
    it("SidebarMenuButton click fires onClick", () => {
      const onClick = vi.fn();
      const { container } = render(() => <SidebarMenuButton onClick={onClick}>x</SidebarMenuButton>);
      fireEvent.click(container.querySelector("button")!);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Action / Badge", () => {
    it("SidebarMenuAction has aria-label", () => {
      const { container } = render(() => <SidebarMenuAction aria-label="Delete">x</SidebarMenuAction>);
      expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Delete");
    });
    it("SidebarMenuAction click stops propagation by default", () => {
      const actionClick = vi.fn();
      const parentClick = vi.fn();
      const { container } = render(() => (
        <div onClick={parentClick}>
          <SidebarMenuAction onClick={actionClick} aria-label="Delete">x</SidebarMenuAction>
        </div>
      ));
      fireEvent.click(container.querySelector("button")!);
      expect(actionClick).toHaveBeenCalledTimes(1);
      expect(parentClick).not.toHaveBeenCalled();
    });
    it("SidebarMenuBadge has aria-live=polite", () => {
      const { container } = render(() => <SidebarMenuBadge>x</SidebarMenuBadge>);
      expect(container.querySelector("span")?.getAttribute("aria-live")).toBe("polite");
    });
  });

  describe("Rail / Trigger", () => {
    it("SidebarRail has role=separator", () => {
      const { container } = render(() => <SidebarRail />);
      expect(container.querySelector("div")?.getAttribute("role")).toBe("separator");
    });
    it("SidebarTrigger has aria-label=Toggle sidebar by default", () => {
      const { container } = render(() => <SidebarTrigger>x</SidebarTrigger>);
      expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Toggle sidebar");
    });
  });
});
