//! WorkspaceActions — chat-domain group-header component for rename + inline delete.
//!
//! Used as the `renderGroupHeader` content in ChatSidebar's universal
//! CodemanSidebar. Renders the workspace label + two hover-revealed action
//! buttons (rename / delete).
//!
//! Delete uses inline confirmation (like ConvDeleteAction) — clicking the
//! trash icon reveals a "删除" / "取消" overlay inside the trigger row,
//! instead of a modal Dialog.confirm().
//!
//! Per ADR-0030 D6: chat-domain features (workspace rename / delete) live in
//! chat/feature, NOT in the universal sidebar. This component is passed to
//! `CodemanSidebar`'s `renderGroupHeader` prop.
//!
//! Action buttons call `e.stopPropagation()` to prevent bubbling to the
//! parent Accordion.ItemTrigger (which would otherwise expand/collapse the
//! workspace group on every rename/delete click).

import { createSignal, Show, type JSX } from "solid-js";
import { Pencil, Trash2 } from "lucide-solid";

export interface WorkspaceActionsProps {
  wsId: string;
  label: string;
  onRename: (wsId: string, label: string) => void;
  onDelete: (wsId: string, label: string) => void;
}

export function WorkspaceActions(
  props: WorkspaceActionsProps,
): JSX.Element {
  const [confirming, setConfirming] = createSignal(false);

  return (
    <div class="flex w-full items-center justify-between gap-2 min-w-0">
      <span class="truncate flex-1"
            classList={{ "invisible": confirming() }}>
        {props.label}
      </span>
      <span
        class="pointer-events-auto flex items-center gap-1 transition-opacity"
        classList={{
          "opacity-0": !confirming(),
          "group-hover/row:opacity-100": !confirming(),
          "invisible": confirming(),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          class="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={(e) => {
            e.stopPropagation();
            props.onRename(props.wsId, props.label);
          }}
          aria-label={`Rename ${props.label}`}
        >
          <Pencil class="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent hover:text-destructive outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          aria-label={`Delete ${props.label}`}
        >
          <Trash2 class="h-3 w-3" aria-hidden="true" />
        </button>
      </span>
      <Show when={confirming()}>
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
              props.onDelete(props.wsId, props.label);
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
      </Show>
    </div>
  );
}
