//! ComboTextarea — textarea + slash-menu popup (production home for Variant A).
//!
//! ADR-0037: 取代 `plugins/skills/components/slash-menu.tsx` +
//! `plugins/skills/lib/use-slash-trigger.ts` 的双文件模型。textarea + 状态机 +
//! Popover 三者合一,集中处理焦点陷阱 + `userDismissed` 防 flicker。
//!
//! 设计要点:
//! - 内部用 `CodemanTextarea`(IME-safe),不绕过。
//! - `autoFocus={false}` / `restoreFocus={false}` / `closeOnInteractOutside={false}`
//!   三个 ark-ui prop 透传给内部 `<Popover>`,保留 textarea 焦点 + 自管关闭路径。
//! - `userDismissed` 信号:一旦显式关闭(选 / Esc / Ctrl+/ 之外的关闭),菜单
//!   持续关闭直至输入框中所有 `/` 被 backspace 清空。下一次 `/` 由 deriveTrigger
//!   自然触发,无需手动 reset。
//! - Ctrl/Cmd+/:忽略 IME,显式强制重开(即便 userDismissed=true)。
//! - Enter:菜单开着 → 选中并关闭 + userDismissed=true;菜单关着 →
//!   不 preventDefault,原生表单 submit 透传(由外层 `<form onSubmit>` 接管)。

