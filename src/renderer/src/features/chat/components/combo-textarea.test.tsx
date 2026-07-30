











import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { createSignal, type JSX } from "solid-js";
import { ComboTextarea } from "@codeman-frontend/features/chat/components/combo-textarea";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";



const makeSkill = (
  name: string,
  source: "preinstalled" | "user" = "preinstalled",
): SkillManifest => ({
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



interface WrapperProps {
  initialValue?: string;
  skills?: readonly SkillManifest[];
}

function TestWrapper(props: WrapperProps): JSX.Element {
  const [value, setValue] = createSignal(props.initialValue ?? "");
  let textareaEl: HTMLTextAreaElement | undefined;

  return (
    <div>
      <span data-testid="current-value">{value()}</span>
      <ComboTextarea
        value={value()}
        onChange={setValue}
        skills={props.skills ?? FIXTURE_SKILLS}
        placeholder="type / for skills"
        rows={3}
        ref={(el) => {
          textareaEl = el;
        }}
      />
      <button
        data-testid="focus-textarea"
        onClick={() => textareaEl?.focus()}
      >
        focus
      </button>
    </div>
  );
}



beforeEach(() => {
  
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(50, 100, 320, 50),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});




function getTextarea(): HTMLTextAreaElement {
  const ta = document.querySelector("textarea");
  if (!ta) {
    throw new Error("No textarea in DOM");
  }
  return ta;
}



describe("ComboTextarea — slash trigger", () => {
  it("does not open menu when value has no `/`", () => {
    const { queryByTestId } = render(() => <TestWrapper />);
    expect(queryByTestId("slash-menu")).toBeNull();
  });

  it("does not open menu when `/` is in the middle of a word", () => {
    const { queryByTestId } = render(() => (
      <TestWrapper initialValue="abc/def" />
    ));
    expect(queryByTestId("slash-menu")).toBeNull();
  });

  it("opens menu when value contains `/` at start of input", () => {
    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    expect(queryByTestId("slash-menu")).toBeInTheDocument();
  });

  it("opens menu when `/` follows whitespace", () => {
    const { queryByTestId } = render(() => <TestWrapper initialValue="" />);
    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: "hello /" } });
    expect(queryByTestId("slash-menu")).toBeInTheDocument();
  });

  it("filters candidates by query substring (case-insensitive)", () => {
    const { queryAllByTestId } = render(() => (
      <TestWrapper initialValue="/co" />
    ));
    const options = queryAllByTestId("slash-menu-item");
    expect(options.length).toBe(2);
    const names = options.map((o) => o.textContent ?? "");
    expect(names.some((n) => n.includes("commit-helper"))).toBe(true);
    expect(names.some((n) => n.includes("code-review"))).toBe(true);
  });

  it("shows empty state when no candidates match", () => {
    const { getByTestId } = render(() => <TestWrapper initialValue="/xyz" />);
    const menu = getByTestId("slash-menu");
    expect(menu.textContent ?? "").toContain("No matching skills");
  });
});

describe("ComboTextarea — focus management", () => {
  it("keeps activeElement as TEXTAREA when menu opens (no focus theft)", () => {
    const { getByTestId } = render(() => <TestWrapper initialValue="/" />);
    expect(getByTestId("slash-menu")).toBeInTheDocument();

    
    
    getByTestId("focus-textarea").click();
    expect(document.activeElement?.tagName).toBe("TEXTAREA");

    
    fireEvent.input(getTextarea(), { target: { value: "/x" } });
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });
});

