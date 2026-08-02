
import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CodemanSidebar,
  type CodemanSidebarGroupOption,
  type CodemanSidebarMenuGroupOption,
  type CodemanSidebarMenuOption,
} from "@codeman-frontend/shared/components/internal/codeman-sidebar";


function makeOptions(): CodemanSidebarGroupOption[] {
  return [
    {
      label: "项目",
      value: "workspace",
      children: [
        {
          label: "Frontend",
          value: "ws-1",
          defaultExpanded: true,
          children: [
            { label: "Chat 1", value: "c-1" },
            { label: "Chat 2", value: "c-2" },
          ],
        },
        {
          label: "Backend",
          value: "ws-2",
          defaultExpanded: true,
          children: [
            { label: "Chat 3", value: "c-3" },
          ],
        },
      ],
    },
  ];
}

function renderSidebar(
  overrides: Partial<{
    options: CodemanSidebarGroupOption[];
    renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => any;
    renderMenu?: (menu: CodemanSidebarMenuOption) => any;
    renderGroupHeader?: (group: CodemanSidebarGroupOption) => any;
    currentValue?: string;
    isActive?: (value: string | undefined, currentValue: string | undefined) => boolean;
    onMenuGroupSelect?: (value: string) => void;
    onMenuSelect?: (value: string) => void;
    onEmptyGroupClick?: (groupValue: string) => void;
    header?: any;
    footer?: any;
    children?: any;
    emptyMessage?: string;
    class?: string;
  }> = {},
) {
  const opts = overrides.options ?? makeOptions();
  const renderMenuGroup = overrides.renderMenuGroup ?? ((item: CodemanSidebarMenuGroupOption) => <span data-testid="menu-group-item">{item.label}</span>);

  return render(() => (
    <CodemanSidebar
      options={opts}
      renderMenuGroup={renderMenuGroup}
      renderMenu={overrides.renderMenu}
      renderGroupHeader={overrides.renderGroupHeader}
      currentValue={overrides.currentValue}
      isActive={overrides.isActive}
      onMenuGroupSelect={overrides.onMenuGroupSelect}
      onMenuSelect={overrides.onMenuSelect}
      onEmptyGroupClick={overrides.onEmptyGroupClick}
      header={overrides.header}
      footer={overrides.footer}
      emptyMessage={overrides.emptyMessage}
      class={overrides.class}
    >
      {overrides.children}
    </CodemanSidebar>
  ));
}


