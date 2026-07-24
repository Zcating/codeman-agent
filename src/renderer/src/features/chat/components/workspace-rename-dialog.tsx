//! workspace-rename-dialog.tsx — Imperative rename dialog
//!
//! Exports showRenameDialog() — opens Dialog.show() with the rename form inline,
//! returns the new label (or null if cancelled). Caller owns the renameWorkspace Effect.

import { createSignal } from "solid-js";
import { Dialog } from "../../../shared/components/internal/codeman-dialog";
import { CodemanInput } from "../../../shared/components/internal/codeman-input";

export function showRenameDialog(label: string): Promise<string | null> {
  return Dialog.show<string | null>((resolve) => {
    const [value, setValue] = createSignal(label);

    return (
      <div class="space-y-4 p-4" data-testid="rename-dialog">
        <CodemanInput
          label="Workspace name"
          value={value()}
          onValueChange={setValue}
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
