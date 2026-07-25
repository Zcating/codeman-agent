//! codeman-textarea — 跨域应用绑定多行输入框,与 codeman-input.tsx 同源 / 同 IME-safe
//! 行为 / 同 API 约定;唯一区别是内部用 ui/Textarea atom 替代 ui/Input atom。
//!
//! 完整设计文档见 codeman-input.tsx 头。

import { type Component, type ComponentProps, Show, splitProps } from "solid-js";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import { useImeSafeValue } from "../../hooks/use-ime-safe-value";

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
  /** Forward 到 textarea DOM 节点 (用于外部 .focus() 调用)。*/
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
    value: local.value,
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
