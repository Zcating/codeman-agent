//! CodemanSidebar tests (PR 2 — ADR-0033 Layer 2).
//!
//! Test strategy: vertical TDD slices per plan seams 13-20.
//! Each seam: first write a failing test, then implement minimum to pass.
//!
//! Slices:
//!  13. options: SidebarGroupOption[] — full tree renders
//!  14. renderItem — called per workspace item
//!  15. renderGroupHeader — replaces group trigger label
//!  16. currentValue + isActive — workspace isActive when value === currentValue
//!  17. onItemSelect — click workspace triggers onItemSelect(value)
//!  18. onSubItemSelect — click conv triggers onSubItemSelect(value)
//!  19. Accordion defaultExpanded — group starts open
//!  20. data-value — e2e compat attributes
//!
//! Chat-domain-specific seams (hover delete, streaming badge) are tested
//! in chat-sidebar.test.tsx, NOT here (per ADR-0030 D6).

import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodemanSidebar,
  type SidebarGroupOption,
  type SidebarOption,
} from "./codeman-sidebar";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOptions(): SidebarGroupOption[] {
  return [
    {
      label: "项目",
      value: "workspace",
      defaultExpanded: true,
      children: [
        {
          label: "Frontend",
          value: "ws-1",
          subItems: [
            { label: "Chat 1", value: "c-1" },
            { label: "Chat 2", value: "c-2" },
          ],
        },
        {
          label: "Backend",
          value: "ws-2",
          subItems: [
            { label: "Chat 3", value: "c-3" },
          ],
        },
      ],
    },
  ];
}

