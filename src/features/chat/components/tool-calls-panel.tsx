//! ToolCallsPanel — assistant bubble 下方挂载的折叠式 tool calls 列表。
//!
//! 从 store.byId[convId].messages 里挑出 messageId 对应的那一条 message，
//! 派生该 message 的 tool_call + tool_result（同一 message 内的 call/result
//! 通过 tool_call_id 配对）。默认折叠为 summary（"工具调用 N · 成功 X ·
//! 错误 Y"），点击展开后按数组顺序列出每条 tool call，每条复用 ToolCallCard
//! （含 name / status / args / result / error）。
//!
//! 纯 UI。不导入 effect。
//! 数据源：chat.store (read-only)。

import { createMemo, createSignal, For, Show } from "solid-js";
import { ChevronDown, ChevronUp } from "lucide-solid";
import { store } from "../stores/chat.store";
import { ToolCallCard } from "./tool-call-card";
import type { Message, ToolCall, ToolResult } from "../../../shared/lib/types";

interface FlatToolCall {
  /** 来源 assistant message 的 created_at（用于时间戳展示） */
  messageCreatedAt: number;
  toolCall: ToolCall;
  /** 同 conv 中匹配的 tool_result；undefined 表示仍在 running */
  result: ToolResult | undefined;
}

/** 把单条 message 平铺成有序的 tool call 列表。 */
function flattenToolCallsFromMessage(m: Message): FlatToolCall[] {
  if (m.role !== "assistant") return [];
  if (!m.tool_calls || m.tool_calls.length === 0) return [];
  const out: FlatToolCall[] = [];
  for (const tc of m.tool_calls) {
    const result = m.tool_results?.find((tr) => tr.tool_call_id === tc.id);
    out.push({
      messageCreatedAt: m.created_at,
      toolCall: tc,
      result,
    });
  }
  return out;
}

/** 格式化 HH:MM:SS，零填充，本地时区 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function ToolCallsPanel(props: { convId: string; messageId: string }) {
  const [expanded, setExpanded] = createSignal(false);

  const items = createMemo<FlatToolCall[]>(() => {
    const cs = store.byId[props.convId];
    if (!cs) return [];
    const m = cs.messages.find((x) => x.id === props.messageId);
    if (!m) return [];
    return flattenToolCallsFromMessage(m);
  });

  const counts = createMemo(() => {
    const list = items();
    let success = 0;
    let error = 0;
    for (const it of list) {
      if (it.result) {
        if (it.result.error) error++;
        else success++;
      }
      // running 项不计入 success/error
    }
    return { total: list.length, success, error };
  });

  return (
    <Show when={counts().total > 0}>
      <div
        class="border-t border-border bg-card"
        data-testid="tool-calls-panel"
        data-expanded={expanded() ? "true" : "false"}
      >
        <button
          type="button"
          class="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:bg-accent/30 transition-colors text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded() ? "true" : "false"}
          aria-controls="tool-calls-list"
          data-testid="tool-calls-panel-toggle"
        >
          <span aria-hidden="true">
            <Show
              when={expanded()}
              fallback={<ChevronDown class="h-3.5 w-3.5" />}
            >
              <ChevronUp class="h-3.5 w-3.5" />
            </Show>
          </span>
          <span class="font-medium text-foreground" data-testid="tool-calls-panel-summary">
            🔧 工具调用 {counts().total}
          </span>
          <Show when={counts().success > 0}>
            <span class="text-success" data-testid="tool-calls-panel-success">
              · 成功 {counts().success}
            </span>
          </Show>
          <Show when={counts().error > 0}>
            <span class="text-destructive" data-testid="tool-calls-panel-error">
              · 错误 {counts().error}
            </span>
          </Show>
          <span class="ml-auto text-muted-foreground">
            {expanded() ? "收起" : "展开"}
          </span>
        </button>
        <Show when={expanded()}>
          <div
            id="tool-calls-list"
            class="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto border-t border-border"
            data-testid="tool-calls-panel-list"
          >
            <For each={items()}>
              {(it) => (
                <div class="pt-2" data-testid="tool-calls-panel-entry">
                  <div class="text-[10px] text-muted-foreground font-mono mb-1">
                    {formatTime(it.messageCreatedAt)}
                  </div>
                  <ToolCallCard toolCall={it.toolCall} result={it.result} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}