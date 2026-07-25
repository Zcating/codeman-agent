//! CodemanSidebar tests (PR 2 — ADR-0033 Layer 2; Q28 reversal — per-workspace Accordion).
//!
//! Test strategy: vertical TDD slices per plan seams 13-20.
//! Each seam: first write a failing test, then implement minimum to pass.
//!
//! Slices:
//!  13. options: SidebarGroupOption[] — full tree renders
//!  14. renderItem — called per workspace item
//!  15. renderGroupHeader — replaces group header (NOT a trigger anymore)
//!  16. currentValue + isActive — workspace isActive when value === currentValue
//!  17. onItemSelect — click workspace triggers onItemSelect(value) AND toggles its accordion
//!  18. onSubItemSelect — click conv triggers onSubItemSelect(value)
//!  19. Per-workspace Accordion (Q28 reversal) — each workspace has its own
//!       accordion-controlled conv list; group is always visible
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
  type SidebarSubOption,
} from "./codeman-sidebar";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOptions(): SidebarGroupOption[] {
  return [
    {
      label: "项目",
      value: "workspace",
      children: [
        {
          label: "Frontend",
          value: "ws-1",
          defaultExpanded: true,
          subItems: [
            { label: "Chat 1", value: "c-1" },
            { label: "Chat 2", value: "c-2" },
          ],
        },
        {
          label: "Backend",
          value: "ws-2",
          defaultExpanded: true,
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
    renderSubItem?: (sub: SidebarSubOption) => any;
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
      renderSubItem={overrides.renderSubItem}
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
      // Group label rendered (always visible, NOT a trigger)
      expect(container.textContent).toContain("项目");
      // Workspaces rendered
      expect(container.textContent).toContain("Frontend");
      expect(container.textContent).toContain("Backend");
      // Convs rendered (defaultExpanded=true on all workspaces)
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

  // ─── Slice 14b: renderSubItem ────────────────────────────────────────────
  describe("renderSubItem", () => {
    it("renderSubItem is called once per conv (once per subItem)", () => {
      const renderSubItem = vi.fn((sub: SidebarSubOption) => <span data-testid="conv-item">{sub.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderSubItem });
      // 3 convs across 2 workspaces: c-1, c-2 (ws-1) and c-3 (ws-2)
      expect(renderSubItem).toHaveBeenCalledTimes(3);
    });

    it("renderSubItem receives correct SidebarSubOption props", () => {
      const renderSubItem = vi.fn((sub: SidebarSubOption) => <span data-testid="conv-item">{sub.label}</span>);
      const opts = makeOptions();
      renderSidebar({ options: opts, renderSubItem });
      expect(renderSubItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ label: "Chat 1", value: "c-1" }),
      );
      expect(renderSubItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ label: "Chat 2", value: "c-2" }),
      );
      expect(renderSubItem).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ label: "Chat 3", value: "c-3" }),
      );
    });

    it("renderSubItem result is rendered in DOM with correct aria-label", () => {
      const renderSubItem = vi.fn((sub: SidebarSubOption) => (
        <span data-testid="custom-conv" aria-label={`custom-${sub.value}`}>{sub.label} (custom)</span>
      ));
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, renderSubItem });
      expect(container.querySelector("[data-testid='custom-conv']")?.textContent).toContain("Chat 1 (custom)");
      expect(container.querySelector("[aria-label='custom-c-1']")?.textContent).toContain("Chat 1 (custom)");
      expect(container.querySelector("[aria-label='custom-c-2']")?.textContent).toContain("Chat 2 (custom)");
      expect(container.querySelector("[aria-label='custom-c-3']")?.textContent).toContain("Chat 3 (custom)");
    });

    it("without renderSubItem: conv row renders pure sub.label (backward compatible)", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      // Each conv button should just show its label text
      const c1 = container.querySelector("[data-value='c-1']");
      expect(c1?.textContent).toBe("Chat 1");
      const c2 = container.querySelector("[data-value='c-2']");
      expect(c2?.textContent).toBe("Chat 2");
    });
  });

  // ─── Slice 15: renderGroupHeader ───────────────────────────────────────
  describe("renderGroupHeader", () => {
    it("renderGroupHeader replaces group header label when provided", () => {
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
  // Per chat AGENTS.md (ADR-0023 D7-CS): "workspace 永远不 active，只有 conv 可以 active".
  // The isActive prop therefore applies ONLY to convs (SidebarSubOption),
  // never to workspaces. Workspace buttons must never carry active styling
  // regardless of currentValue or isActive predicate.
  describe("currentValue + isActive", () => {
    it("workspace button is NEVER active even when isActive predicate returns true", () => {
      // Bug repro: clicking a workspace used to navigate to /conversation/{wsId},
      // making currentValue === ws.value and triggering bg-sidebar-primary. The
      // design contract forbids this — workspaces must never look "selected".
      const isActive = vi.fn(() => true);
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, currentValue: "ws-1", isActive });
      const ws1Btn = container.querySelector("[data-value='ws-1']") as HTMLElement;
      expect(ws1Btn.className).not.toContain("bg-sidebar-primary");
      expect(ws1Btn.className).not.toContain("text-sidebar-primary-foreground");
    });

    it("workspace button is never active even without isActive prop and currentValue matches", () => {
      // currentValue exactly matches ws.value — still no active styling.
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, currentValue: "ws-1" });
      const ws1Btn = container.querySelector("[data-value='ws-1']") as HTMLElement;
      expect(ws1Btn.className).not.toContain("bg-sidebar-primary");
    });

    it("isActive is NOT called for workspaces (workspace-active is internally forbidden)", () => {
      const isActive = vi.fn(() => true);
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "ws-1", isActive });
      // isActive is only consulted for convs; workspaces never call it.
      for (const call of isActive.mock.calls as unknown as Array<[string, string | undefined]>) {
        const value = call[0];
        expect(value.startsWith("ws-")).toBe(false);
      }
    });

    it("isActive is called with conv value and currentValue when conv is rendered", () => {
      const isActive = vi.fn(() => false);
      const opts = makeOptions();
      renderSidebar({ options: opts, currentValue: "c-2", isActive });
      expect(isActive).toHaveBeenCalledWith("c-1", "c-2");
      expect(isActive).toHaveBeenCalledWith("c-2", "c-2");
      expect(isActive).toHaveBeenCalledWith("c-3", "c-2");
    });

    it("conv button carries bg-sidebar-accent when isActive returns true (sanity)", () => {
      const isActive = vi.fn((value: string | undefined) => value === "c-2");
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts, currentValue: "c-2", isActive });
      const convBtn = container.querySelector("[data-value='c-2']") as HTMLElement;
      // Conv CAN be active (conv uses bg-sidebar-accent, workspace uses bg-sidebar-primary)
      expect(convBtn.className).toContain("bg-sidebar-accent");
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

  // ─── Slice 19: per-workspace Accordion (Q28 reversal) ──────────────────
