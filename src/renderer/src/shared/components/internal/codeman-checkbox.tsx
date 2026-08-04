import { type Component, type ComponentProps, splitProps } from "solid-js";
import { Checkbox } from "@codeman-frontend/shared/components/ui/checkbox";

export type CodemanCheckboxProps = Omit<
  ComponentProps<"input">,
  "type" | "checked" | "value" | "onChange" | "onInput"
> & {
  value: boolean;
  onChange: (value: boolean) => void;
};

export const CodemanCheckbox: Component<CodemanCheckboxProps> = (props) => {
  const [local, rest] = splitProps(props, ["value", "onChange"]);

  return (
    <Checkbox
      checked={local.value}
      onChange={(e) => local.onChange(e.currentTarget.checked)}
      {...rest}
    />
  );
};
