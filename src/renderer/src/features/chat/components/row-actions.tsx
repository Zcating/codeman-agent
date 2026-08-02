
import { createSignal, Show, type JSX } from "solid-js";
import { Loader2, Pencil, Trash2 } from "lucide-solid";

export interface RowActionsProps {
  kind: "workspace" | "conv";
  id: string;
  label: string;
  isStreaming?: boolean;
  onDelete: (id: string) => void | Promise<void>;
  onRename: (id: string, newLabel: string) => void | Promise<void>;
}

type Mode = "idle" | "confirming-delete" | "editing";

export function RowActions(props: RowActionsProps): JSX.Element {
  const [mode, setMode] = createSignal<Mode>("idle");

  const isConfirming = () => mode() === "confirming-delete";
  const isEditing = () => mode() === "editing";

  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    setMode("confirming-delete");
  };

  const handleConfirmDelete = (e: MouseEvent) => {
    e.stopPropagation();
    setMode("idle");
    props.onDelete(props.id);
  };

  const handleCancelDelete = (e: MouseEvent) => {
    e.stopPropagation();
    setMode("idle");
  };

  const handleRenameClick = (e: MouseEvent) => {
    e.stopPropagation();
    setMode("editing");
  };

  const deleteAriaLabel = () =>
    props.kind === "workspace" ? `Delete ${props.label}` : "Delete conversation";

  const renameAriaLabel = () => `Rename ${props.label}`;

  return (
    <>
      {}
      {}
      <div
        class="flex flex-1 self-center items-center gap-2 min-w-0"
        classList={{
          "invisible": isConfirming(),
        }}
      >
        <Show when={props.kind === "conv" && props.isStreaming}>
          <Loader2
            class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-label="streaming"
          />
        </Show>
        {}
        <Show when={!isEditing()}>
          <span class="truncate flex-1 text-sm">{props.label}</span>
        </Show>

        {}
        <Show when={!isEditing()}>
          <button
            type="button"
            class="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-opacity"
            onClick={handleRenameClick}
            aria-label={renameAriaLabel()}
          >
            <Pencil class="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-sidebar-accent hover:text-destructive outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-opacity"
            onClick={handleDeleteClick}
            aria-label={deleteAriaLabel()}
          >
            <Trash2 class="h-3 w-3" aria-hidden="true" />
          </button>
        </Show>

        {}
        <Show when={isEditing()}>
          <InlineRenameInput
            initialLabel={props.label}
            onSave={(newLabel) => {
              setMode("idle");
              props.onRename(props.id, newLabel);
            }}
            onCancel={() => setMode("idle")}
          />
        </Show>
      </div>

      {}
      <Show when={isConfirming()}>
        <div
          data-state="confirming"
          class="absolute inset-0 z-10 flex items-center justify-end gap-1 rounded-md bg-sidebar pr-2"
        >
          <button
            type="button"
            class="h-7 px-2 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            onClick={handleConfirmDelete}
            aria-label="确认删除"
          >
            删除
          </button>
          <button
            type="button"
            class="h-7 px-2 text-xs rounded-md border border-input hover:bg-accent"
            onClick={handleCancelDelete}
            aria-label="取消删除"
          >
            取消
          </button>
        </div>
      </Show>
    </>
  );
}

interface InlineRenameInputProps {
  initialLabel: string;
  onSave: (newLabel: string) => void;
  onCancel: () => void;
}

function InlineRenameInput(props: InlineRenameInputProps): JSX.Element {
  const [value, setValue] = createSignal(props.initialLabel);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value().trim();
      if (trimmed !== "") {
        props.onSave(trimmed);
      } else {
        props.onCancel();
      }
    } else if (e.key === "Escape") {
      props.onCancel();
    }
  };

  const handleBlur = () => {
    props.onCancel();
  };

  const handleInputRef = (el: HTMLInputElement) => {
    el.focus();
    el.setSelectionRange(0, el.value.length);
    el.dispatchEvent(new Event("focus", { bubbles: true }));
  };

  return (
    <input
      ref={handleInputRef}
      type="text"
      class="flex-1 truncate text-sm bg-transparent outline-none focus:ring-2 focus:ring-sidebar-ring rounded-md px-1"
      aria-label="Rename input"
      maxLength={80}
      value={value()}
      onInput={(e) => setValue(e.currentTarget.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
