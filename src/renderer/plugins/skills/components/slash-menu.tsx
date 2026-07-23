//! SlashMenu — popup list of skill candidates triggered by `/` in textarea.
//!
//! Pure prop component — no internal state beyond UI navigation state.
//! No `effect` import — UI layer component per plugins/AGENTS.md rule.

import {
  createSignal,
  createMemo,
  For,
  Show,
  Switch,
  Match,
  onMount,
  onCleanup,
  type JSX,
} from "solid-js";
import { X, Terminal, User } from "lucide-solid";
import type { SkillManifest } from "../../../shared/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SlashMenuProps {
  /** From useSlashTrigger; null = closed */
  trigger: import("../lib/use-slash-trigger").SlashTrigger | null;
  /** Filtered candidates (caller already filtered enabled + non-corrupt) */
  candidates: readonly SkillManifest[];
  /** Current query string for highlight matching */
  query: string;
  /** Called when user selects a skill */
  onSelect: (skill: SkillManifest) => void;
  /** Called when user presses Escape or clicks outside */
  onClose: () => void;
  /** Popup anchor reference rect */
  anchorRect: DOMRect | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MENU_MAX_HEIGHT = 320;
const MENU_ITEM_HEIGHT = 56;
const GAP = 12;

/** Truncate description to 60 chars + ellipsis */
function truncateDescription(desc: string, maxLen = 60): string {
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen) + "…";
}

/** Case-insensitive substring highlight — returns the matching substring */
function matchHighlight(text: string, query: string): string {
  if (!query) return "";
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return "";
  return text.slice(idx, idx + query.length);
}

// ─── SlashMenuItem ─────────────────────────────────────────────────────────────

interface SlashMenuItemProps {
  skill: SkillManifest;
  isHighlighted: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  query: string;
}

function SlashMenuItem(props: SlashMenuItemProps): JSX.Element {
  const highlight = createMemo(() => matchHighlight(props.skill.name, props.query));

  return (
    <div
      role="option"
      aria-selected={props.isHighlighted}
      data-highlighted={props.isHighlighted ? "true" : undefined}
      class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
      classList={{
        "bg-accent": props.isHighlighted,
      }}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
    >
      {/* Source icon */}
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Show
          when={props.skill.source === "preinstalled"}
          fallback={<User class="h-4 w-4 text-muted-foreground" />}
        >
          <Terminal class="h-4 w-4 text-muted-foreground" />
        </Show>
      </div>

      {/* Name + description */}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-medium text-foreground">
            <Show
              when={highlight()}
              fallback={<span>{props.skill.name}</span>}
            >
              <span>
                {props.skill.name.slice(
                  0,
                  props.skill.name.toLowerCase().indexOf(props.query.toLowerCase()),
                )}
                <mark class="bg-yellow-200 dark:bg-yellow-800 text-foreground">
                  {highlight()}
                </mark>
                {props.skill.name.slice(
                  props.skill.name.toLowerCase().indexOf(props.query.toLowerCase()) +
                    props.query.length,
                )}
              </span>
            </Show>
          </span>
          <span
            class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            data-testid="source-badge"
          >
            {props.skill.source === "preinstalled" ? "preinstalled" : "user"}
          </span>
        </div>
        <p class="truncate text-xs text-muted-foreground">
          {truncateDescription(props.skill.description)}
        </p>
      </div>
    </div>
  );
}

// ─── SlashMenu ────────────────────────────────────────────────────────────────

export function SlashMenu(props: SlashMenuProps): JSX.Element {
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  // Reset highlighted index when candidates change
  const filteredCandidates = createMemo(() => {
    const q = props.query.toLowerCase().trim();
    if (!q) return [...props.candidates];
    return props.candidates.filter((s) => s.name.toLowerCase().includes(q));
  });

  // Reset index when filter changes
  createMemo(() => {
    void filteredCandidates();
    setHighlightedIndex(0);
  });

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    const candidates = filteredCandidates();
    if (candidates.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % candidates.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + candidates.length) % candidates.length);
        break;
      case "Enter":
        e.preventDefault();
        if (candidates[highlightedIndex()]) {
          props.onSelect(candidates[highlightedIndex()]!);
        }
        break;
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
      case "Tab":
        // Let tab close the menu naturally
        props.onClose();
        break;
    }
  };

  // Outside click detection
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  // Attach keyboard listener to document when menu is open
  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  // Compute popup position from anchorRect
  const popupStyle = createMemo((): JSX.CSSProperties => {
    const rect = props.anchorRect;
    if (!rect) return { display: "none" };

    const menuHeight = Math.min(
      filteredCandidates().length * MENU_ITEM_HEIGHT + 16,
      MENU_MAX_HEIGHT,
    );

    let top = rect.top - menuHeight - GAP;
    let left = rect.left;

    // If would go above viewport, position below textarea instead
    if (top < 0) {
      top = rect.bottom + GAP;
    }

    // Clamp left to stay within viewport
    const menuWidth = 320; // approximate max width
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 0) left = 8;

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: "320px",
      "max-height": `${MENU_MAX_HEIGHT}px`,
      "z-index": "z-50",
    };
  });

  const activeDescendantId = "slash-menu-active-option";

  const menuContent = (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Skills"
      aria-activedescendant={activeDescendantId}
      data-testid="slash-menu"
      class="overflow-y-auto rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/5"
      style={popupStyle()}
    >
      <Show
        when={filteredCandidates().length > 0}
        fallback={
          <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No matching skills
          </div>
        }
      >
        <For each={filteredCandidates()}>
          {(skill, idx) => (
            <SlashMenuItem
              skill={skill}
              isHighlighted={idx() === highlightedIndex()}
              onClick={() => props.onSelect(skill)}
              onMouseEnter={() => setHighlightedIndex(idx())}
              query={props.query}
            />
          )}
        </For>
      </Show>

      {/* Close button (optional — Escape already closes) */}
      <button
        type="button"
        aria-label="Close"
        class="absolute right-2 top-2 rounded p-1 opacity-50 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          props.onClose();
        }}
      >
        <X class="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <Switch>
      <Match when={props.trigger}>
        {menuContent}
      </Match>
    </Switch>
  );
}
