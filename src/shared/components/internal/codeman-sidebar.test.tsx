//! CodemanSidebar — universal render-driven sidebar (per ADR-0030).
//!
//! Test strategy: vertical slices (red → green cycle), one seam per test.
//! Each test verifies a single piece of public API behavior.
//!
//! Slice plan:
//!  1. empty state                       ✅
//!  2. renderItem called per leaf         ✅ this batch
//!  3. group header renders               ✅ this batch
//!  4. active highlight (currentValue / isActive)
//!  5. click → onItemSelect
//!  6. disabled blocks click
//!  7. disabled visual (opacity-60)
//!  8. accordion defaultExpanded
//!  9. accordion toggle
//! 10. accordion single-expand
//! 11. 3 slots (header / footer / children)
//! 12. class prop
//! 13. data-value hook
//!
//! Chat-domain-specific seams (hover delete / inline confirm / workspace
//! rename / streaming badge) are tested in chat-sidebar.test.tsx (PR 2),
//! NOT here — per ADR-0030 D6.

import { render, cleanup } from "@solidjs/testing-library";
import { onMount } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CodemanSidebar,
  type CodemanSidebarProps,
  type SidebarItemConfig,
  type SidebarOption,
} from "./codeman-sidebar";

// ─── Ark UI Accordion mock ─────────────────────────────────────────────────
//
// Plain JS Map tracks expanded items + onValueChange handler. Used by slices
// 3 (group rendering) + 8/9/10 (accordion). Each slice that needs it asserts
// against this mock's DOM data-* + aria-* attributes. Real Ark UI behavior
// is covered by e2e tests.
//
// Mock behavior:
// - Root: seeds openValues from defaultValue (one-shot on mount)
// - Item: reads openValues → data-state
// - ItemTrigger: click → toggle openValues + onValueChange + DOM update
// - ItemContent: reads openValues → hidden + style.display
// - ItemIndicator: simple marker

let openValues: Set<string> = new Set();
let sharedOnValueChange: ((details: { value: string[] }) => void) | null = null;

