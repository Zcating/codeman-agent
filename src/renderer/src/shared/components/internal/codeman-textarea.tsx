
import { type Component, type ComponentProps, Show, splitProps } from "solid-js";
import { Textarea } from "@codeman-frontend/shared/components/ui/textarea";
import { cn } from "@codeman-frontend/shared/lib/cn";
import { useImeSafeValue } from "@codeman-frontend/shared/hooks/use-ime-safe-value";

export type CodemanTextareaProps = Omit<
  ComponentProps<"textarea">,
  "value" | "onChange" | "onInput"
> & {
  label?: import("solid-js").JSX.Element;
  helperText?: import("solid-js").JSX.Element;
  error?: import("solid-js").JSX.Element;
  value: string | undefined;
  onValueChange: (value: string) => void;
  required?: boolean;
  class?: string;
  textareaClass?: string;
  ref?: HTMLTextAreaElement | ((el: HTMLTextAreaElement) => void);
};

export const CodemanTextarea: Component<CodemanTextareaProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "label",
    "helperText",
    "error",
    "required",
    "disabled",
    "value",
    "onValueChange",
    "rows",
    "class",
    "textareaClass",
    "ref",
  ]);

  const ime = useImeSafeValue({
    onValueChange: local.onValueChange,
  });

  return (
    <div class={cn("space-y-1.5", local.class)} data-codeman-textarea>
      <Show when={local.label}>
        <label class="text-sm font-medium">{local.label}</label>
      </Show>
      <Textarea
        rows={local.rows}
        value={local.value ?? ""}
        class={local.textareaClass}
        ref={local.ref}
        aria-invalid={local.error ? true : undefined}
        disabled={local.disabled}
        required={local.required}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        onInput={ime.onInput}
        {...rest}
      />
      <Show
        when={local.error}
        fallback={
          <Show when={local.helperText}>
            <p class="text-xs text-muted-foreground">{local.helperText}</p>
          </Show>
        }
      >
        <p class="text-xs text-destructive">{local.error}</p>
      </Show>
    </div>
  );
};
