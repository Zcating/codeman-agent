//! workspace-rename-dialog.tsx — Sidebar hover → rename modal (calls renameWorkspace)
import { renameWorkspace } from "../stores/chat.store";
import { createSignal, type Component } from "solid-js";
import { Input } from "../../../shared/components/ui/input";
import { Button } from "../../../shared/components/ui/button";
import { Effect, Exit } from "effect";

export interface WorkspaceRenameDialogProps {
  workspaceId: string;
  initialLabel: string;
  open: boolean;
  onClose: () => void;
}

export const WorkspaceRenameDialog: Component<WorkspaceRenameDialogProps> = (props) => {
  const [label, setLabel] = createSignal(props.initialLabel);

  const handleSubmit = async () => {
    if (label() === props.initialLabel) {
      props.onClose();
      return;
    }
    const result = await Effect.runPromiseExit(
      renameWorkspace(props.workspaceId, label())
    );
    if (Exit.isSuccess(result)) {
      props.onClose();
    }
    // onFailure: dialog stays open, error shown (caller may show toast)
  };

  return (
    <div data-testid="rename-dialog" class="space-y-4 p-4">
      <div class="space-y-2">
        <Input
          data-testid="rename-input"
          value={label()}
          onInput={(e) => setLabel(e.currentTarget.value)}
          placeholder="Workspace name"
          autofocus
        />
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <Button data-testid="rename-submit" onClick={handleSubmit}>
          Rename
        </Button>
      </div>
    </div>
  );
};
