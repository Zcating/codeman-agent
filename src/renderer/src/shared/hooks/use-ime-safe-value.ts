import { type JSX } from "solid-js";

type ImeSafeElement = HTMLInputElement | HTMLTextAreaElement;

export interface UseImeSafeValueOptions {
  value: string | undefined;
  onValueChange: (value: string) => void;
}

export interface UseImeSafeValueReturn {
  value: () => string;
  onCompositionStart: JSX.EventHandlerUnion<ImeSafeElement, CompositionEvent>;
  onCompositionEnd: JSX.EventHandlerUnion<ImeSafeElement, CompositionEvent>;
  onInput: JSX.EventHandlerUnion<ImeSafeElement, InputEvent>;
}

export function useImeSafeValue(
  options: UseImeSafeValueOptions,
): UseImeSafeValueReturn {
  const { value, onValueChange } = options;
  let composing = false;

  return {
    value: () => value ?? "",
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
