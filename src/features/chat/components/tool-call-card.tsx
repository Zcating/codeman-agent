//! ToolCallCard — 单个工具调用卡片。
//!
//! 状态：running（尚无结果）、success（有结果无错误）、error（有错误的结果）。
//! 纯 UI。不导入 effect。
//! Polish C3: 中文 labels (参数 / 结果) + 走 shadcn 语义 token。

import { Show } from "solid-js";
import type { ToolCall, ToolResult } from "../../../shared/lib/types";

type Status = "running" | "success" | "error";

export function ToolCallCard(props: { toolCall: ToolCall; result?: ToolResult }) {
  const status = (): Status => {
    if (!props.result) return "running";
    return props.result.error ? "error" : "success";
  };

  const outerClass = () => {
    const s = status();
    // Polish: 严格遵守 "border + shadow 不同现",只 border 不用 shadow。
    const base = "p-3 border rounded-lg space-y-2 mb-2";
    if (s === "running") return `${base} border-border bg-card`;
    if (s === "success") return `${base} border-success/40 bg-success/5`;
    return `${base} border-destructive/40 bg-destructive/5`;
  };

  const iconClass = () => {
    const s = status();
    if (s === "running") return "text-muted-foreground";
    if (s === "success") return "text-success";
    return "text-destructive";
  };

  return (
    <div class={outerClass()}>
      <div class="flex items-center gap-2 flex-wrap">
        <span class={iconClass()} aria-hidden="true">
          {status() === "running" ? "⏳" : status() === "success" ? "✓" : "✗"}
        </span>
        <code class="text-sm font-mono font-semibold text-foreground">{props.toolCall.name}</code>
        <code class="text-xs text-muted-foreground font-mono ml-auto">{props.toolCall.id}</code>
      </div>
      <details class="text-sm border-t border-border pt-2 mt-2" open={status() === "error"}>
        <summary class="cursor-pointer hover:text-primary font-medium select-none py-1">
          参数
        </summary>
        <pre class="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-border">
          {JSON.stringify(props.toolCall.args, null, 2)}
        </pre>
      </details>
      <Show when={props.result}>
        <details class="text-sm border-t border-border pt-2 mt-2" open>
          <summary class="cursor-pointer hover:text-primary font-medium select-none py-1">
            结果
          </summary>
          <pre class="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-border">
            {JSON.stringify(props.result!.result, null, 2)}
          </pre>
          <Show when={props.result!.error}>
            <div class="mt-2 p-2 bg-destructive/10 text-destructive rounded text-sm border border-destructive/30">
              {props.result!.error}
            </div>
          </Show>
        </details>
      </Show>
    </div>
  );
}
