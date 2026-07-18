//! WorkspaceActions — chat-domain group-header component for rename + delete.
//!
//! Used as the `renderGroupHeader` content in ChatSidebar's universal
//! CodemanSidebar. Renders the workspace label + two hover-revealed action
//! buttons (rename / delete).
//!
//! Per ADR-0030 D6: chat-domain features (workspace rename / delete) live in
//! chat/feature, NOT in the universal sidebar. This component is passed to
//! `CodemanSidebar`'s `renderGroupHeader` prop.
//!
//! Action buttons call `e.stopPropagation()` to prevent bubbling to the
//! parent Accordion.ItemTrigger (which would otherwise expand/collapse the
//! workspace group on every rename/delete click).

import type { JSX } from "solid-js";
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
  return (
    <div class="flex w-full items-center justify-between gap-2 min-w-0">
      <span class="truncate flex-1">{props.label}</span>
      <span
        class="pointer-events-auto flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
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
            props.onDelete(props.wsId, props.label);
          }}
          aria-label={`Delete ${props.label}`}
        >
          <Trash2 class="h-3 w-3" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
