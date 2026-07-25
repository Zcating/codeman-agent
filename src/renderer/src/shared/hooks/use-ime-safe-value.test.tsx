import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { useImeSafeValue } from "./use-ime-safe-value";

describe("useImeSafeValue", () => {
  it("普通 keystroke 直接触发 onValueChange", () => {
    const onValueChange = vi.fn();
    function Test() {
      const ime = useImeSafeValue({ value: "", onValueChange });
      return <input data-testid="input" value="" onInput={ime.onInput} />;
    }
    const { getByTestId } = render(() => <Test />);
    const input = getByTestId("input") as HTMLInputElement;
    input.value = "a";
    fireEvent.input(input);
    expect(onValueChange).toHaveBeenCalledWith("a");
  });

  it("IME composition 期间 onInput 不触发 onValueChange", () => {
    const onValueChange = vi.fn();
    function Test() {
      const ime = useImeSafeValue({ value: "", onValueChange });
      return (
        <input
          data-testid="input"
          value=""
          onCompositionStart={ime.onCompositionStart}
          onCompositionEnd={ime.onCompositionEnd}
          onInput={ime.onInput}
        />
      );
    }
    const { getByTestId } = render(() => <Test />);
    const input = getByTestId("input") as HTMLInputElement;

    input.value = "ni";
    fireEvent.compositionStart(input);
    input.value = "你";
    fireEvent.input(input);
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    expect(onValueChange).toHaveBeenCalledWith("你");
  });

});
