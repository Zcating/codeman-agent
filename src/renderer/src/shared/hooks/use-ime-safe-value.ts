//! use-ime-safe-value — shared IME-safe controlled value hook.
//!
//! 中文/日文 IME 输入时,手写 `value={x()} onInput={setX}` 会反复触发响应
//! 绑定把 `el.value = ...` 重写,打断 IME 内部状态机,表现为"逐字母失焦"。
//!
//! 本 hook 抽象出 IME-safe 模式:composition 期间 onInput 短路,compositionend
//! 一次性同步 DOM 值到 onValueChange。
//!
//! 适用:单行 / 多行 input、textarea、contenteditable.
//! CodemanInput / CodemanTextarea 内部消费本 hook;任何新 IME-safe 控件
//! 可复用同一 hook。
//!
//! 注意:hook 不接管 value getter. value 由调用方直接绑定 (e.g. `value={local.value ?? ""}`),
//! 这样保留 SolidJS 响应式追踪的直接依赖,避免通过 wrapper getter 的额外开销.
//!
//! 跨域 composable (V1 首批 hook, AGENTS.md hooks/ 子目录启用).

import { type JSX } from "solid-js";

type ImeSafeElement = HTMLInputElement | HTMLTextAreaElement;

export interface UseImeSafeValueOptions {
  /** 当前 controlled value. undefined 等同于空字符串. */
  value: string | undefined;
  /** value 变化的回调。已经在 IME 安全窗口内聚合:用户最终 commit 字符 (中文 commit 后整字),不是拼音字母. */
  onValueChange: (value: string) => void;
}

export interface UseImeSafeValueReturn {
  onCompositionStart: JSX.EventHandlerUnion<ImeSafeElement, CompositionEvent>;
  onCompositionEnd: JSX.EventHandlerUnion<ImeSafeElement, CompositionEvent>;
  onInput: JSX.EventHandlerUnion<ImeSafeElement, InputEvent>;
}

export function useImeSafeValue(
  options: UseImeSafeValueOptions,
): UseImeSafeValueReturn {
  const { onValueChange } = options;

  // IME composition 旗标:composition 期间 onInput 不写 signal,保留浏览器 IME 状态.
  let composing = false;

  return {
    onCompositionStart: () => {
      composing = true;
    },
    onCompositionEnd: (e) => {
      composing = false;
      onValueChange(e.currentTarget.value);
    },
    onInput: (e) => {
      if (!composing) {
        onValueChange(e.currentTarget.value);
      }
    },
  };
}