function refreshDomForItems() {
  // After openValues changes, manually update DOM data-state + aria-expanded
  // + hidden + style.display (Solid won't re-render because openValues is a
  // plain JS Set, not a signal).
  document.querySelectorAll("[data-part='item']").forEach((itemEl) => {
    const wsId = itemEl.getAttribute("data-value")!;
    const isOpen = openValues.has(wsId);
    itemEl.setAttribute("data-state", isOpen ? "open" : "closed");
    const trigger = itemEl.querySelector(
      '[data-part="item-trigger"]',
    ) as HTMLElement | null;
    if (trigger) {
      trigger.setAttribute("data-state", isOpen ? "open" : "closed");
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
    const content = itemEl.querySelector(
      '[data-part="item-content"]',
    ) as HTMLElement | null;
    if (content) {
      content.setAttribute("data-state", isOpen ? "open" : "closed");
      if (isOpen) {
        content.removeAttribute("hidden");
        content.style.display = "";
      } else {
        content.setAttribute("hidden", "");
        content.style.display = "none";
      }
    }
  });
}

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual<typeof import("@ark-ui/solid")>(
    "@ark-ui/solid",
  );
  return {
    ...actual,
    Accordion: {
      Root: (props: any) => {
        sharedOnValueChange = props.onValueChange ?? null;
        // Seed openValues from defaultValue (one-shot, since mock doesn't
        // reactively re-render). Sidebar passes defaultExpanded-derived array.
        if (Array.isArray(props.defaultValue)) {
          for (const v of props.defaultValue) {
            openValues.add(v);
          }
        }
        // After mount: sync DOM (data-state / aria-expanded / hidden / style)
        // with openValues, so defaultExpanded groups show as open on first paint.
        onMount(() => {
          refreshDomForItems();
        });
        return <>{props.children}</>;
      },
      Item: (props: any) => {
        const wsId: string = props.value;
        const isOpen = openValues.has(wsId);
        return (
          <div
            data-part="item"
            data-state={isOpen ? "open" : "closed"}
            data-value={wsId}
            class={props.class}
          >
            {props.children}
          </div>
        );
      },
      ItemTrigger: (props: any) => (
        <button
          type="button"
          data-part="item-trigger"
          data-state="closed"
          aria-expanded="false"
          aria-label={props["aria-label"]}
          class={props.class}
          onClick={(e: MouseEvent) => {
            // Walk up to [data-part='item'] ancestor
            let el = e.currentTarget as HTMLElement | null;
            while (el && el.getAttribute("data-part") !== "item") {
              el = el.parentElement;
            }
            const wsId = el?.getAttribute("data-value") ?? "";
            if (openValues.has(wsId)) {
              openValues.delete(wsId);
            } else {
              // For multiple=false mock, clear before add (single-expand).
              // If test passes multiple=true, caller can manage differently.
              openValues.clear();
              openValues.add(wsId);
            }
            if (sharedOnValueChange) {
              sharedOnValueChange({ value: Array.from(openValues) });
            }
            refreshDomForItems();
          }}
        >
          {props.children}
        </button>
      ),
      ItemContent: (props: any) => {
        const wsId = props.value as string;
        const isOpen = openValues.has(wsId);
        return (
          <div
            data-part="item-content"
            data-state={isOpen ? "open" : "closed"}
            hidden={!isOpen}
            style={{ display: isOpen ? "" : "none" }}
            class={props.class}
          >
            {props.children}
          </div>
        );
      },
      ItemIndicator: (props: any) => (
        <span data-part="item-indicator">{props.children}</span>
      ),
    },
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function defaultProps(
  overrides: Partial<CodemanSidebarProps> = {},
): CodemanSidebarProps {
  return {
    options: [],
    renderItem: (item) => <span data-testid="leaf">{item.label}</span>,
    ...overrides,
  };
}

function queryGroup(container: HTMLElement, value: string): HTMLElement | null {
  return container.querySelector(`[data-value="${value}"]`);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("CodemanSidebar", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    openValues = new Set();
    sharedOnValueChange = null;
  });

  // ─── Slice 1: empty state ─────────────────────────────────────────────
  describe("empty state", () => {
    it("renders emptyMessage when options is empty", () => {
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({ emptyMessage: "No items yet" })}
        />
      ));
      expect(container.textContent).toContain("No items yet");
    });

    it("renders no leaves when options is empty", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps()} />
      ));
      const leaves = container.querySelectorAll("[data-testid='leaf']");
      expect(leaves.length).toBe(0);
    });
  });

  // ─── Slice 2: renderItem called per leaf ─────────────────────────────
  describe("renderItem called per leaf", () => {
    it("treats children: [] as empty group (renders onEmptyGroupClick button)", () => {
      // Per ADR-0030 D1: children === undefined → flat leaf; children: [] →
      // empty group; children: [...] → group with leaves.
      const onEmptyGroupClick = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({
            options: [
              {
                label: "EmptyWS",
                value: "ws-empty",
                children: [],
              },
            ],
            onEmptyGroupClick,
          })}
        />
      ));
      // The empty button is rendered with data-empty-group-value
      const btn = container.querySelector(
        "[data-empty-group-value='ws-empty']",
      ) as HTMLElement;
      expect(btn).toBeTruthy();
      btn.click();
      expect(onEmptyGroupClick).toHaveBeenCalledWith("ws-empty");
    });

    it("treats children: undefined as flat leaf (no group wrapper)", () => {
      const renderItem = vi.fn((item: SidebarItemConfig) => (
        <span data-testid="leaf">{item.label}</span>
      ));
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({
            options: [
              { label: "Flat A", value: "a" }, // children: undefined → flat
            ],
            renderItem,
          })}
        />
      ));
      // data-part='item' (group wrapper) should NOT be present
      expect(container.querySelector("[data-part='item']")).toBeNull();
      // renderItem called once for the flat leaf
      expect(renderItem).toHaveBeenCalledTimes(1);
      expect(renderItem).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Flat A", value: "a" }),
      );
    });

    it("renderGroupHeader callback renders custom group trigger content", () => {
      const renderGroupHeader = vi.fn((group: SidebarOption) => (
        <button data-testid="custom-trigger">{group.label} (custom)</button>
      ));
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({
            options: [
              {
                label: "WS",
                value: "ws",
                defaultExpanded: true,
                children: [{ label: "L1", value: "l1" }],
              },
            ],
            renderGroupHeader,
          })}
        />
      ));
      expect(renderGroupHeader).toHaveBeenCalledWith(
        expect.objectContaining({ label: "WS", value: "ws" }),
      );
      const custom = container.querySelector("[data-testid='custom-trigger']");
      expect(custom).toBeTruthy();
      expect(custom?.textContent).toContain("WS (custom)");
    });

    it("calls renderItem once per flat leaf, with the right config", () => {
      const renderItem = vi.fn((item: SidebarItemConfig) => (
        <span data-testid="leaf">{item.label}</span>
      ));
      const options: SidebarOption[] = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
        { label: "C", value: "c" },
      ];
      render(() => (
        <CodemanSidebar {...defaultProps({ options, renderItem })} />
      ));
      expect(renderItem).toHaveBeenCalledTimes(3);
      expect(renderItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ label: "A", value: "a" }),
      );
      expect(renderItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ label: "B", value: "b" }),
      );
      expect(renderItem).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ label: "C", value: "c" }),
      );
      // DOM: 3 leaves visible
      const leaves = document.querySelectorAll("[data-testid='leaf']");
      expect(leaves.length).toBe(3);
    });
  });

  // ─── Slice 3: group header renders ────────────────────────────────────
  describe("group header", () => {
    it("renders group label via sidebar (not renderItem) when collapsed", () => {
      const renderItem = vi.fn((item: SidebarItemConfig) => (
        <span data-testid="leaf">{item.label}</span>
      ));
      const options: SidebarOption[] = [
        {
          label: "Workspaces",
          value: "ws",
          children: [
            { label: "Chat 1", value: "c1" },
            { label: "Chat 2", value: "c2" },
          ],
        },
      ];
      render(() => (
        <CodemanSidebar {...defaultProps({ options, renderItem })} />
      ));
      // Group label visible (rendered by sidebar, not via renderItem call)
      expect(document.body.textContent).toContain("Workspaces");
      // Children are inside the Accordion content (hidden when collapsed).
      // Mock sets `hidden` attr on ItemContent, so we verify all leaves are
      // inside a hidden container rather than asserting 0 leaves (which would
      // require the mock to not render them at all — diverges from real Ark UI).
      const content = document.querySelector('[data-part="item-content"]');
      expect(content).toBeTruthy();
      expect(content!.hasAttribute("hidden")).toBe(true);
      const leavesInContent = content!.querySelectorAll("[data-testid='leaf']");
      expect(leavesInContent.length).toBe(2);
      // Simpler: leaves are nested under content element
      const allLeaves = document.querySelectorAll("[data-testid='leaf']");
      expect(allLeaves.length).toBe(2);
      for (const leaf of Array.from(allLeaves)) {
        expect(leaf.closest("[data-part='item-content']")).toBe(content);
      }
    });

    it("renders group header with trigger + content wrapper", () => {
      const options: SidebarOption[] = [
        {
          label: "Workspaces",
          value: "ws",
          children: [{ label: "Chat 1", value: "c1" }],
        },
      ];
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const group = queryGroup(container, "ws");
      expect(group).toBeTruthy();
      expect(group!.querySelector('[data-part="item-trigger"]')).toBeTruthy();
      expect(group!.querySelector('[data-part="item-content"]')).toBeTruthy();
    });
  });

  // ─── Slice 4: active highlight ──────────────────────────────────────
  describe("active highlight", () => {
    it("marks item active via aria-current when currentValue matches item.value", () => {
      const options: SidebarOption[] = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ];
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ options, currentValue: "b" })} />
      ));
      // Item B should have aria-current="page"; item A should not
      const leaves = container.querySelectorAll("[data-testid='leaf']");
      const leafA = Array.from(leaves).find(
        (l) => l.textContent === "A",
      ) as HTMLElement;
      const leafB = Array.from(leaves).find(
        (l) => l.textContent === "B",
      ) as HTMLElement;
      // Walk up to the wrapping menuitem div (sidebar adds active wrapper)
      const itemA = leafA.closest("[role='menuitem']");
      const itemB = leafB.closest("[role='menuitem']");
      expect(itemA?.getAttribute("aria-current")).not.toBe("page");
      expect(itemB?.getAttribute("aria-current")).toBe("page");
    });

    it("uses custom isActive function when provided", () => {
      const isActive = vi.fn(
        (value: string | undefined, currentValue: string | undefined) =>
          value === currentValue,
      );
      const options: SidebarOption[] = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ];
      render(() => (
        <CodemanSidebar
          {...defaultProps({ options, currentValue: "a", isActive })}
        />
      ));
      expect(isActive).toHaveBeenCalledWith("a", "a");
      expect(isActive).toHaveBeenCalledWith("b", "a");
      // Item A is active
      const leaves = document.querySelectorAll("[data-testid='leaf']");
      const leafA = Array.from(leaves).find(
        (l) => l.textContent === "A",
      ) as HTMLElement;
      const itemA = leafA.closest("[role='menuitem']");
      expect(itemA?.getAttribute("aria-current")).toBe("page");
    });

    it("does not mark anything active when neither currentValue nor isActive is set", () => {
      const options: SidebarOption[] = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ];
      render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const buttons = document.querySelectorAll("[data-testid='leaf'] button, [data-testid='leaf']");
      // No aria-current anywhere
      for (const btn of Array.from(buttons)) {
        expect(btn.getAttribute("aria-current")).not.toBe("page");
      }
    });
  });

  // ─── Slice 5: click → onItemSelect ──────────────────────────────────
  describe("click → onItemSelect", () => {
    it("calls onItemSelect(item.value) when leaf clicked", () => {
      const onItemSelect = vi.fn();
      const options: SidebarOption[] = [
        { label: "Alpha", value: "a" },
        { label: "Beta", value: "b" },
      ];
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({ options, onItemSelect })}
        />
      ));
      const leafB = Array.from(
        container.querySelectorAll("[data-testid='leaf']"),
      ).find((l) => l.textContent === "Beta") as HTMLElement;
      const item = leafB.closest("[role='menuitem']") as HTMLElement;
      expect(item).toBeTruthy();
      item.click();
      expect(onItemSelect).toHaveBeenCalledWith("b");
    });

    it("falls back to label when item has no value", () => {
      const onItemSelect = vi.fn();
      const options: SidebarOption[] = [
        { label: "OnlyLabel" }, // no value
      ];
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({ options, onItemSelect })}
        />
      ));
      const leaf = container.querySelector("[data-testid='leaf']") as HTMLElement;
      const item = leaf.closest("[role='menuitem']") as HTMLElement;
      item.click();
      expect(onItemSelect).toHaveBeenCalledWith("OnlyLabel");
    });
  });

  // ─── Slice 6: disabled blocks click ──────────────────────────────────
  describe("disabled blocks click", () => {
    it("disabled item click does not call onItemSelect", () => {
      const onItemSelect = vi.fn();
      const options: SidebarOption[] = [
        { label: "Locked", value: "locked", disabled: true },
      ];
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({ options, onItemSelect })}
        />
      ));
      const leaf = container.querySelector("[data-testid='leaf']") as HTMLElement;
      const item = leaf.closest("[role='menuitem']") as HTMLElement;
      expect(item.getAttribute("aria-disabled")).toBe("true");
      item.click();
      expect(onItemSelect).not.toHaveBeenCalled();
    });
  });

  // ─── Slice 7: disabled visual ────────────────────────────────────────
  describe("disabled visual", () => {
    it("disabled item has opacity-60 class", () => {
      const options: SidebarOption[] = [
        { label: "Locked", value: "locked", disabled: true },
      ];
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const leaf = container.querySelector("[data-testid='leaf']") as HTMLElement;
      const item = leaf.closest("[role='menuitem']") as HTMLElement;
      expect(item.className).toContain("opacity-60");
    });
  });

  // ─── Slice 8: defaultExpanded ────────────────────────────────────────
  describe("defaultExpanded", () => {
    it("groups with defaultExpanded=true start open on mount", () => {
      const options: SidebarOption[] = [
        {
          label: "Workspace A",
          value: "ws-a",
          defaultExpanded: true,
          children: [{ label: "Chat 1", value: "c1" }],
        },
        {
          label: "Workspace B",
          value: "ws-b",
          children: [{ label: "Chat 2", value: "c2" }],
        },
      ];
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      // ws-a should be open; ws-b should be closed
      const itemA = queryGroup(container, "ws-a")!;
      const itemB = queryGroup(container, "ws-b")!;
      expect(itemA.getAttribute("data-state")).toBe("open");
      expect(itemB.getAttribute("data-state")).toBe("closed");
      // ws-a content should be visible (no hidden attr)
      const contentA = itemA.querySelector('[data-part="item-content"]')!;
      expect(contentA.hasAttribute("hidden")).toBe(false);
    });
  });

  // ─── Slice 9: click toggle ──────────────────────────────────────────
  describe("click toggle", () => {
    it("clicking group trigger toggles open/closed", () => {
      const options: SidebarOption[] = [
        {
          label: "WS",
          value: "ws",
          children: [{ label: "Chat", value: "c" }],
        },
      ];
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const item = queryGroup(container, "ws")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      // Initially closed
      expect(item.getAttribute("data-state")).toBe("closed");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      // Click to open
      trigger.click();
      expect(item.getAttribute("data-state")).toBe("open");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      // Click again to close (collapsible=true)
      trigger.click();
      expect(item.getAttribute("data-state")).toBe("closed");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });
  });

  // ─── Slice 10: single-expand ─────────────────────────────────────────
  describe("single-expand (multiple=false)", () => {
    it("opening another group closes the previously open one", () => {
      const options: SidebarOption[] = [
        {
          label: "WS A",
          value: "ws-a",
          children: [{ label: "Chat A", value: "ca" }],
        },
        {
          label: "WS B",
          value: "ws-b",
          children: [{ label: "Chat B", value: "cb" }],
        },
      ];
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const itemA = queryGroup(container, "ws-a")!;
      const itemB = queryGroup(container, "ws-b")!;
      const triggerA = itemA.querySelector('[data-part="item-trigger"]') as HTMLElement;
      const triggerB = itemB.querySelector('[data-part="item-trigger"]') as HTMLElement;
      // Open A
      triggerA.click();
      expect(itemA.getAttribute("data-state")).toBe("open");
      expect(itemB.getAttribute("data-state")).toBe("closed");
      // Open B → A should close
      triggerB.click();
      expect(itemA.getAttribute("data-state")).toBe("closed");
      expect(itemB.getAttribute("data-state")).toBe("open");
    });
  });

  // ─── Slice 11: 3 slots ──────────────────────────────────────────────
  describe("3 slots", () => {
    it("header slot renders inside sidebar at top", () => {
      render(() => (
        <CodemanSidebar
          {...defaultProps({
            header: <div data-testid="slot-header">SIDEBAR TOP</div>,
          })}
        />
      ));
      const header = document.querySelector("[data-testid='slot-header']");
      expect(header).toBeTruthy();
      expect(header!.textContent).toBe("SIDEBAR TOP");
      // Header is INSIDE the <aside> (sidebar-internal top slot)
      const aside = document.querySelector("aside")!;
      expect(aside.contains(header!)).toBe(true);
    });

    it("footer slot renders inside sidebar at bottom", () => {
      render(() => (
        <CodemanSidebar
          {...defaultProps({
            footer: <div data-testid="slot-footer">SIDEBAR BOTTOM</div>,
          })}
        />
      ));
      const footer = document.querySelector("[data-testid='slot-footer']");
      expect(footer).toBeTruthy();
      expect(footer!.textContent).toBe("SIDEBAR BOTTOM");
      // Footer is INSIDE the <aside> (sidebar-internal bottom slot)
      const aside = document.querySelector("aside")!;
      expect(aside.contains(footer!)).toBe(true);
    });

    it("children slot renders as main content next to sidebar (two-column layout)", () => {
      render(() => (
        <CodemanSidebar {...defaultProps()}>
          <div data-testid="slot-children">MAIN CONTENT</div>
        </CodemanSidebar>
      ));
      const children = document.querySelector("[data-testid='slot-children']");
      expect(children).toBeTruthy();
      expect(children!.textContent).toBe("MAIN CONTENT");
      // Children NOT inside the <aside>
      const aside = document.querySelector("aside")!;
      expect(aside.contains(children!)).toBe(false);
      // Children share the same flex parent as aside (two-column layout)
      const parent = aside.parentElement!;
      expect(parent.contains(children!)).toBe(true);
    });
  });

  // ─── Slice 12: class prop ────────────────────────────────────────────
  describe("class prop", () => {
    it("class prop is applied to root <aside>", () => {
      const { container } = render(() => (
        <CodemanSidebar
          {...defaultProps({ class: "border-2 border-red-500" })}
        />
      ));
      const aside = container.querySelector("aside")!;
      expect(aside.className).toContain("border-2");
      expect(aside.className).toContain("border-red-500");
    });
  });

  // ─── Slice 13: data-value hook ──────────────────────────────────────
  describe("data-value hook", () => {
    it("each leaf button has data-value attribute for e2e selection", () => {
      const options: SidebarOption[] = [
        { label: "Alpha", value: "alpha" },
        { label: "Beta", value: "beta" },
      ];
      render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const alphaItem = document.querySelector("[data-value='alpha']");
      const betaItem = document.querySelector("[data-value='beta']");
      expect(alphaItem).toBeTruthy();
      expect(betaItem).toBeTruthy();
      // data-value is on the menuitem div (the click target)
      expect(alphaItem!.getAttribute("role")).toBe("menuitem");
      expect(betaItem!.getAttribute("role")).toBe("menuitem");
    });

    it("children inside groups also have data-value", () => {
      const options: SidebarOption[] = [
        {
          label: "WS",
          value: "ws",
          defaultExpanded: true,
          children: [{ label: "Chat", value: "chat-1" }],
        },
      ];
      render(() => (
        <CodemanSidebar {...defaultProps({ options })} />
      ));
      const chatItem = document.querySelector("[data-value='chat-1']");
      expect(chatItem).toBeTruthy();
      expect(chatItem!.getAttribute("role")).toBe("menuitem");
    });
  });
});
