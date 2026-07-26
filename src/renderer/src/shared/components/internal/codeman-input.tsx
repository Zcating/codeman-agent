//! codeman-input — 跨域应用绑定 (codeman-* namespace, ADR-0023 D4-N) 单行输入框。
//!
//! 内部复用 ui/Input atom 渲染真正的 <input>,本组件负责:
//!   1. controlled value (skip 响应绑定)
//!   2. IME-safe onValueChange (中文拼音等 composition)
//!   3. label / helperText / error 排版
//!   4. aria-invalid (HTML 原生属性)
//!
//! 与 codeman-textarea 互为兄弟:CodemanInput 单行,后者多行;共享同一份 controlled value
//! + IME-safe onValueChange + label/helperText/error 语义。
//!
//! ## 选址
//!
//! 遵循 ADR-0023 D4-N 命名:跨域应用绑定组件 (跨 feature 共享但绑定本应用业务 + 内部分层组合,
//! 比如本组件组合了 ui/Input atom) 全部归 `src/shared/components/internal/codeman-*.tsx`,
//! ui/ 只放纯 design system atom。CodemanInput 此前错误地放在 ui/,本次迁移至 internal/。
//!
//! ## IME (中文拼音) composition 安全
//!
//! Bug Fix regression 2026-07:在 chat 域调通 Codeman-Input / Codeman-Textarea 之前,
//! chat-view.tsx / home.tsx / workspace-rename-dialog.tsx 三处手写 `value={input()}` 的
//! 响应绑定在中文拼音 IME 用户输入时会反复执行 `el.value = ...` 打断 IME 内部状态机,
//! 表现为"逐字母失焦"。Codeman-Input/Textarea 把 composition 期间 onInput 短路、
//! compositionend 一次性刷值的标准模式沉淀进组件,新代码即使忘记也安全。
//!
//! ```tsx
//! // 内部伪代码:
//! let composing = false;
//! onCompositionStart: () => { composing = true; }
//! onCompositionEnd:   (e) => { composing = false; onValueChange(e.currentTarget.value); }
//! onInput:            (e) => { if (!composing) onValueChange(e.currentTarget.value); }
//! ```

import { type Component, type ComponentProps, Show, splitProps } from "solid-js";
import { Input } from "@codeman-frontend/shared/components/ui/input";
import { cn } from "@codeman-frontend/shared/lib/cn";
import { useImeSafeValue } from "@codeman-frontend/shared/hooks/use-ime-safe-value";

export type CodemanInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "onInput"
> & {
  /** 显示在 input 上方的字段标签。文本组件,不是 string。*/
  label?: import("solid-js").JSX.Element;
  /** 非错误状态下的辅助说明文本(密码强度、字符限制等)。*/
  helperText?: import("solid-js").JSX.Element;
  /** 错误提示。当设置时:`aria-invalid="true"` 写入 input,ErrorText 取代 HelperText。*/
  error?: import("solid-js").JSX.Element;
  /** 受控值;undefined 等同于空字符串,IME 完成后一次性同步。*/
  value: string | undefined;
  /** value 变化的回调 — 已经在 IME 安全窗口内聚合,
   * 所以调用方拿到的 value 是用户最终 commit 的字符 (中文 commit 后整字),
   * 而不是拼音字母。 */
  onValueChange: (value: string) => void;
  /** 是否必填。*/
  required?: boolean;
  /** outer wrapper 的额外 class (默认 `space-y-1.5`)。全宽:传 `class="w-full"`。*/
  class?: string;
  /** input 元素的额外 class (透传到 ui/Input 的内部 `<input>`)。*/
  inputClass?: string;
  /** Forward 到 input DOM 节点 (用于外部 .focus() 调用)。*/
  ref?: HTMLInputElement | ((el: HTMLInputElement) => void);
};

export const CodemanInput: Component<CodemanInputProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "label",
    "helperText",
    "error",
    "required",
    "disabled",
    "value",
    "onValueChange",
    "type",
    "class",
    "inputClass",
    "ref",
  ]);

  const ime = useImeSafeValue({
    onValueChange: local.onValueChange,
  });

  return (
    <div class={cn("space-y-1.5", local.class)} data-codeman-input>
      <Show when={local.label}>
        <label class="text-sm font-medium">{local.label}</label>
      </Show>
      <Input
        type={local.type ?? "text"}
        value={local.value ?? ""}
        class={cn("h-10", local.inputClass)}
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