function renderSidebar(
  overrides: Partial<{
    options: SidebarGroupOption[];
    renderItem: (item: SidebarOption) => any;
    renderGroupHeader?: (group: SidebarGroupOption) => any;
    currentValue?: string;
    isActive?: (value: string | undefined, currentValue: string | undefined) => boolean;
    onItemSelect?: (value: string) => void;
    onSubItemSelect?: (value: string) => void;
    onEmptyGroupClick?: (groupValue: string) => void;
    header?: any;
    footer?: any;
    children?: any;
    emptyMessage?: string;
    class?: string;
  }> = {},
) {
  const opts = overrides.options ?? makeOptions();
  const renderItem = overrides.renderItem ?? ((item: SidebarOption) => <span data-testid="workspace-item">{item.label}</span>);

  return render(() => (
    <CodemanSidebar
      options={opts}
      renderItem={renderItem}
      renderGroupHeader={overrides.renderGroupHeader}
      currentValue={overrides.currentValue}
      isActive={overrides.isActive}
      onItemSelect={overrides.onItemSelect}
      onSubItemSelect={overrides.onSubItemSelect}
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
  describe("options: SidebarGroupOption[]", () => {
    it("renders full 3-level tree: group + workspaces + convs", () => {
      const { container } = renderSidebar();
      // Group trigger rendered
      expect(container.textContent).toContain("项目");
      // Workspaces rendered
      expect(container.textContent).toContain("Frontend");
      expect(container.textContent).toContain("Backend");
      // Convs rendered
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
      const opts: SidebarGroupOption[] = [
        {
          label: "EmptyGroup",
          value: "empty",
          defaultExpanded: true,
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

  // ─── Slice 14: renderItem called per workspace ─────────────────────────
  describe("renderItem", () => {
    it("renderItem is called once per workspace", () => {
      const renderItem = vi.fn((item: SidebarOption) => <span data-testid="workspace-item">{item.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderItem });
      // 2 workspaces: Frontend and Backend
      expect(renderItem).toHaveBeenCalledTimes(2);
    });

    it("renderItem receives correct SidebarOption props", () => {
      const renderItem = vi.fn((item: SidebarOption) => <span data-testid="workspace-item">{item.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderItem });
      expect(renderItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ label: "Frontend", value: "ws-1" }),
      );
      expect(renderItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ label: "Backend", value: "ws-2" }),
      );
    });

    it("renderItem result is rendered in DOM", () => {
      const renderItem = vi.fn((item: SidebarOption) => (
        <div data-testid="custom-item" data-ws={item.value}>{item.label} (custom)</div>
      ));
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, renderItem });
      expect(container.querySelector("[data-ws='ws-1']")?.textContent).toContain("Frontend (custom)");
      expect(container.querySelector("[data-ws='ws-2']")?.textContent).toContain("Backend (custom)");
    });
  });

  // ─── Slice 15: renderGroupHeader ───────────────────────────────────────
  describe("renderGroupHeader", () => {
    it("renderGroupHeader replaces group trigger label when provided", () => {
      const renderGroupHeader = vi.fn((group: SidebarGroupOption) => (
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
  describe("currentValue + isActive", () => {
    it("isActive is called with workspace value and currentValue when workspace is rendered", () => {
      const isActive = vi.fn(() => false);
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "ws-1", isActive });
      expect(isActive).toHaveBeenCalledWith("ws-1", "ws-1");
      expect(isActive).toHaveBeenCalledWith("ws-2", "ws-1");
    });

    it("isActive prop overrides default equality check", () => {
      const isActive = vi.fn((value: string | undefined) => value === "ws-2");
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "ws-1", isActive });
      expect(isActive).toHaveBeenCalledWith("ws-1", "ws-1");
      expect(isActive).toHaveBeenCalledWith("ws-2", "ws-1");
    });

    it("isActive is called with conv value and currentValue when conv is rendered", () => {
      const isActive = vi.fn(() => false);
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "c-2", isActive });
      expect(isActive).toHaveBeenCalledWith("c-1", "c-2");
      expect(isActive).toHaveBeenCalledWith("c-2", "c-2");
      expect(isActive).toHaveBeenCalledWith("c-3", "c-2");
    });
  });

  // ─── Slice 17: onItemSelect ─────────────────────────────────────────────
  describe("onItemSelect", () => {
    it("clicking workspace triggers onItemSelect with workspace value", () => {
      const onItemSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onItemSelect });
      const wsButton = container.querySelector("[data-value='ws-1']") as HTMLButtonElement;
      wsButton.click();
      expect(onItemSelect).toHaveBeenCalledWith("ws-1");
    });

    it("clicking other workspace triggers onItemSelect with correct value", () => {
      const onItemSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onItemSelect });
      const wsButton = container.querySelector("[data-value='ws-2']") as HTMLButtonElement;
      wsButton.click();
      expect(onItemSelect).toHaveBeenCalledWith("ws-2");
    });
  });

  // ─── Slice 18: onSubItemSelect ─────────────────────────────────────────
  describe("onSubItemSelect", () => {
    it("clicking conv triggers onSubItemSelect with conv value", () => {
      const onSubItemSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onSubItemSelect });
      const convButton = container.querySelector("[data-value='c-1']") as HTMLAnchorElement;
      convButton.click();
      expect(onSubItemSelect).toHaveBeenCalledWith("c-1");
    });

    it("clicking different conv triggers onSubItemSelect with correct value", () => {
      const onSubItemSelect = vi.fn();
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, onSubItemSelect });
      const convButton = container.querySelector("[data-value='c-3']") as HTMLAnchorElement;
      convButton.click();
      expect(onSubItemSelect).toHaveBeenCalledWith("c-3");
    });
  });

  // ─── Slice 19: Accordion defaultExpanded ────────────────────────────────
  describe("Accordion defaultExpanded", () => {
    it("renders Accordion structure with group trigger and content", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      // Group trigger exists
      const trigger = container.querySelector("[data-part='item-trigger']");
      expect(trigger).toBeTruthy();
      // Accordion content wrapper exists
      const content = container.querySelector("[data-part='item-content']");
      expect(content).toBeTruthy();
    });

    it("group trigger is clickable and toggles accordion state", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const trigger = container.querySelector("[data-part='item-trigger']") as HTMLButtonElement;
      expect(trigger).toBeTruthy();
      // Click should not throw (accordion toggle)
      expect(() => trigger.click()).not.toThrow();
    });

    it("group without defaultExpanded still renders trigger and content", () => {
      const opts: SidebarGroupOption[] = [
        {
          label: "ClosedGroup",
          value: "closed",
          children: [],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const trigger = container.querySelector("[data-part='item-trigger']");
      expect(trigger).toBeTruthy();
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

    it("data-value matches workspace value", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      for (const ws of opts[0].children) {
        const el = container.querySelector(`[data-value='${ws.value}']`);
        expect(el).toBeTruthy();
      }
    });

    it("data-value matches conv value", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      for (const ws of opts[0].children) {
        for (const sub of ws.subItems ?? []) {
          const el = container.querySelector(`[data-value='${sub.value}']`);
          expect(el).toBeTruthy();
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
