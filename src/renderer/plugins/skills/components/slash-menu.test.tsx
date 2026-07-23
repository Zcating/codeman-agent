//! slash-menu.test.tsx — SlashMenu component tests.
//!
//! Tests: renders nothing when trigger is null, renders all candidates when query
//! is empty, filters candidates by substring match, shows empty state when no
//! matches, arrow keys cycle selection, Enter calls onSelect, Escape calls
//! onClose, outside click closes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { createSignal, type JSX } from "solid-js";
import { SlashMenu } from "./slash-menu";
import type { SkillManifest } from "../../../shared/lib/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeSkill = (name: string, source: "preinstalled" | "user" = "preinstalled"): SkillManifest => ({
  name,
  description: `Description for ${name}`,
  source,
  path: `/fake/path/${name}/SKILL.md`,
});

const FIXTURE_SKILLS: readonly SkillManifest[] = [
  makeSkill("commit-helper", "preinstalled"),
  makeSkill("code-review", "preinstalled"),
  makeSkill("planning-with-files", "user"),
  makeSkill("test-driven-development", "user"),
];

// ─── Test wrapper ──────────────────────────────────────────────────────────

interface WrapperProps {
  trigger: import("../lib/use-slash-trigger").SlashTrigger | null;
  candidates?: readonly SkillManifest[];
  query?: string;
  onSelect?: (skill: SkillManifest) => void;
  onClose?: () => void;
}

function TestWrapper(props: WrapperProps): JSX.Element {
  const [selected, setSelected] = createSignal<SkillManifest | null>(null);
  const [closed, setClosed] = createSignal(false);

  return (
    <div>
      <button
        data-testid="outside-button"
        onClick={() => setClosed(true)}
      >
        Outside
      </button>
      <SlashMenu
        trigger={props.trigger}
        candidates={props.candidates ?? FIXTURE_SKILLS}
        query={props.query ?? ""}
        onSelect={(skill) => {
          setSelected(skill);
          props.onSelect?.(skill);
        }}
        onClose={() => {
          setClosed(true);
          props.onClose?.();
        }}
        anchorRect={
          props.trigger
            ? { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect
            : null
        }
      />
      <span data-testid="selected-name">{selected()?.name ?? "none"}</span>
      <span data-testid="closed">{closed() ? "yes" : "no"}</span>
    </div>
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("SlashMenu", () => {
  beforeEach(() => {
    // Mock getBoundingClientRect for fixed positioning
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(50, 100, 320, 50),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when trigger is null", () => {
    const { queryByTestId } = render(() => <TestWrapper trigger={null} />);
    expect(queryByTestId("slash-menu")).toBeNull();
  });

  it("renders all candidates when query is empty", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: null, rect, cursorPosition: 0 };
    const { getByTestId } = render(() => (
      <TestWrapper trigger={trigger} query="" />
    ));
    const menu = getByTestId("slash-menu");
    expect(menu).toBeInTheDocument();
    const options = menu.querySelectorAll('[role="option"]');
    expect(options.length).toBe(FIXTURE_SKILLS.length);
  });

  it("filters candidates by substring match (case-insensitive)", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "co", rect, cursorPosition: 0 };
    const { getByTestId } = render(() => (
      <TestWrapper trigger={trigger} query="co" />
    ));
    const menu = getByTestId("slash-menu");
    const options = menu.querySelectorAll('[role="option"]');
    // commit-helper and code-review match "co"
    expect(options.length).toBe(2);
    const names = Array.from(options).map((o) => o.textContent ?? "");
    expect(names.some((n) => n.includes("commit-helper"))).toBe(true);
    expect(names.some((n) => n.includes("code-review"))).toBe(true);
  });

  it("shows empty state when no matches", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "xyz", rect, cursorPosition: 0 };
    const { getByTestId } = render(() => (
      <TestWrapper trigger={trigger} query="xyz" />
    ));
    const menu = getByTestId("slash-menu");
    expect(menu).toBeInTheDocument();
    const options = menu.querySelectorAll('[role="option"]');
    expect(options.length).toBe(0);
    expect(menu.textContent ?? "").toContain("No matching skills");
  });

  it("arrow down cycles selection forward", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "", rect, cursorPosition: 0 };
    const { getByTestId } = render(() => <TestWrapper trigger={trigger} />);
    const menu = getByTestId("slash-menu");

    // ArrowDown
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const firstOption = menu.querySelector('[data-highlighted="true"]');
    expect(firstOption).toBeTruthy();
    // After one ArrowDown, should be on index 1 (second item)
    const options = menu.querySelectorAll('[role="option"]');
    expect(options[1]?.getAttribute("data-highlighted")).toBe("true");
  });

  it("arrow up cycles selection backward", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "", rect, cursorPosition: 0 };
    const { getByTestId } = render(() => <TestWrapper trigger={trigger} />);
    const menu = getByTestId("slash-menu");

    // Go to index 2 with two ArrowDowns
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // Then go up — from 2 to 1
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    const options = menu.querySelectorAll('[role="option"]');
    expect(options[1]?.getAttribute("data-highlighted")).toBe("true");
  });

  it("Enter calls onSelect with highlighted skill", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "", rect, cursorPosition: 0 };
    const onSelect = vi.fn();
    const { getByTestId } = render(() => (
      <TestWrapper trigger={trigger} onSelect={onSelect} />
    ));
    const menu = getByTestId("slash-menu");

    // Navigate to second item
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // Press Enter
    fireEvent.keyDown(menu, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: "code-review" }),
    );
  });

  it("Escape calls onClose", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "", rect, cursorPosition: 0 };
    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <TestWrapper trigger={trigger} onClose={onClose} />
    ));
    const menu = getByTestId("slash-menu");

    fireEvent.keyDown(menu, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("outside click calls onClose", async () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "", rect, cursorPosition: 0 };
    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <TestWrapper trigger={trigger} onClose={onClose} />
    ));

    // Click outside the menu
    const outsideBtn = getByTestId("outside-button");
    fireEvent.mouseDown(outsideBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows source badge for preinstalled vs user skills", () => {
    const rect = { top: 100, left: 50, bottom: 150, right: 370, width: 320, height: 50 } as DOMRect;
    const trigger = { query: "", rect, cursorPosition: 0 };
    const { getByTestId } = render(() => <TestWrapper trigger={trigger} />);
    const menu = getByTestId("slash-menu");
    const badges = menu.querySelectorAll('[data-testid="source-badge"]');
    expect(badges.length).toBe(FIXTURE_SKILLS.length);
    const badgeTexts = Array.from(badges).map((b) => b.textContent);
    expect(badgeTexts).toContain("preinstalled");
    expect(badgeTexts).toContain("user");
  });
});
