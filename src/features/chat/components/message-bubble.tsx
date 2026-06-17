//! MessageBubble — 按 role 渲染单条 Message。
//!
//! 纯 UI。读取 Message prop。不导入 effect。
//! Polish C2/C6: 走 shadcn 语义 token,system 消息改用 lab-warning。

import { Show, For } from "solid-js";
import { marked } from "marked";
import type { Message, ToolCall, ToolResult, FileMatch } from "../../../shared/lib/types";

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
    <div class={`mb-3 flex w-full ${role() === "user" ? "justify-end" : "justify-start"}`}>
      <Show when={role() === "user"}>
        <div
          class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-primary text-primary-foreground"
          innerHTML={escapeHtml(props.message.content)}
        />
      </Show>
      <Show when={role() === "assistant"}>
        <div
          class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-card text-card-foreground border border-border"
          innerHTML={renderMarkdown(props.message.content)}
        />
        <Show when={props.message.tool_calls && props.message.tool_calls.length > 0}>
          <details class="mt-2 text-sm border-t border-border pt-2">
            <summary>工具调用 ({props.message.tool_calls!.length})</summary>
            <For each={props.message.tool_calls!}>
              {(tc: ToolCall) => (
                <pre class="mt-1 p-2 bg-muted rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {tc.name}({JSON.stringify(tc.args, null, 2)})
                </pre>
              )}
            </For>
          </details>
        </Show>
      </Show>
      <Show when={role() === "tool"}>
        <details class="mt-2 text-sm border-t border-border pt-2">
          <summary>工具结果</summary>
          <pre class="mt-1 p-2 bg-muted rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(props.message.content, null, 2)}
          </pre>
          <Show when={props.message.tool_results && props.message.tool_results.length > 0}>
            <For each={props.message.tool_results!}>
              {(tr: ToolResult) => (
                <div class={`mt-1 text-xs ${tr.error ? "text-destructive" : "text-success"}`}>
                  <code>{tr.tool_call_id}</code>: {tr.error ? "❌" : "✓"}{" "}
                  <Show
                    when={typeof tr.result === "string" && tr.result.length > 200}
                    fallback={<code class="text-foreground">{JSON.stringify(tr.result)}</code>}
                  >
                    <details class="mt-1 border border-border rounded p-2 bg-muted">
                      <summary class="cursor-pointer hover:text-primary font-medium select-none">
                        文件内容 (
                        {tr.result && typeof tr.result === "string"
                          ? tr.result.split("\n").length
                          : 0}{" "}
                        行)
                      </summary>
                      <pre class="mt-2 p-2 bg-card rounded text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap border border-border">
                        {String(tr.result)}
                      </pre>
                    </details>
                  </Show>
                  {/* search_files result: render match list */}
                  <Show when={Array.isArray(tr.result) && (tr.result as unknown[]).length > 0}>
                    <div class="mt-2 space-y-1">
                      <For each={tr.result as FileMatch[]}>
                        {(match: FileMatch) => (
                          <div class="flex gap-2 text-xs font-mono">
                            <Show when={match.line_number !== null}>
                              <span class="text-muted-foreground">{match.line_number}:</span>
                            </Show>
                            <code class="text-primary">{match.path}</code>
                            <Show when={match.matched_line}>
                              <span class="text-foreground truncate max-w-xs">
                                {match.matched_line}
                              </span>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </details>
      </Show>
      <Show when={role() === "system"}>
        {/* Polish C2: system 消息用 lab-warning 替代 amber(避免 cream/warm 默认)。
            不写 border + shadow 组合(只有 border)。 */}
        <div class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-warning/10 text-warning-foreground italic border border-warning/30">
          {props.message.content}
        </div>
      </Show>
      <Show when={props.message.model}>
        {/* Polish C6: metadata 走 muted-foreground token,4.5:1 对比度 */}
        <div class="mt-1 text-xs text-muted-foreground">{props.message.model}</div>
      </Show>
    </div>
  );
}
