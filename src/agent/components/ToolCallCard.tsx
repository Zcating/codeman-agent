//! ToolCallCard — single tool invocation card.
//!
//! States: running (no result yet), success (result, no error), error (result with error).
//! Pure UI. No effect imports.

import { Show } from "solid-js";
import type { ToolCall, ToolResult } from "../../lib/types";

type Status = "running" | "success" | "error";

export function ToolCallCard(props: {
  toolCall: ToolCall;
  result?: ToolResult;
}) {
  const status = (): Status => {
    if (!props.result) return "running";
    return props.result.error ? "error" : "success";
  };

  return (
    <div
      classList={{
        "tool-card": true,
        "tool-card--running": status() === "running",
        "tool-card--success": status() === "success",
        "tool-card--error": status() === "error",
      }}
    >
      <div class="tool-card__header">
        <span class="tool-card__icon" aria-hidden="true">
          {status() === "running" ? "⏳" : status() === "success" ? "✓" : "✗"}
        </span>
        <code class="tool-card__name">{props.toolCall.name}</code>
        <code class="tool-card__id">{props.toolCall.id}</code>
      </div>
      <details class="tool-card__args" open={status() === "error"}>
        <summary>Arguments</summary>
        <pre>{JSON.stringify(props.toolCall.args, null, 2)}</pre>
      </details>
      <Show when={props.result}>
        <details class="tool-card__result" open>
          <summary>Result</summary>
          <pre>{JSON.stringify(props.result!.result, null, 2)}</pre>
          <Show when={props.result!.error}>
            <div class="tool-card__error">{props.result!.error}</div>
          </Show>
        </details>
      </Show>
    </div>
  );
}