import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  type JSX,
} from "solid-js";
import { Terminal, User } from "lucide-solid";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@codeman-frontend/shared/components/ui/popover";
import { CodemanTextarea } from "@codeman-frontend/shared/components/internal/codeman-textarea";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ComboTextareaProps {
  /** Controlled textarea value (from form.Field / signal). */
  value: string;
  /** Called whenever the textarea value changes (IME-safe). */
  onChange: (value: string) => void;
  /** Skill candidates to show when menu is open. Filtering is the caller's job. */
  skills: readonly SkillManifest[];
  /** Textarea placeholder. */
  placeholder?: string;
  /** Number of visible rows. */
  rows?: number;
  /** Disable textarea (e.g. while sending). */
  disabled?: boolean;
  /** Error message rendered below textarea (per CodemanTextarea). */
  error?: import("solid-js").JSX.Element;
  /** Forward to the textarea DOM node (external .focus() / setSelectionRange). */
  ref?: HTMLTextAreaElement | ((el: HTMLTextAreaElement) => void);
  /** Accessible id for the textarea + label pairing. */
  id?: string;
  /** Optional class for the outer wrapper. */
  class?: string;
  /** Forward to the textarea DOM node (test selectors). */
  "data-testid"?: string;
  /**
   * Caller-supplied keydown handler. ComboTextarea's own menu-handling logic
   * runs FIRST (intercepting `/`, Ctrl+/, ArrowUp/Down/Enter/Esc when menu is
   * open). This handler runs unconditionally afterwards — useful for chat-view's
   * input history (ArrowUp/Down when menu closed) and Ctrl+Enter (form submit).
   * ComboTextarea will not call this if it already preventDefault'd.
   */
  onKeyDown?: (e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
}

interface TriggerState {
  /** Position of the `/` in the textarea value */
  slashPosition: number;
  /** Everything after the `/` */
  query: string;
  /** Fresh rect of the textarea at time of last trigger set */
  rect: DOMRect | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 320;

// ─── SlashMenuItem (private) ───────────────────────────────────────────────────

interface SlashMenuItemProps {
  skill: SkillManifest;
  isHighlighted: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  query: string;
}

function truncateDescription(desc: string, maxLen = 60): string {
  if (desc.length <= maxLen) {return desc;}
  return desc.slice(0, maxLen) + "…";
}

function matchHighlight(text: string, query: string): string {
  if (!query) {return "";}
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {return "";}
  return text.slice(idx, idx + query.length);
}

function SlashMenuItem(props: SlashMenuItemProps): JSX.Element {
  const highlight = createMemo(() => matchHighlight(props.skill.name, props.query));
  const matchIdx = createMemo(() =>
    props.query
      ? props.skill.name.toLowerCase().indexOf(props.query.toLowerCase())
      : -1
  );

  return (
    <div
      role="option"
      aria-selected={props.isHighlighted}
      data-highlighted={props.isHighlighted ? "true" : undefined}
      data-testid="slash-menu-item"
      class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
      classList={{
        "bg-accent": props.isHighlighted,
      }}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
    >
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Show
          when={props.skill.source === "preinstalled"}
          fallback={<User class="h-4 w-4 text-muted-foreground" />}
        >
          <Terminal class="h-4 w-4 text-muted-foreground" />
        </Show>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-medium text-foreground">
            <Show
              when={highlight() && matchIdx() >= 0}
              fallback={<span>{props.skill.name}</span>}
            >
              <span>
                {props.skill.name.slice(0, matchIdx())}
                <mark class="bg-yellow-200 dark:bg-yellow-800 text-foreground">
                  {highlight()}
                </mark>
                {props.skill.name.slice(matchIdx() + props.query.length)}
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

// ─── ComboTextarea ─────────────────────────────────────────────────────────────

export function ComboTextarea(props: ComboTextareaProps): JSX.Element {
  // State
  const [triggerSignal, setTriggerSignal] = createSignal<TriggerState | null>(null);
  const [userDismissed, setUserDismissed] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);

  // Refs
  let textareaEl: HTMLTextAreaElement | null = null;
  let wrapperEl: HTMLDivElement | undefined;

  // Auto-reset userDismissed when the user backspaces the `/` out of the input
  // — they have to type `/` again to reopen the menu.
  createEffect(() => {
    if (userDismissed() && props.value.lastIndexOf("/") === -1) {
      setUserDismissed(false);
    }
  });

  // deriveTrigger recalculates when value changes (user typed `/`)
  const deriveTrigger = createMemo((): TriggerState | null => {
    const val = props.value;
    const pos = val.lastIndexOf("/");
    if (pos === -1) {return null;}
    if (pos > 0 && val[pos - 1] !== " " && val[pos - 1] !== "\n") {return null;}
    return {
      slashPosition: pos,
      query: val.substring(pos + 1),
      rect: textareaEl?.getBoundingClientRect() ?? null,
    };
  });

  // trigger = explicit Ctrl+/ signal if set, otherwise derived from value.
  // Returns null when userDismissed is true (user explicitly closed the menu).
  const trigger = createMemo((): TriggerState | null => {
    if (userDismissed()) {return null;}
    const explicit = triggerSignal();
    if (explicit) {return explicit;}
    return deriveTrigger();
  });

  // Filtered candidates (memoised so highlight stays consistent)
  const filteredSkills = createMemo(() => {
    const q = trigger()?.query ?? "";
    if (!q) {return [...props.skills];}
    const lower = q.toLowerCase();
    return props.skills.filter((s) => s.name.toLowerCase().includes(lower));
  });

  // Reset highlight on filter change
  createEffect(() => {
    void filteredSkills();
    setHighlightedIndex(0);
  });

  // Anchor rect — re-read on scroll/resize via Popover's positioning.getAnchorRect.
  const getAnchorRect = () => textareaEl?.getBoundingClientRect() ?? null;

  // Keyboard handler on textarea — let `/` through (browser inserts it, value
  // change triggers deriveTrigger). Only intercept navigation keys when menu open.
  // Caller's onKeyDown fires for keys we don't intercept.
  const handleKeyDown = (e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    let intercepted = false;

    // Ctrl+/ or Cmd+/ — open menu without inserting `/`. Re-opens even after
    // the user explicitly dismissed (userDismissed = true).
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      intercepted = true;
      setUserDismissed(false);
      setTriggerSignal({
        slashPosition: textareaEl?.selectionStart ?? 0,
        query: "",
        rect: textareaEl?.getBoundingClientRect() ?? null,
      });
      setHighlightedIndex(0);
    } else if (trigger()) {
      const candidates = filteredSkills();
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          intercepted = true;
          if (candidates.length > 0) {
            setHighlightedIndex((i) => (i + 1) % candidates.length);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          intercepted = true;
          if (candidates.length > 0) {
            setHighlightedIndex((i) => (i - 1 + candidates.length) % candidates.length);
          }
          break;
        case "Enter":
          e.preventDefault();
          intercepted = true;
          if (candidates[highlightedIndex()]) {
            handleSelect(candidates[highlightedIndex()]!);
          }
          break;
        case "Escape":
          e.preventDefault();
          intercepted = true;
          handleClose();
          break;
      }
    }

    // Caller's handler always runs (covers Ctrl+Enter submit, ArrowUp/Down
    // input history when menu closed, IME composition, etc.).
    props.onKeyDown?.(e);

    // Suppress unused-warning — `intercepted` is read for clarity but the
    // caller's handler still fires (it's the caller's job to check e.defaultPrevented).
    void intercepted;
  };

  const handleSelect = (skill: SkillManifest) => {
    const t = trigger();
    if (!t) {return;}
    const newValue =
      props.value.slice(0, t.slashPosition) +
      `/${skill.name} ` +
      props.value.slice(t.slashPosition + 1 + t.query.length);
    props.onChange(newValue);
    setHighlightedIndex(0);
    // Close after selection: the next `/` (if the user wants another skill)
    // must be typed fresh — otherwise deriveTrigger would immediately re-open
    // the menu with the just-selected skill's name as the query.
    handleClose();
  };

  const handleClose = () => {
    setTriggerSignal(null);
    setUserDismissed(true);
    setHighlightedIndex(0);
  };

  return (
    <div
      class={props.class}
      data-combo-textarea
    >
      <div ref={wrapperEl}>
        <CodemanTextarea
          id={props.id}
          rows={props.rows}
          value={props.value}
          onValueChange={props.onChange}
          placeholder={props.placeholder}
          disabled={props.disabled}
          error={props.error}
          data-testid={props["data-testid"]}
          ref={(el) => {
            textareaEl = el;
            if (typeof props.ref === "function") {
              props.ref(el);
            } else if (props.ref !== undefined) {
              // Caller passed a ref object — assignment is the caller's responsibility
              // outside this component (we only forward via the function form).
            }
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      <Show when={!!trigger()}>
        <Popover
          open={!!trigger()}
          onOpenChange={(details) => {
            if (!details.open) {
              handleClose();
            }
          }}
          positioning={{
            placement: "top-start",
            getAnchorRect,
            offset: { mainAxis: 8, crossAxis: 0 },
          }}
          autoFocus={false}
          restoreFocus={false}
          closeOnInteractOutside={false}
        >
          <PopoverAnchor ref={wrapperEl} />
          <PopoverContent
            class="p-0 overflow-hidden"
            style={{
              width: `${POPOVER_WIDTH}px`,
              height: `${POPOVER_HEIGHT}px`,
            }}
          >
            <div
              class="h-full overflow-y-auto"
              role="listbox"
              aria-label="Skills"
              data-testid="slash-menu"
            >
              <Show
                when={filteredSkills().length > 0}
                fallback={
                  <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No matching skills
                  </div>
                }
              >
                <For each={filteredSkills()}>
                  {(skill, idx) => (
                    <SlashMenuItem
                      skill={skill}
                      isHighlighted={idx() === highlightedIndex()}
                      onClick={() => handleSelect(skill)}
                      onMouseEnter={() => setHighlightedIndex(idx())}
                      query={trigger()?.query ?? ""}
                    />
                  )}
                </For>
              </Show>
            </div>
          </PopoverContent>
        </Popover>
      </Show>
    </div>
  );
}