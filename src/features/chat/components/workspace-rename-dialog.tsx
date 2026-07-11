//! workspace-rename-dialog.tsx — Imperative rename dialog
//!
//! Exports showRenameDialog() — opens Dialog.show() with the rename form inline,
//! returns the new label (or null if cancelled). Caller owns the renameWorkspace Effect.

import { createSignal } from "solid-js";
import { Dialog } from "../../../shared/components/internal/codeman-dialog";

export function showRenameDialog(label: string): Promise<string | null> {
  return Dialog.show<string | null>((resolve) => {
    const [value, setValue] = createSignal(label);

    return (
      <div class="space-y-4 p-4" data-testid="rename-dialog">
        <label class="text-sm font-medium">Workspace name</label>
        <input
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          autofocus
          data-testid="rename-input"
        />
        <div class="flex justify-end gap-2 pt-2">
          <button
            class="inline-flex h-10 px-4 py-2 items-center justify-center rounded-md border border-input"
            onClick={() => resolve(null)}
          >
            Cancel
          </button>
          <button
            class="inline-flex h-10 px-4 py-2 items-center justify-center rounded-md bg-primary text-primary-foreground"
            onClick={() => resolve(value())}
            data-testid="rename-submit"
          >
            Rename
          </button>
        </div>
      </div>
    );
  });
}
