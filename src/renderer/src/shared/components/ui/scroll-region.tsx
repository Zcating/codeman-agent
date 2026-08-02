
// ScrollRegion — 主栏唯一滚动容器的布局原语 (per ADR-0039)。
//
// 持有滚动区契约的全部知识：class 三件套（flex-1 min-h-0 overflow-y-auto）+
// data-scroll-region 身份标记。主内容 wrapper（codeman-sidebar.tsx）与
// ChatView 消息区（chat-view.tsx）消费同一原语，滚动策略只在一处定义。
// e2e / 单测通过 [data-scroll-region] 断言「恰好一个活动滚动区」不变量。

import { splitProps, type JSX, type ComponentProps } from "solid-js";
import { cn } from "@codeman-frontend/shared/lib/cn";

type ScrollRegionProps = ComponentProps<"div">;

export function ScrollRegion(props: ScrollRegionProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div
      data-scroll-region="true"
      class={cn("flex-1 min-h-0 overflow-y-auto", local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}
