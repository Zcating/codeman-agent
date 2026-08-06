import { createSignal, Show, type JSX } from "solid-js";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-solid";
import { Input } from "@codeman-frontend/shared/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@codeman-frontend/shared/components/ui/dropdown-menu";
import { Dialog } from "@codeman-frontend/shared/components/internal/codeman-dialog";

export interface RowActionsProps {
  kind: "workspace" | "conv";
  id: string;
  label: string;
  isAgentActive?: boolean;
  onDelete: (id: string) => void | Promise<void>;
  onRename: (id: string, newLabel: string) => void | Promise<void>;
}

type Mode = "idle" | "editing";

export function RowActions(props: RowActionsProps): JSX.Element {
  const [mode, setMode] = createSignal<Mode>("idle");

  const isEditing = () => mode() === "editing";

  const handleRenameClick = () => {
    setMode("editing");
  };

  const handleDeleteClick = async () => {
    const confirmed = await Dialog.confirm({
      title: props.kind === "workspace" ? "删除项目" : "删除对话",
      content: `确定要删除「${props.label}」吗？此操作不可撤销。`,
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (confirmed) {
      await props.onDelete(props.id);
    }
  };

  // 菜单浮层位于行 DOM 内部（绝对定位），点击菜单项会冒泡到行并触发
  // 行选中/导航，这里在浮层上截断冒泡，保证菜单操作不影响行点击。
  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div class="flex flex-1 self-center items-center gap-2 min-w-0">
      <Show when={props.kind === "conv" && props.isAgentActive}>
        <Loader2
          class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-label="streaming"
        />
      </Show>

      <Show when={!isEditing()}>
        <span class="truncate flex-1 text-sm">{props.label}</span>
      </Show>

      <Show when={!isEditing()}>
        <DropdownMenu positioning={{ placement: "bottom-end" }}>
          <DropdownMenuTrigger
            class="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 aria-expanded:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-opacity"
            aria-label="更多操作"
            onClick={stopPropagation}
          >
            <MoreHorizontal class="h-3.5 w-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent onClick={stopPropagation} onPointerDown={stopPropagation}>
            <DropdownMenuItem
              value="rename"
              data-testid="row-action-rename"
              onSelect={handleRenameClick}
            >
              <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem
              value="delete"
              variant="destructive"
              data-testid="row-action-delete"
              onSelect={() => { void handleDeleteClick(); }}
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>

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
    // Defer focus + select to a microtask so the click event that entered
    // editing mode finishes propagating first. Calling focus() synchronously
    // races against the click handler's default focus restoration, which in
    // real browsers leaves the input unfocused and forces a second click.
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(0, el.value.length);
      el.dispatchEvent(new Event("focus", { bubbles: true }));
    });
  };

  return (
    <Input
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
