//! CodemanSidebar tests (PR 2 — ADR-0033 Layer 2; Q28 reversal — per-MenuGroup Accordion).
//!
//! Test strategy: vertical TDD slices per plan seams 13-20.
//! Each seam: first write a failing test, then implement minimum to pass.
//!
//! Slices:
//!  13. options: CodemanSidebarGroupOption[] — full tree renders
//!  14. renderMenuGroup — called per MenuGroup
//!  15. renderGroupHeader — replaces group header
//!  16. currentValue + isActive — only Menu leaves can be active
//!  17. onMenuGroupSelect — click MenuGroup triggers handler AND toggles its accordion
//!  18. onMenuSelect — click Menu leaf triggers handler
//!  19. Per-MenuGroup Accordion (Q28 reversal) — each MenuGroup has its own accordion
//!  20. data-value — e2e compat attributes
//!
//! Chat-domain-specific seams (hover delete, streaming badge) are tested
//! in chat-sidebar.test.tsx, NOT here (per ADR-0030 D6).

import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodemanSidebar,
  type CodemanSidebarGroupOption,
  type CodemanSidebarMenuGroupOption,
  type CodemanSidebarMenuOption,
} from "./codeman-sidebar";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("CodemanSidebar (PR 2)", () => {
  afterEach(() => cleanup());

  // ─── Slice 13: full tree renders ──────────────────────────────────────
  describe("options: CodemanSidebarGroupOption[]", () => {
    it("renders full 3-level tree: group + MenuGroups + Menus", () => {
      const { container } = renderSidebar();
      // Group label rendered (always visible, NOT a trigger)
      expect(container.textContent).toContain("项目");
      // MenuGroups rendered
      expect(container.textContent).toContain("Frontend");
      expect(container.textContent).toContain("Backend");
      // Menus rendered (defaultExpanded=true on all MenuGroups)
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

  // ─── Slice 14: renderMenuGroup called per MenuGroup ────────────────────
  describe("renderMenuGroup", () => {
    it("renderMenuGroup is called once per MenuGroup", () => {
      const renderMenuGroup = vi.fn((item: CodemanSidebarMenuGroupOption) => <span data-testid="menu-group-item">{item.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderMenuGroup });
      // 2 MenuGroups: Frontend and Backend
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

  // ─── Slice 14b: renderMenu ──────────────────────────────────────────────
  describe("renderMenu", () => {
    it("renderMenu is called once per Menu leaf", () => {
      const renderMenu = vi.fn((menu: CodemanSidebarMenuOption) => <span data-testid="menu-item">{menu.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderMenu });
      // 3 menus across 2 MenuGroups: c-1, c-2 (ws-1) and c-3 (ws-2)
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

  // ─── Slice 15: renderGroupHeader ───────────────────────────────────────
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

  // ─── Slice 16: currentValue + isActive ─────────────────────────────────
  // Only Menu leaves can be active. MenuGroup triggers are never active.
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

  // ─── Slice 17: onMenuGroupSelect ────────────────────────────────────────
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

  // ─── Slice 18: onMenuSelect ─────────────────────────────────────────────
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

  // ─── Slice 19: per-MenuGroup Accordion (Q28 reversal) ──────────────────
  // NOTE: jsdom does NOT propagate Solid's delegated click handlers through
  // direct `.click()` invocations on Ark UI @zag-js components — this is a
  // known limitation (also why src/renderer/src/shared/components/ui/accordion.test.tsx
  // does NOT test click toggles). Runtime click behaviour is verified by
  // Playwright e2e (e2e/helpers.ts::expandWorkspace). Unit tests here focus
  // on structural correctness + initial-state wiring, which is what jsdom
  // can deterministically observe.
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
      // e2e/helpers.ts::expandWorkspace depends on `[data-value=…]` exposing
      // `data-state="open"` on the SAME element. The wrapper AccordionTrigger
      // accepts `data-value` as a prop, so it lives on the SAME `<button>` as
      // the trigger attrs.
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
      // Discriminator: presence of `children` field decides accordion wrapping.
      const opts: CodemanSidebarGroupOption[] = [
        {
          label: "Project",
          value: "proj",
          children: [
            { label: "FlatMenu", value: "flat-menu" }, // Menu leaf (no children)
            {
              label: "PopulatedGroup",
              value: "pop-group",
              children: [{ label: "C1", value: "c-1" }],
            },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      // Only the MenuGroup gets an accordion item-trigger
      const triggers = container.querySelectorAll("[data-part='item-trigger']");
      expect(triggers.length).toBe(1);
      // The flat Menu renders as SidebarMenuButton (NOT in AccordionItem)
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

  // ─── Slice 20: data-value ─────────────────────────────────────────────
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

  // ─── Slots tests ────────────────────────────────────────────────────────
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

  // ─── class prop ─────────────────────────────────────────────────────────
  describe("class prop", () => {
    it("class prop is applied to root sidebar", () => {
      const { container } = renderSidebar({ class: "border-2 border-red-500" });
      const aside = container.querySelector("aside");
      expect(aside?.className).toContain("border-2");
      expect(aside?.className).toContain("border-red-500");
    });
  });
});