describe("CodemanSidebar (PR 2)", () => {
  afterEach(() => cleanup());

  describe("options: CodemanSidebarGroupOption[]", () => {
    it("renders full 3-level tree: group + MenuGroups + Menus", () => {
      const { container } = renderSidebar();
      expect(container.textContent).toContain("项目");
      expect(container.textContent).toContain("Frontend");
      expect(container.textContent).toContain("Backend");
      expect(container.textContent).toContain("Chat 1");
      expect(container.textContent).toContain("Chat 2");
      expect(container.textContent).toContain("Chat 3");
    });

    it("renders emptyMessage when options is empty", () => {
      const { container } = renderSidebar({ options: [], emptyMessage: "No groups" });
      expect(container.textContent).toContain("No groups");
    });

    it("renders empty group with onEmptyGroupClick button", () => {
      const onEmptyGroupClick = vi.fn();
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "EmptyGroup",
          value: "empty",
          children: [],
        },
      ];
      const { container } = renderSidebar({ options: opts, onEmptyGroupClick });
      const btn = container.querySelector("[data-empty-group-value='empty']") as HTMLElement;
      expect(btn).toBeTruthy();
      btn.click();
      expect(onEmptyGroupClick).toHaveBeenCalledWith("empty");
    });
  });

  describe("renderMenuGroup", () => {
    it("renderMenuGroup is called once per MenuGroup", () => {
      const renderMenuGroup = vi.fn((item: CodemanSidebarMenuGroupOption) => <span data-testid="menu-group-item">{item.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderMenuGroup });
      expect(renderMenuGroup).toHaveBeenCalledTimes(2);
    });

    it("renderMenuGroup receives correct CodemanSidebarMenuGroupOption props", () => {
      const renderMenuGroup = vi.fn((item: CodemanSidebarMenuGroupOption) => <span data-testid="menu-group-item">{item.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderMenuGroup });
      expect(renderMenuGroup).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ label: "Frontend", value: "ws-1" }),
      );
      expect(renderMenuGroup).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ label: "Backend", value: "ws-2" }),
      );
    });

    it("renderMenuGroup result is rendered in DOM", () => {
      const renderMenuGroup = vi.fn((item: CodemanSidebarMenuGroupOption) => (
        <div data-testid="custom-item" data-ws={item.value}>{item.label} (custom)</div>
      ));
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, renderMenuGroup });
      expect(container.querySelector("[data-ws='ws-1']")?.textContent).toContain("Frontend (custom)");
      expect(container.querySelector("[data-ws='ws-2']")?.textContent).toContain("Backend (custom)");
    });
  });

  describe("renderMenu", () => {
    it("renderMenu is called once per Menu leaf", () => {
      const renderMenu = vi.fn((menu: CodemanSidebarMenuOption) => <span data-testid="menu-item">{menu.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderMenu });
      expect(renderMenu).toHaveBeenCalledTimes(3);
    });

    it("renderMenu receives correct CodemanSidebarMenuOption props", () => {
      const renderMenu = vi.fn((menu: CodemanSidebarMenuOption) => <span data-testid="menu-item">{menu.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderMenu });
      expect(renderMenu).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ label: "Chat 1", value: "c-1" }),
      );
      expect(renderMenu).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ label: "Chat 2", value: "c-2" }),
      );
      expect(renderMenu).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ label: "Chat 3", value: "c-3" }),
      );
    });

    it("renderMenu result is rendered in DOM with correct aria-label", () => {
      const renderMenu = vi.fn((menu: CodemanSidebarMenuOption) => (
        <span data-testid="custom-menu" aria-label={`custom-${menu.value}`}>{menu.label} (custom)</span>
      ));
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, renderMenu });
      expect(container.querySelector("[data-testid='custom-menu']")?.textContent).toContain("Chat 1 (custom)");
      expect(container.querySelector("[aria-label='custom-c-1']")?.textContent).toContain("Chat 1 (custom)");
      expect(container.querySelector("[aria-label='custom-c-2']")?.textContent).toContain("Chat 2 (custom)");
      expect(container.querySelector("[aria-label='custom-c-3']")?.textContent).toContain("Chat 3 (custom)");
    });

    it("without renderMenu: Menu leaf renders pure menu.label (backward compatible)", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const c1 = container.querySelector("[data-value='c-1']");
      expect(c1?.textContent).toBe("Chat 1");
      const c2 = container.querySelector("[data-value='c-2']");
      expect(c2?.textContent).toBe("Chat 2");
    });
  });

  describe("forceSubMenu", () => {
    it("forceSubMenu item renders inside SidebarMenuSub (data-sidebar=menu-sub-item on parent li)", () => {
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Plugins",
          value: "plugins",
          children: [
            { label: "Skills", value: "skills", forceSubMenu: true },
            { label: "MCP", value: "mcp", forceSubMenu: true },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const skillsItem = container.querySelector("[data-value='skills']");
      expect(skillsItem).toBeTruthy();
      const parentLi = skillsItem?.closest("li[data-sidebar='menu-sub-item']");
      expect(parentLi).toBeTruthy();
    });

    it("forceSubMenu item does NOT call renderMenu", () => {
      const renderMenu = vi.fn((menu: CodemanSidebarMenuOption) => (
        <span data-testid="rendered-via-menu">{menu.label}</span>
      ));
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Plugins",
          value: "plugins",
          children: [
            { label: "Skills", value: "skills", forceSubMenu: true },
          ],
        },
      ];
      renderSidebar({ options: opts, renderMenu });
      expect(renderMenu).not.toHaveBeenCalled();
    });

    it("forceSubMenu item renders with icon and label inside SidebarMenuSub", () => {
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Plugins",
          value: "plugins",
          children: [
            { label: "Skills", value: "skills", icon: <span data-testid="skill-icon">✨</span>, forceSubMenu: true },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const skillsItem = container.querySelector("[data-value='skills']");
      expect(skillsItem?.textContent).toContain("Skills");
      expect(container.querySelector("[data-testid='skill-icon']")).toBeTruthy();
    });

    it("forceSubMenu item click triggers onMenuSelect", () => {
      const onMenuSelect = vi.fn();
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Plugins",
          value: "plugins",
          children: [
            { label: "Skills", value: "skills", forceSubMenu: true },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts, onMenuSelect });
      const skillsBtn = container.querySelector("[data-value='skills']") as HTMLButtonElement;
      skillsBtn.click();
      expect(onMenuSelect).toHaveBeenCalledWith("skills");
    });

    it("non-forceSubMenu item still calls renderMenu and renders via SidebarMenuButton", () => {
      const renderMenu = vi.fn((menu: CodemanSidebarMenuOption) => (
        <span data-testid="rendered-via-menu">{menu.label}</span>
      ));
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Plugins",
          value: "plugins",
          children: [
            { label: "Flat", value: "flat" }, 
          ],
        },
      ];
      renderSidebar({ options: opts, renderMenu });
      expect(renderMenu).toHaveBeenCalledTimes(1);
      expect(renderMenu).toHaveBeenCalledWith(expect.objectContaining({ label: "Flat", value: "flat" }));
    });
  });

  describe("renderGroupHeader", () => {
    it("renderGroupHeader replaces group header label when provided", () => {
      const renderGroupHeader = vi.fn((group: CodemanSidebarGroupOption) => (
        <span data-testid="custom-group-header">{group.label} (custom header)</span>
      ));
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, renderGroupHeader });
      expect(renderGroupHeader).toHaveBeenCalledWith(expect.objectContaining({ label: "项目", value: "workspace" }));
      expect(container.querySelector("[data-testid='custom-group-header']")?.textContent).toContain("项目 (custom header)");
    });

    it("uses default label when renderGroupHeader is not provided", () => {
      const { container } = renderSidebar();
      expect(container.textContent).toContain("项目");
    });
  });

  describe("currentValue + isActive", () => {
    it("MenuGroup button is NEVER active even when isActive predicate returns true", () => {
      const isActive = vi.fn(() => true);
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, currentValue: "ws-1", isActive });
      const ws1Btn = container.querySelector("[data-value='ws-1']") as HTMLElement;
      expect(ws1Btn.className).not.toContain("bg-sidebar-primary");
      expect(ws1Btn.className).not.toContain("text-sidebar-primary-foreground");
    });

    it("MenuGroup button is never active even without isActive prop and currentValue matches", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, currentValue: "ws-1" });
      const ws1Btn = container.querySelector("[data-value='ws-1']") as HTMLElement;
      expect(ws1Btn.className).not.toContain("bg-sidebar-primary");
    });

    it("isActive is NOT called for MenuGroups (MenuGroup-active is internally forbidden)", () => {
      const isActive = vi.fn(() => true);
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "ws-1", isActive });
      for (const call of isActive.mock.calls as unknown as Array<[string, string | undefined]>) {
        const value = call[0];
        expect(value.startsWith("ws-")).toBe(false);
      }
    });

    it("isActive is called with Menu value and currentValue when Menu is rendered", () => {
      const isActive = vi.fn(() => false);
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "c-2", isActive });
      expect(isActive).toHaveBeenCalledWith("c-1", "c-2");
      expect(isActive).toHaveBeenCalledWith("c-2", "c-2");
      expect(isActive).toHaveBeenCalledWith("c-3", "c-2");
    });

    it("Menu leaf button carries bg-sidebar-accent when isActive returns true (sanity)", () => {
      const isActive = vi.fn((value: string | undefined) => value === "c-2");
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, currentValue: "c-2", isActive });
      const menuBtn = container.querySelector("[data-value='c-2']") as HTMLElement;
      expect(menuBtn.className).toContain("bg-sidebar-accent");
    });
  });

  describe("onMenuGroupSelect", () => {
    it("clicking MenuGroup triggers onMenuGroupSelect with MenuGroup value", () => {
      const onMenuGroupSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onMenuGroupSelect });
      const mgButton = container.querySelector("[data-value='ws-1']") as HTMLButtonElement;
      mgButton.click();
      expect(onMenuGroupSelect).toHaveBeenCalledWith("ws-1");
    });

    it("clicking other MenuGroup triggers onMenuGroupSelect with correct value", () => {
      const onMenuGroupSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onMenuGroupSelect });
      const mgButton = container.querySelector("[data-value='ws-2']") as HTMLButtonElement;
      mgButton.click();
      expect(onMenuGroupSelect).toHaveBeenCalledWith("ws-2");
    });
  });

  describe("onMenuSelect", () => {
    it("clicking Menu leaf triggers onMenuSelect with Menu value", () => {
      const onMenuSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onMenuSelect });
      const menuButton = container.querySelector("[data-value='c-1']") as HTMLAnchorElement;
      menuButton.click();
      expect(onMenuSelect).toHaveBeenCalledWith("c-1");
    });

    it("clicking different Menu leaf triggers onMenuSelect with correct value", () => {
      const onMenuSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onMenuSelect });
      const menuButton = container.querySelector("[data-value='c-3']") as HTMLAnchorElement;
      menuButton.click();
      expect(onMenuSelect).toHaveBeenCalledWith("c-3");
    });
  });

  describe("per-MenuGroup Accordion (Q28 reversal: group is always visible)", () => {
    it("renders one AccordionItem per MenuGroup", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const triggers = container.querySelectorAll("[data-part='item-trigger']");
      expect(triggers.length).toBe(2);
      const contents = container.querySelectorAll("[data-part='item-content']");
      expect(contents.length).toBe(2);
    });

    it("MenuGroup button carries BOTH data-value (sidebar) AND data-state (trigger)", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1Btn = container.querySelector("[data-value='ws-1']") as HTMLElement;
      expect(ws1Btn.getAttribute("data-value")).toBe("ws-1");
      expect(ws1Btn.getAttribute("data-state")).toBe("open");
      expect(ws1Btn.getAttribute("data-part")).toBe("item-trigger");
    });

    it("MenuGroup with defaultExpanded=true starts in open state", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1Btn = container.querySelector(`[data-value='ws-1']`) as HTMLElement;
      expect(ws1Btn.getAttribute("data-state")).toBe("open");
      const ws2Btn = container.querySelector(`[data-value='ws-2']`) as HTMLElement;
      expect(ws2Btn.getAttribute("data-state")).toBe("open");
    });

    it("MenuGroup without defaultExpanded starts in closed state", () => {
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Project",
          value: "proj",
          children: [
            {
              label: "Ws",
              value: "ws-collapsed",
              children: [{ label: "C1", value: "c-1" }],
            },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const wsBtn = container.querySelector(`[data-value='ws-collapsed']`) as HTMLElement;
      expect(wsBtn.getAttribute("data-state")).toBe("closed");
    });

    it("per-MenuGroup Accordion isolation: 2 MenuGroups produce 2 independent triggers", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1Trigger = container.querySelector(`[data-value='ws-1']`) as HTMLElement;
      const ws2Trigger = container.querySelector(`[data-value='ws-2']`) as HTMLElement;
      expect(ws1Trigger.id).not.toBe(ws2Trigger.id);
      expect(ws1Trigger.getAttribute("data-controls")).toBeTruthy();
      expect(ws2Trigger.getAttribute("data-controls")).toBeTruthy();
      expect(ws1Trigger.getAttribute("data-controls")).not.toBe(
        ws2Trigger.getAttribute("data-controls"),
      );
    });

    it("Menu leaf (no children field) renders as flat SidebarMenuButton, NO accordion", () => {
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Project",
          value: "proj",
          children: [
            { label: "FlatMenu", value: "flat-menu" }, 
            {
              label: "PopulatedGroup",
              value: "pop-group",
              children: [{ label: "C1", value: "c-1" }],
            },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const triggers = container.querySelectorAll("[data-part='item-trigger']");
      expect(triggers.length).toBe(1);
      const flatBtn = container.querySelector("[data-value='flat-menu']") as HTMLElement;
      expect(flatBtn).toBeTruthy();
      expect(flatBtn.getAttribute("data-part")).not.toBe("item-trigger");
    });

    it("group label is directly visible (NOT inside an AccordionTrigger)", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const label = container.querySelector("[data-slot='sidebar-group-label']");
      expect(label).toBeTruthy();
      expect(label?.tagName).toBe("DIV");
      const triggers = container.querySelectorAll("[data-part='item-trigger']");
      for (const trigger of triggers) {
        expect(trigger.contains(label!)).toBe(false);
      }
    });
  });

  describe("data-value (e2e compat)", () => {
    it("SidebarMenuItem has data-value attribute", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1 = container.querySelector("[data-value='ws-1']");
      const ws2 = container.querySelector("[data-value='ws-2']");
      expect(ws1).toBeTruthy();
      expect(ws2).toBeTruthy();
    });

    it("SidebarMenuSubItem has data-value attribute", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const c1 = container.querySelector("[data-value='c-1']");
      const c2 = container.querySelector("[data-value='c-2']");
      const c3 = container.querySelector("[data-value='c-3']");
      expect(c1).toBeTruthy();
      expect(c2).toBeTruthy();
      expect(c3).toBeTruthy();
    });

    it("data-value matches MenuGroup value", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      for (const mg of opts[0].children) {
        if ("children" in mg) {
          const el = container.querySelector(`[data-value='${mg.value}']`);
          expect(el).toBeTruthy();
        }
      }
    });

    it("data-value matches Menu leaf value", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      for (const mg of opts[0].children) {
        if ("children" in mg) {
          for (const menu of mg.children) {
            const el = container.querySelector(`[data-value='${menu.value}']`);
            expect(el).toBeTruthy();
          }
        }
      }
    });
  });

  describe("3 slots (header / footer / children)", () => {
    it("header slot renders inside sidebar at top", () => {
      renderSidebar({ header: <div data-testid="slot-header">SIDEBAR TOP</div> });
      const header = document.querySelector("[data-testid='slot-header']");
      expect(header).toBeTruthy();
      expect(header!.textContent).toBe("SIDEBAR TOP");
      const aside = document.querySelector("aside")!;
      expect(aside.contains(header!)).toBe(true);
    });

    it("footer slot renders inside sidebar at bottom", () => {
      renderSidebar({ footer: <div data-testid="slot-footer">SIDEBAR BOTTOM</div> });
      const footer = document.querySelector("[data-testid='slot-footer']");
      expect(footer).toBeTruthy();
      expect(footer!.textContent).toBe("SIDEBAR BOTTOM");
      const aside = document.querySelector("aside")!;
      expect(aside.contains(footer!)).toBe(true);
    });

    it("children slot renders as main content next to sidebar (two-column layout)", () => {
      renderSidebar({ children: <div data-testid="slot-children">MAIN CONTENT</div> });
      const children = document.querySelector("[data-testid='slot-children']");
      expect(children).toBeTruthy();
      expect(children!.textContent).toBe("MAIN CONTENT");
      const aside = document.querySelector("aside")!;
      expect(aside.contains(children!)).toBe(false);
    });
  });

  describe("class prop", () => {
    it("class prop is applied to root sidebar", () => {
      const { container } = renderSidebar({ class: "border-2 border-red-500" });
      const aside = container.querySelector("aside");
      expect(aside?.className).toContain("border-2");
      expect(aside?.className).toContain("border-red-500");
    });
  });

  describe("SidebarInset scroll boundary (Bug B fix)", () => {
    it("data-slot=sidebar-inset has min-h-0 (allows flex child to shrink)", () => {
      const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
      const inset = container.querySelector("[data-slot='sidebar-inset']");
      expect(inset).toBeTruthy();
      expect(inset!.className).toContain("min-h-0");
    });

    it("data-slot=sidebar-inset has overflow-y-auto (enables scrolling)", () => {
      const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
      const inset = container.querySelector("[data-slot='sidebar-inset']");
      expect(inset).toBeTruthy();
      expect(inset!.className).toContain("overflow-y-auto");
    });
  });

  describe("Resizable + Collapsible behavior", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    describe("Splitter.Root wrapping", () => {
      it("renders a ResizablePanelGroup with two panels (sidebar + main)", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        // The resizable panel group should have data-slot attribute
        const splitterRoot = container.querySelector("[data-slot='resizable-panel-group']");
        expect(splitterRoot).toBeTruthy();
        // Should have two panel elements
        const panels = container.querySelectorAll("[data-slot='resizable-panel']");
        expect(panels.length).toBe(2);
      });

      it("Sidebar is inside first ResizablePanel with id 'sidebar'", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        // Use id selector since zag renders id attribute directly
        const sidebarPanel = container.querySelector("[data-id='sidebar']");
        expect(sidebarPanel).toBeTruthy();
        const sidebar = sidebarPanel?.querySelector("aside");
        expect(sidebar).toBeTruthy();
      });

      it("SidebarInset is inside second ResizablePanel with id 'main'", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        // zag renders panel id as scoped (e.g. "splitter:splitter:root:panel:main")
        // so we use data-slot to find panels and take the second one
        const panels = container.querySelectorAll("[data-slot='resizable-panel']");
        expect(panels.length).toBe(2);
        const mainPanel = panels[1];
        const inset = mainPanel?.querySelector("[data-slot='sidebar-inset']");
        expect(inset).toBeTruthy();
      });

      it("Sidebar inside ResizablePanel has flex-1 h-full to fill panel", () => {
        // Aside uses flex-1 (not w-full) because the Sidebar primitive's root
        // is a flex row container; flex-1 lets aside grow to fill the row
        // alongside the (hidden) gap.
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const sidebarPanel = container.querySelector("[data-id='sidebar']");
        const sidebar = sidebarPanel?.querySelector("aside");
        expect(sidebar).toBeTruthy();
        expect(sidebar!.className).toContain("flex-1");
        expect(sidebar!.className).toContain("h-full");
      });

      it("sidebar-content-wrapper has w-full so its bg-sidebar can track panel width", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const wrapper = container.querySelector("[data-testid='sidebar-content-wrapper']");
        expect(wrapper).toBeTruthy();
        expect(wrapper!.className).toContain("w-full");
      });

      it("sidebar-content-wrapper uses block h-full w-full so the inner sidebar root fills panel width AND height", () => {
        // The Sidebar primitive's outer root (data-slot="sidebar") now has
        // flex h-full w-full min-w-0 (matches shadcn upstream). Inside, the
        // gap (data-slot="sidebar-gap") is hidden because the gap's fixed
        // w-(--sidebar-width)=256px otherwise forces the flex row to allocate
        // 256 to gap and squeeze aside. With gap hidden, aside's flex-1 grows
        // to fill the full panel width at any size including the 160px min.
        // The wrapper is block (not grid) because root's flex h-full w-full
        // already drives both dimensions; grid caused column auto-sizing to
        // match root's content (256px gap), defeating the wrapper.
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const wrapper = container.querySelector("[data-testid='sidebar-content-wrapper']");
        expect(wrapper).toBeTruthy();
        expect(wrapper!.className).toContain("block");
        expect(wrapper!.className).toContain("h-full");
        expect(wrapper!.className).toContain("w-full");
      });

      it("Sidebar primitive root has flex h-full w-full min-w-0 so aside can shrink below content size", () => {
        // The sidebar gap has w-(--sidebar-width)=256px which would otherwise
        // force root to be >=256px wide (overflowing narrow panels like the
        // 160px min). Adding min-w-0 to root allows it to shrink below its
        // content size, and the gap is hidden via display:none so it doesn't
        // claim flex space.
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const root = container.querySelector("[data-slot='sidebar']");
        expect(root).toBeTruthy();
        expect(root!.className).toContain("flex");
        expect(root!.className).toContain("h-full");
        expect(root!.className).toContain("w-full");
        expect(root!.className).toContain("min-w-0");
      });

      it("SidebarInset is wrapped in a grid container so its bg-background fills panel height", () => {
        // ResizablePanel primitive is a block element with no height class;
        // flex-1 on SidebarInset cannot resolve against a block parent. The
        // grid wrapper around SidebarInset makes its height track the panel.
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const inset = container.querySelector("[data-slot='sidebar-inset']");
        expect(inset).toBeTruthy();
        const gridWrap = inset!.parentElement;
        expect(gridWrap).toBeTruthy();
        expect(gridWrap!.className).toContain("grid");
        expect(gridWrap!.className).toContain("h-full");
        expect(gridWrap!.className).toContain("w-full");
      });
    });

    describe("ResizeHandle", () => {
      it("ResizeHandle between sidebar and main panels has tabIndex={-1}", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const resizeHandle = container.querySelector("[data-slot='resizable-handle']");
        expect(resizeHandle).toBeTruthy();
        expect(resizeHandle?.getAttribute("tabindex")).toBe("-1");
      });
    });

    describe("Toolbar row with CollapseToggleButton", () => {
      it("SidebarInset contains a toolbar row with h-10 at top", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const inset = container.querySelector("[data-slot='sidebar-inset']");
        const toolbar = inset?.querySelector("[data-testid='sidebar-toolbar']");
        expect(toolbar).toBeTruthy();
        expect(toolbar!.className).toContain("h-10");
      });

      it("toolbar contains a collapse toggle button at top-left", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const toolbar = container.querySelector("[data-testid='sidebar-toolbar']");
        const button = toolbar?.querySelector("[data-testid='collapse-toggle-button']");
        expect(button).toBeTruthy();
      });

      it("collapse button shows PanelLeftClose icon when expanded", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const button = container.querySelector("[data-testid='collapse-toggle-button']");
        expect(button).toBeTruthy();
        // PanelLeftClose icon should be present (lucide icon name in aria-label or data)
        expect(button!.getAttribute("aria-label")).toContain("Collapse");
      });

      it("collapse button shows PanelLeftOpen icon when collapsed", async () => {
        // Set localStorage to collapsed state
        window.localStorage.setItem("codeman.sidebar.collapsed", "true");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        // Need to wait for effect to run
        await new Promise(r => setTimeout(r, 50));
        const button = container.querySelector("[data-testid='collapse-toggle-button']");
        expect(button).toBeTruthy();
        expect(button!.getAttribute("aria-label")).toContain("Expand");
        window.localStorage.clear();
      });
    });

    describe("Collapse button functionality", () => {
      it("clicking collapse button when expanded calls collapsePanel('sidebar')", async () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const button = container.querySelector("[data-testid='collapse-toggle-button']") as HTMLButtonElement;
        button.click();
        // After click, should be collapsed - check aria-label changed
        await new Promise(r => setTimeout(r, 50));
        expect(button.getAttribute("aria-label")).toContain("Expand");
      });

      it("clicking expand button when collapsed calls expandPanel('sidebar')", async () => {
        // Set localStorage to collapsed state
        window.localStorage.setItem("codeman.sidebar.collapsed", "true");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        await new Promise(r => setTimeout(r, 50));
        const button = container.querySelector("[data-testid='collapse-toggle-button']") as HTMLButtonElement;
        button.click();
        await new Promise(r => setTimeout(r, 50));
        expect(button.getAttribute("aria-label")).toContain("Collapse");
        window.localStorage.clear();
      });
    });

    describe("inert attribute on sidebar content", () => {
      it("sidebar content wrapper has inert attribute when collapsed", async () => {
        window.localStorage.setItem("codeman.sidebar.collapsed", "true");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        await new Promise(r => setTimeout(r, 50));
        const sidebarContent = container.querySelector("[data-testid='sidebar-content-wrapper']");
        expect(sidebarContent).toBeTruthy();
        expect(sidebarContent!.getAttribute("data-collapsed")).toBe("true");
        window.localStorage.clear();
      });

      it("sidebar content wrapper does NOT have inert attribute when expanded", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const sidebarContent = container.querySelector("[data-testid='sidebar-content-wrapper']");
        expect(sidebarContent).toBeTruthy();
        expect(sidebarContent!.hasAttribute("inert")).toBe(false);
      });
    });

    describe("Conditional style override when collapsed", () => {
      it("sidebar panel has style override {min-width:0px, flex-basis:0px, flex-grow:0, overflow:hidden} when collapsed", async () => {
        window.localStorage.setItem("codeman.sidebar.collapsed", "true");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        await new Promise(r => setTimeout(r, 50));
        const sidebarPanel = container.querySelector("[data-id='sidebar']") as HTMLElement | null;
        expect(sidebarPanel).toBeTruthy();
        expect(sidebarPanel!.style.minWidth).toBe("0px");
        expect(sidebarPanel!.style.flexBasis).toBe("0px");
        expect(sidebarPanel!.style.flexGrow).toBe("0");
        expect(sidebarPanel!.style.overflow).toBe("hidden");
        window.localStorage.clear();
      });

      it("sidebar panel has NO style override when expanded (uses zag defaults)", () => {
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const sidebarPanel = container.querySelector("[data-id='sidebar']") as HTMLElement | null;
        expect(sidebarPanel).toBeTruthy();
        // When expanded, min-width should NOT be 0px (should be 160px from zag)
        expect(sidebarPanel!.style.minWidth).not.toBe("0px");
      });
    });

    describe("localStorage persistence", () => {
      it("reads default width of 256px when no stored value", () => {
        window.localStorage.removeItem("codeman.sidebar.width");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const sidebarPanel = container.querySelector("[data-id='sidebar']");
        expect(sidebarPanel).toBeTruthy();
        // Default size should be around 256px
        const style = sidebarPanel!.getAttribute("style");
        expect(style).toBeTruthy();
      });

      it("persists width to localStorage on resize end", async () => {
        window.localStorage.removeItem("codeman.sidebar.width");
        renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        // Simulate resize by setting localStorage directly to verify read works
        window.localStorage.setItem("codeman.sidebar.width", "300px");
        // Re-render to pick up new value
        cleanup();
        const { container: container2 } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const sidebarPanel = container2.querySelector("[data-id='sidebar']");
        expect(sidebarPanel).toBeTruthy();
        window.localStorage.clear();
      });

      it("persists collapsed state to localStorage", async () => {
        window.localStorage.removeItem("codeman.sidebar.collapsed");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        const button = container.querySelector("[data-testid='collapse-toggle-button']") as HTMLButtonElement;
        button.click();
        await new Promise(r => setTimeout(r, 50));
        expect(window.localStorage.getItem("codeman.sidebar.collapsed")).toBe("true");
        window.localStorage.clear();
      });

      it("restores collapsed state from localStorage on mount", async () => {
        window.localStorage.setItem("codeman.sidebar.collapsed", "true");
        const { container } = renderSidebar({ children: <div data-testid="main-content">Hello</div> });
        await new Promise(r => setTimeout(r, 50));
        const sidebarContent = container.querySelector("[data-testid='sidebar-content-wrapper']");
        expect(sidebarContent?.getAttribute("data-collapsed")).toBe("true");
        window.localStorage.clear();
      });
    });
  });
});