// NOTE: jsdom does NOT propagate Solid's delegated click handlers through
// direct `.click()` invocations on Ark UI @zag-js components — this is a
// known limitation (also why src/renderer/src/shared/components/ui/accordion.test.tsx
// does NOT test click toggles). Runtime click behaviour is verified by
// Playwright e2e (e2e/helpers.ts::expandWorkspace). Unit tests here focus
// on structural correctness + initial-state wiring, which is what jsdom
// can deterministically observe.
  describe("per-workspace Accordion (Q28 reversal: group is always visible)", () => {
    it("renders one AccordionItem per workspace with subItems", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      // Both ws-1 and ws-2 have subItems → 2 AccordionItems
      const triggers = container.querySelectorAll("[data-part='item-trigger']");
      expect(triggers.length).toBe(2);
      const contents = container.querySelectorAll("[data-part='item-content']");
      expect(contents.length).toBe(2);
    });

    it("workspace button carries BOTH data-value (SidebarMenuButton) AND data-state (trigger)", () => {
      // e2e/helpers.ts::expandWorkspace depends on `[data-value=…]` exposing
      // `data-state="open"` on the SAME element. asChild merge keeps the
      // workspace value + accordion trigger attrs co-located.
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1Btn = container.querySelector("[data-value='ws-1']") as HTMLElement;
      expect(ws1Btn.getAttribute("data-value")).toBe("ws-1");
      expect(ws1Btn.getAttribute("data-state")).toBe("open");
      expect(ws1Btn.getAttribute("data-part")).toBe("item-trigger");
    });

    it("workspace with defaultExpanded=true starts in open state", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1Btn = container.querySelector(`[data-value='ws-1']`) as HTMLElement;
      expect(ws1Btn.getAttribute("data-state")).toBe("open");
      const ws2Btn = container.querySelector(`[data-value='ws-2']`) as HTMLElement;
      expect(ws2Btn.getAttribute("data-state")).toBe("open");
    });

    it("workspace without defaultExpanded starts in closed state", () => {
      const opts: SidebarGroupOption[] = [
        {
          label: "Project",
          value: "proj",
          children: [
            {
              label: "Ws",
              value: "ws-collapsed",
              subItems: [{ label: "C1", value: "c-1" }],
            },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const wsBtn = container.querySelector(`[data-value='ws-collapsed']`) as HTMLElement;
      expect(wsBtn.getAttribute("data-state")).toBe("closed");
    });

    it("per-workspace Accordion isolation: 2 workspaces produce 2 independent triggers", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const ws1Trigger = container.querySelector(`[data-value='ws-1']`) as HTMLElement;
      const ws2Trigger = container.querySelector(`[data-value='ws-2']`) as HTMLElement;
      // Each workspace is its own AccordionItem with its own trigger ID
      expect(ws1Trigger.id).not.toBe(ws2Trigger.id);
      // Both controls are independent `data-controls` targets
      expect(ws1Trigger.getAttribute("data-controls")).toBeTruthy();
      expect(ws2Trigger.getAttribute("data-controls")).toBeTruthy();
      expect(ws1Trigger.getAttribute("data-controls")).not.toBe(
        ws2Trigger.getAttribute("data-controls"),
      );
    });

    it("workspace WITHOUT subItems has NO accordion (no item-trigger)", () => {
      const opts: SidebarGroupOption[] = [
        {
          label: "Project",
          value: "proj",
          children: [
            { label: "EmptyWs", value: "empty-ws" }, // no subItems
            {
              label: "PopulatedWs",
              value: "pop-ws",
              subItems: [{ label: "C1", value: "c-1" }],
            },
          ],
        },
      ];
      const { container } = renderSidebar({ options: opts });
      const triggers = container.querySelectorAll("[data-part='item-trigger']");
      expect(triggers.length).toBe(1); // Only populated workspace has accordion
    });

    it("group label is directly visible (NOT inside an AccordionTrigger)", () => {
      const opts = makeOptions();
      const { container } = renderSidebar({ options: opts });
      const label = container.querySelector("[data-slot='sidebar-group-label']");
      expect(label).toBeTruthy();
      expect(label?.tagName).toBe("DIV"); // SidebarGroupLabel is a div, not button
      // Group label is NOT inside any item-trigger
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
