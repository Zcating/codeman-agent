//! ConvDeleteAction — chat-domain leaf component for inline delete confirm.
//!
//! Per ADR-0030 D6: chat-domain features (delete + inline confirm) live in
//! chat/feature, NOT in the universal CodemanSidebar. This component is
//! rendered as the `renderItem` content for conversation leaves.
//!
//! Visual states:
//! - idle: Trash icon button (hover-revealed via `group-hover/row:opacity-100`)
//! - confirming: inline overlay with "删除" / "取消" buttons (absolute, covers row)
//!
//! Hover-reveal uses Tailwind v4 `group-hover/row` selector — relies on the
//! universal sidebar's `<div role="menuitem" class="group/row ...">` wrapper.

import { createSignal, Show, type JSX } from "solid-js";
import { Loader2, Trash2 } from "lucide-solid";

export interface ConvDeleteActionProps {
  convId: string;
  label: string;
  isStreaming?: boolean;
  onDelete: (convId: string) => void;
}

export function ConvDeleteAction(
  props: ConvDeleteActionProps,
): JSX.Element {
  const [confirming, setConfirming] = createSignal(false);

  return (
    <Show
      when={!confirming()}
      fallback={
        // Confirm overlay — covers the row so buttons aren't crammed at the
        // row's end. Sits inside the menuitem wrapper which has `relative`.
        <div
          data-state="confirming"
          class="absolute inset-0 z-10 flex items-center justify-end gap-1 rounded-md bg-sidebar pr-2"
        >
          <button
            type="button"
            class="h-7 px-2 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
              props.onDelete(props.convId);
            }}
            aria-label="确认删除"
          >
            删除
          </button>
          <button
            type="button"
            class="h-7 px-2 text-xs rounded-md border border-input hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
            aria-label="取消删除"
          >
            取消
          </button>
        </div>
      }
    >
      <Show when={props.isStreaming}>
        <Loader2
          class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-label="streaming"
        />
      </Show>
      <button
        type="button"
        class="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        aria-label="Delete conversation"
      >
        <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Show>
  );
}
