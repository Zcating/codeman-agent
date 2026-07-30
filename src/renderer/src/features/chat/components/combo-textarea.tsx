










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

export interface ComboTextareaProps {
  
  value: string;
  
  onChange: (value: string) => void;
  
  skills: readonly SkillManifest[];
  
  placeholder?: string;
  
  rows?: number;
  
  disabled?: boolean;
  
  error?: import("solid-js").JSX.Element;
  
  ref?: HTMLTextAreaElement | ((el: HTMLTextAreaElement) => void);
  
  id?: string;
  
  class?: string;
  
  "data-testid"?: string;
  
  onKeyDown?: (e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
}

interface TriggerState {
  
  slashPosition: number;
  
  query: string;
  
  rect: DOMRect | null;
}

const POPOVER_HEIGHT = 320;

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

export function ComboTextarea(props: ComboTextareaProps): JSX.Element {
  
  const [triggerSignal, setTriggerSignal] = createSignal<TriggerState | null>(null);
  const [userDismissed, setUserDismissed] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);

  
  let textareaEl: HTMLTextAreaElement | null = null;
  let wrapperEl: HTMLDivElement | undefined;
  let anchorEl: HTMLDivElement | undefined;

  
  
  createEffect(() => {
    if (userDismissed() && props.value.lastIndexOf("/") === -1) {
      setUserDismissed(false);
    }
  });

  
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

  
  
  const trigger = createMemo((): TriggerState | null => {
    if (userDismissed()) {return null;}
    const explicit = triggerSignal();
    if (explicit) {return explicit;}
    return deriveTrigger();
  });

  
  const filteredSkills = createMemo(() => {
    const q = trigger()?.query ?? "";
    if (!q) {return [...props.skills];}
    const lower = q.toLowerCase();
    return props.skills.filter((s) => s.name.toLowerCase().includes(lower));
  });

  
  createEffect(() => {
    void filteredSkills();
    setHighlightedIndex(0);
  });

  
  const getAnchorRect = () => textareaEl?.getBoundingClientRect() ?? null;

  
  
  
  const handleKeyDown = (e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    let intercepted = false;

    
    
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

    
    
    props.onKeyDown?.(e);

    
    
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
          <PopoverAnchor ref={anchorEl} />
          <PopoverContent
            class="p-0 overflow-hidden"
            style={{
              width: `${wrapperEl?.getBoundingClientRect().width ?? 0}px`,
              height: `${POPOVER_HEIGHT}px`,
              
              
              
              
              
              "max-height": `var(--available-height, ${POPOVER_HEIGHT}px)`,
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