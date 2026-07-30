


import type { JSX } from "solid-js";
import { Plus } from "lucide-solid";

export interface NewChatButtonProps {
  onClick: () => void;
}

export function NewChatButton(props: NewChatButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="flex h-8 w-full items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      onClick={props.onClick}
      aria-label="新对话"
    >
      <Plus class="h-4 w-4" aria-hidden="true" />
      新对话
    </button>
  );
}
