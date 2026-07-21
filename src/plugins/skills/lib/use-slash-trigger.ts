//! use-slash-trigger — Solid hook that detects `/` keypress in a textarea.
//!
//! Listens for keydown on the textarea, tracks cursor position, and returns
//! trigger state when `/` is detected at start-of-input or after whitespace.
//!
//! No `effect` import — this is a pure Solid composable for the UI layer.

import { createSignal, onCleanup, type Accessor } from "solid-js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SlashTrigger {
  /** Current query after `/` (excludes the `/`), null = not triggered */
  query: string | null;
  /** Trigger position rect for popup anchoring */
  rect: DOMRect | null;
  /** Cursor position when trigger was detected */
  cursorPosition: number;
}

export interface UseSlashTriggerOptions {
  /** textarea ref (DOM element) */
  textareaRef: () => HTMLTextAreaElement | null;
  /** current value getter (Form field accessor or signal) */
  getValue: () => string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Detects `/` keypress in a textarea and returns trigger state.
 *
 * Trigger activates when `/` is pressed at start-of-input or after whitespace.
 * Returns null when no trigger is active.
 */
export function useSlashTrigger(
  opts: UseSlashTriggerOptions,
): Accessor<SlashTrigger | null> {
  const [trigger, setTrigger] = createSignal<SlashTrigger | null>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "/") return;

    const textarea = opts.textareaRef();
    if (!textarea) return;

    const value = opts.getValue();
    const pos = textarea.selectionStart;

    // Only trigger at start-of-input or after whitespace
    if (pos > 0 && value[pos - 1] !== " " && value[pos - 1] !== "\n") {
      return;
    }

    // Prevent `/` from being inserted — we handle it via the trigger
    e.preventDefault();

    // Compute query: everything after `/` up to cursor
    // (since `/` not yet inserted, cursor is at the `/` position)
    const query = pos < value.length ? value.substring(pos) : "";

    const rect = textarea.getBoundingClientRect();
    setTrigger({ query, rect, cursorPosition: pos });
  };

  const handleInput = () => {
    // After user types, update query based on current textarea value
    const current = trigger();
    if (!current) return;

    const textarea = opts.textareaRef();
    if (!textarea) return;

    const newValue = opts.getValue();
    const query = newValue.substring(current.cursorPosition);
    setTrigger((prev) => (prev ? { ...prev, query } : null));
  };

  const handleClick = () => {
    // Clicking repositioned cursor — check if still in trigger context
    const current = trigger();
    if (!current) return;

    const textarea = opts.textareaRef();
    if (!textarea) return;

    const value = opts.getValue();
    const pos = textarea.selectionStart;

    // Check if cursor is still after the trigger position and in trigger context
    if (pos <= current.cursorPosition) {
      // Cursor moved before/at trigger — close
      setTrigger(null);
      return;
    }

    // Check if still in trigger context (whitespace before trigger)
    if (current.cursorPosition > 0) {
      const charBefore = value[current.cursorPosition - 1];
      if (charBefore !== " " && charBefore !== "\n") {
        setTrigger(null);
        return;
      }
    }

    // Update query to reflect current cursor position
    const query = value.substring(current.cursorPosition);
    setTrigger((prev) => (prev ? { ...prev, query, cursorPosition: pos } : null));
  };

  const handleBlur = () => {
    // Small delay to allow click events on menu items to fire first
    setTimeout(() => setTrigger(null), 150);
  };

  const attachListeners = () => {
    const textarea = opts.textareaRef();
    if (!textarea) return;

    textarea.addEventListener("keydown", handleKeyDown);
    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("click", handleClick);
    textarea.addEventListener("blur", handleBlur);
  };

  const detachListeners = () => {
    const textarea = opts.textareaRef();
    if (!textarea) return;

    textarea.removeEventListener("keydown", handleKeyDown);
    textarea.removeEventListener("input", handleInput);
    textarea.removeEventListener("click", handleClick);
    textarea.removeEventListener("blur", handleBlur);
  };

  // Set up listeners on first call
  attachListeners();

  // Cleanup on unmount
  onCleanup(() => {
    detachListeners();
    setTrigger(null);
  });

  return trigger;
}

// ─── Close trigger helper ──────────────────────────────────────────────────────

/** Call this to programmatically close the slash trigger. */
export function closeSlashTrigger(setTrigger: (v: null) => void): void {
  setTrigger(null);
}
