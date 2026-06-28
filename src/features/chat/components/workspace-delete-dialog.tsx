//! workspace-delete-dialog.tsx — Sidebar hover → delete confirm modal (calls removeWorkspace)
import { useCodemanDialog } from "../../../shared/components/internal/codeman-dialog";
import { removeWorkspace } from "../stores/chat.store";
import type { Component } from "solid-js";
import { Button } from "../../../shared/components/ui/button";
import { Effect, Exit } from "effect";

export interface WorkspaceDeleteDialogProps {
  workspaceId: string;
  label: string;
  open: boolean;
  onClose: () => void;
}

export const WorkspaceDeleteDialog: Component<WorkspaceDeleteDialogProps> = (props) => {
  const dialog = useCodemanDialog();

  const handleDelete = async () => {
    const confirmed = await dialog.confirm({
      title: "Delete workspace",
      content: `Are you sure you want to delete "${props.label}"? All conversations in this workspace will be permanently deleted.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;

    const result = await Effect.runPromiseExit(
      removeWorkspace(props.workspaceId)
    );
    if (Exit.isSuccess(result)) {
      props.onClose();
    }
    // onFailure: dialog stays open, error shown (caller may show toast)
  };

  return (
    <div data-testid="delete-dialog" class="space-y-4 p-4">
      <p class="text-sm text-muted-foreground">
        This action cannot be undone.
      </p>
      <div class="flex justify-end gap-2">
        <Button variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          data-testid="delete-btn"
          variant="destructive"
          onClick={handleDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
};
