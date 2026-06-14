//! ToolCallCard — 单个工具调用卡片。
//!
//! 状态：running（尚无结果）、success（有结果无错误）、error（有错误的结果）。
//! 纯 UI。不导入 effect。

import { Show } from "solid-js";
import type { ToolCall, ToolResult } from "../../../shared/types";

type Status = "running" | "success" | "error";

export function ToolCallCard(props: {
  toolCall: ToolCall;
  result?: ToolResult;
}) {
  const status = (): Status => {
    if (!props.result) return "running";
    return props.result.error ? "error" : "success";
  };

  const outerClass = () => {
    const s = status();
    const base =
      "p-3 border rounded-lg space-y-2 mb-2";
    if (s === "running") return `${base} border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800`;
    if (s === "success") return `${base} border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20`;
    return `${base} border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20`;
  };

  const iconClass = () => {
    const s = status();
    if (s === "running") return "text-zinc-500 dark:text-zinc-400";
    if (s === "success") return "text-green-600 dark:text-green-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div class={outerClass()}>
      <div class="flex items-center gap-2 flex-wrap">
        <span class={iconClass()} aria-hidden="true">
          {status() === "running" ? "⏳" : status() === "success" ? "✓" : "✗"}
        </span>
        <code class="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
          {props.toolCall.name}
        </code>
        <code class="text-xs text-zinc-500 dark:text-zinc-400 font-mono ml-auto">
          {props.toolCall.id}
        </code>
      </div>
      <details class="text-sm border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2" open={status() === "error"}>
        <summary class="cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 font-medium select-none py-1">
          Arguments
        </summary>
        <pre class="mt-2 p-2 bg-zinc-50 dark:bg-zinc-900 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-700">
          {JSON.stringify(props.toolCall.args, null, 2)}
        </pre>
      </details>
      <Show when={props.result}>
        <details class="text-sm border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2" open>
          <summary class="cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 font-medium select-none py-1">
            Result
          </summary>
          <pre class="mt-2 p-2 bg-zinc-50 dark:bg-zinc-900 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-700">
            {JSON.stringify(props.result!.result, null, 2)}
          </pre>
          <Show when={props.result!.error}>
            <div class="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm border border-red-200 dark:border-red-800">
              {props.result!.error}
            </div>
          </Show>
        </details>
      </Show>
    </div>
  );
}
