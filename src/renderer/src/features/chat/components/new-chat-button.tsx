
import type { JSX } from "solid-js";
import { Plus } from "lucide-solid";
import { Button } from "@codeman-frontend/shared/components/ui/button";

export interface NewChatButtonProps {
  onClick: () => void;
}

export function NewChatButton(props: NewChatButtonProps): JSX.Element {
  return (
    <Button type="button" class="w-full" onClick={props.onClick} aria-label="新对话">
      <Plus aria-hidden="true" />
      新对话
    </Button>
  );
}
