
















import { type JSX } from "solid-js";

type ImeSafeElement = HTMLInputElement | HTMLTextAreaElement;

export interface UseImeSafeValueOptions {
  
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
