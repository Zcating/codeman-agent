// Separator — shadcn 风格 Solid 组件。
// 模板：.repos/shadcn/separator.tsx（React 版 → Solid 版，保留 hr + role + data-slot 范式）。

import { splitProps, type JSX } from "solid-js";
import { cn } from "@codeman-frontend/shared/lib/cn";

export interface SeparatorProps extends JSX.HTMLAttributes<HTMLHRElement> {
  /** 方向，默认 horizontal */
  orientation?: "horizontal" | "vertical";
  /** 装饰用（true 时 role="none"，不暴露给无障碍树） */
  decorative?: boolean;
}

export function Separator(props: SeparatorProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "class",
    "orientation",
    "decorative",
  ]);
  const orient = (): "horizontal" | "vertical" => local.orientation ?? "horizontal";
  return (
    <hr
      role={local.decorative ? "none" : "separator"}
      aria-orientation={local.decorative ? undefined : orient()}
      data-slot="separator"
      data-orientation={orient()}
      class={cn(
        "bg-border shrink-0",
        orient() === "horizontal" ? "h-px w-full" : "h-full w-px",
        local.class,
      )}
      {...rest}
    />
  );
}