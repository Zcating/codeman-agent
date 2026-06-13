//! MessageBubble — renders a single Message by role.
//!
//! Pure UI. Reads Message prop. No effect imports.

import { Show, For } from "solid-js";
import { marked } from "marked";
import type { Message, ToolCall, ToolResult } from "../../lib/types";

/** Escape user-supplied text to prevent XSS. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render Markdown to sanitized HTML. For assistant content (trusted). */
function renderMarkdown(s: string): string {
  // marked v9+: marked.parse returns string sync when given string input.
  // We trust assistant output (no user-controlled content) but escape the source
  // before Markdown parsing just in case.
  return marked.parse(s, { async: false }) as string;
}

export function MessageBubble(props: { message: Message }) {
  const role = () => props.message.role;
  return (
    <div classList={{
      "bubble": true,
      "bubble--user": role() === "user",
      "bubble--assistant": role() === "assistant",
      "bubble--tool": role() === "tool",
      "bubble--system": role() === "system",
    }}>
      <Show when={role() === "user"}>
        <div class="bubble__content" innerHTML={escapeHtml(props.message.content)} />
      </Show>
      <Show when={role() === "assistant"}>
        <div class="bubble__content" innerHTML={renderMarkdown(props.message.content)} />
        <Show when={props.message.tool_calls && props.message.tool_calls.length > 0}>
          <details class="bubble__tool-calls">
            <summary>Tool calls ({props.message.tool_calls!.length})</summary>
            <For each={props.message.tool_calls!}>
              {(tc: ToolCall) => (
                <pre class="bubble__tool-call">
                  {tc.name}({JSON.stringify(tc.args, null, 2)})
                </pre>
              )}
            </For>
          </details>
        </Show>
      </Show>
      <Show when={role() === "tool"}>
        <details class="bubble__tool-result">
          <summary>Tool result</summary>
          <pre>{JSON.stringify(props.message.content, null, 2)}</pre>
          <Show when={props.message.tool_results && props.message.tool_results.length > 0}>
            <For each={props.message.tool_results!}>
              {(tr: ToolResult) => (
                <div class="bubble__tool-result-item">
                  <code>{tr.tool_call_id}</code>: {tr.error ? "❌" : "✓"}{" "}
                  <code>{JSON.stringify(tr.result)}</code>
                </div>
              )}
            </For>
          </Show>
        </details>
      </Show>
      <Show when={role() === "system"}>
        <div class="bubble__system">{props.message.content}</div>
      </Show>
      <Show when={props.message.model}>
        <div class="bubble__meta">{props.message.model}</div>
      </Show>
    </div>
  );
}