describe("ComboTextarea — keyboard navigation", () => {
  it("ArrowDown cycles highlight forward", () => {
    render(() => <TestWrapper initialValue="/" />);
    const textarea = getTextarea();

    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    const options = document.querySelectorAll('[role="option"]');
    expect(options[1]?.getAttribute("data-highlighted")).toBe("true");
  });

  it("ArrowUp cycles highlight backward (wrap-around)", () => {
    render(() => <TestWrapper initialValue="/" />);
    const textarea = getTextarea();

    
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    const options = document.querySelectorAll('[role="option"]');
    expect(options[3]?.getAttribute("data-highlighted")).toBe("true");
  });

  it("Enter on menu writes /<skill>  to value and closes menu", () => {
    const { getByTestId, queryByTestId } = render(() => (
      <TestWrapper initialValue="/" />
    ));
    const textarea = getTextarea();

    
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    
    expect(queryByTestId("slash-menu")).toBeNull();
    expect(getByTestId("current-value").textContent).toBe("/code-review ");
  });

  it("Escape closes menu (userDismissed path)", () => {
    const { getByTestId, queryByTestId } = render(() => (
      <TestWrapper initialValue="/" />
    ));
    const textarea = getTextarea();

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(queryByTestId("slash-menu")).toBeNull();
    
    expect(getByTestId("current-value").textContent).toBe("/");
  });

  it("Backspace clears `/` → userDismissed resets → next `/` reopens", () => {
    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    const textarea = getTextarea();

    
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(queryByTestId("slash-menu")).toBeNull();

    
    fireEvent.input(textarea, { target: { value: "" } });
    expect(queryByTestId("slash-menu")).toBeNull();

    
    fireEvent.input(textarea, { target: { value: "/" } });
    expect(queryByTestId("slash-menu")).toBeInTheDocument();
  });

  it("Ctrl+/ re-opens menu after userDismissed=true", () => {
    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    const textarea = getTextarea();

    
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(queryByTestId("slash-menu")).toBeNull();

    
    fireEvent.keyDown(textarea, { key: "/", ctrlKey: true });
    expect(queryByTestId("slash-menu")).toBeInTheDocument();
  });

  it("Cmd+/ (meta key) also re-opens menu", () => {
    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    const textarea = getTextarea();

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(queryByTestId("slash-menu")).toBeNull();

    fireEvent.keyDown(textarea, { key: "/", metaKey: true });
    expect(queryByTestId("slash-menu")).toBeInTheDocument();
  });

  it("keyboard navigation is ignored when menu is closed", () => {
    const { queryByTestId } = render(() => (
      <TestWrapper initialValue="hello world" />
    ));
    const textarea = getTextarea();
    expect(queryByTestId("slash-menu")).toBeNull();

    
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(queryByTestId("slash-menu")).toBeNull();
  });
});

describe("ComboTextarea — selection", () => {
  it("clicking a skill item writes /<name>  and closes menu", () => {
    const { getByTestId, queryByTestId } = render(() => (
      <TestWrapper initialValue="/" />
    ));
    const items = document.querySelectorAll('[data-testid="slash-menu-item"]');
    expect(items.length).toBeGreaterThan(0);

    
    fireEvent.click(items[0] as HTMLElement);

    expect(getByTestId("current-value").textContent).toBe("/commit-helper ");
    expect(queryByTestId("slash-menu")).toBeNull();
  });

  it("selecting a skill after a query replaces just the query substring", () => {
    const { getByTestId, queryByTestId } = render(() => (
      <TestWrapper initialValue="hello /co" />
    ));
    const items = document.querySelectorAll('[data-testid="slash-menu-item"]');
    expect(items.length).toBe(2);

    
    fireEvent.click(items[0] as HTMLElement);

    
    expect(getByTestId("current-value").textContent).toBe(
      "hello /commit-helper ",
    );
    expect(queryByTestId("slash-menu")).toBeNull();
  });

  it("popover width tracks the textarea wrapper width (not hardcoded 320px)", () => {
    
    
    
    vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue(
      new DOMRect(50, 100, 640, 50),
    );

    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    expect(queryByTestId("slash-menu")).toBeInTheDocument();

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement | null;
    expect(popoverContent).not.toBeNull();
    expect(popoverContent!.style.width).toBe("640px");
  });

  it("caps popover height to available vertical space (no clipping when <320px)", () => {
    
    
    
    
    
    
    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    expect(queryByTestId("slash-menu")).toBeInTheDocument();

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement | null;
    expect(popoverContent).not.toBeNull();
    expect(popoverContent!.style.maxHeight).toBe(
      "var(--available-height, 320px)",
    );
  });

  it("popover width is not stolen by an empty PopoverAnchor (0px wide)", () => {
    
    
    
    
    
    
    
    
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(
      function (this: Element): DOMRect {
        const el = this as HTMLElement;
        if (el.matches('[data-slot="popover-anchor"]')) {
          return new DOMRect(50, 100, 0, 50);
        }
        return new DOMRect(50, 100, 640, 50);
      },
    );

    const { queryByTestId } = render(() => <TestWrapper initialValue="/" />);
    expect(queryByTestId("slash-menu")).toBeInTheDocument();

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement | null;
    expect(popoverContent).not.toBeNull();
    expect(popoverContent!.style.width).toBe("640px");
  });
});