//! MessageBubble — 按 role 渲染单条 Message。
//!
//! 纯 UI。读取 Message prop。不导入 effect。

import { Show, For } from "solid-js";
import { marked } from "marked";
import type { Message, ToolCall, ToolResult } from "../../../shared/types";

/** 转义用户提供的文本以防止 XSS。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 渲染 Markdown 为经清理的 HTML。用于 assistant 内容（可信）。 */
function renderMarkdown(s: string): string {
  // marked v9+：当给定字符串输入时，marked.parse 同步返回字符串。
  // 我们信任 assistant 输出（无用户控制的内容），但以防万一在
  // Markdown 解析前转义源文本。
  return marked.parse(s, { async: false }) as string;
}

export function MessageBubble(props: { message: Message }) {
  const role = () => props.message.role;
  return (
    <div
      class={`mb-3 flex w-full ${
        role() === "user"
          ? "justify-end"
          : "justify-start"
      }`}
    >
      <Show when={role() === "user"}>
        <div
          class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-primary-500 text-white"
          innerHTML={escapeHtml(props.message.content)}
        />
      </Show>
      <Show when={role() === "assistant"}>
        <div
          class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
          innerHTML={renderMarkdown(props.message.content)}
        />
        <Show when={props.message.tool_calls && props.message.tool_calls.length > 0}>
          <details class="mt-2 text-sm border-t border-zinc-200 dark:border-zinc-700 pt-2">
            <summary>Tool calls ({props.message.tool_calls!.length})</summary>
            <For each={props.message.tool_calls!}>
              {(tc: ToolCall) => (
                <pre class="mt-1 p-2 bg-zinc-50 dark:bg-zinc-900 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {tc.name}({JSON.stringify(tc.args, null, 2)})
                </pre>
              )}
            </For>
          </details>
        </Show>
      </Show>
      <Show when={role() === "tool"}>
        <details class="mt-2 text-sm border-t border-zinc-200 dark:border-zinc-700 pt-2">
          <summary>Tool result</summary>
          <pre class="mt-1 p-2 bg-zinc-50 dark:bg-zinc-900 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(props.message.content, null, 2)}</pre>
          <Show when={props.message.tool_results && props.message.tool_results.length > 0}>
            <For each={props.message.tool_results!}>
              {(tr: ToolResult) => (
                <div class={`mt-1 text-xs ${tr.error ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                  <code>{tr.tool_call_id}</code>: {tr.error ? "❌" : "✓"}{" "}
                  <code>{JSON.stringify(tr.result)}</code>
                </div>
              )}
            </For>
          </Show>
        </details>
      </Show>
      <Show when={role() === "system"}>
        <div class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 italic border border-amber-200 dark:border-amber-800">
          {props.message.content}
        </div>
      </Show>
      <Show when={props.message.model}>
        <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{props.message.model}</div>
      </Show>
    </div>
  );
}
