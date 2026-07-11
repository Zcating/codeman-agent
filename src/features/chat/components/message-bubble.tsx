//! MessageBubble — 按 role 渲染单条 Message。
//!
//! 纯 UI。读取 Message prop。不导入 effect。
//!
//! V3: assistant 渲染重构 — 把 thinking / tool calls / markdown 都装进单个
//! bubble div,而不是把 tool calls 委托给独立的 ToolCallsPanel 挂在下面。
//! 这样 thinking 与 tool execution 的相对顺序在视觉上跟 LLM 输出顺序一致。
//! Polish C2/C6: 走 shadcn 语义 token,system 消息改用 lab-warning。

import { Show, For, createMemo } from "solid-js";
import { marked } from "marked";
import { XCircle, CheckCircle2, Brain } from "lucide-solid";
import { ToolCallCard } from "./tool-call-card";
import type { Message, ToolResult, FileMatch, ToolCall } from "../../../shared/lib/types";
import { store } from "../stores/chat.store";

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
  return marked.parse(s, { async: false }) as string;
}

/** 给定 assistant message 的 thinking 渲染常驻思考区。
 *
 *  - 永远展开,无折叠 (V3.1: 用户反馈"找不到展开入口" → 直接去掉 details/summary)
 *  - 思考文本用 mono font + 灰底,跟代码 / 工具参数视觉一致;不是给终端用户读的
 *  - 但 stream 期间 vs stream 后用不同 label ("思考中…" vs "已思考") 区分状态
 */
function ThinkingSection(props: {
  thinking: string;
  streaming: boolean;
  messageId: string;
}) {
  return (
    <div
      class="mb-2 border border-border/60 rounded-md bg-muted/40 overflow-hidden"
      data-testid="thinking-section"
      data-message-id={props.messageId}
    >
      <div class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <Brain class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{props.streaming ? "思考中…" : "已思考"}</span>
      </div>
      <pre class="px-3 py-2 text-xs font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap border-t border-border/60 max-h-64 overflow-y-auto">
        {props.thinking}
      </pre>
    </div>
  );
}

/** 把 message 内的 tool_calls 与 tool_results 配对,产出 render-ready 列表。
 *
 *  顺序保持 tool_calls 数组顺序,跟 LLM 决策顺序一致。
 *  没匹配的 tool_call result 为 undefined (→ ToolCallCard 走 running 态)。
 */
function pairToolCalls(message: Message): Array<{ toolCall: ToolCall; result: ToolResult | undefined }> {
  if (!message.toolCalls) return [];
  const resultsById = new Map<string, ToolResult>();
  for (const tr of message.toolResults ?? []) {
    resultsById.set(tr.toolCallId, tr);
  }
  return message.toolCalls.map((tc) => ({
    toolCall: tc,
    result: resultsById.get(tc.id),
  }));
}

export function MessageBubble(props: { message: Message }) {
  const role = () => props.message.role;

  // 该 message 是否还在 streaming (用于 ThinkingSection 默认展开 + 决定是否走 stream render)
  const isStreaming = createMemo(() => {
    const cs = store.byId[props.message.conversationId];
    return cs?.streamingMessageId === props.message.id;
  });

  const pairedTools = createMemo(() => pairToolCalls(props.message));
  const hasTools = () => pairedTools().length > 0;
  const hasThinking = () => !!(props.message.thinking && props.message.thinking.length > 0);
  const hasContent = () => !!props.message.content && props.message.content.length > 0;

  return (
    <div class={`mb-3 flex w-full ${role() === "user" ? "justify-end" : "justify-start"}`}>
      <Show when={role() === "user"}>
        <div
          class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-primary text-primary-foreground"
          innerHTML={escapeHtml(props.message.content)}
        />
      </Show>
      <Show when={role() === "assistant"}>
        {/* V3: 单个 bubble div 包住 thinking + tool calls + markdown。
            之前这里写的是 sibling div + ToolCallsPanel,在 flex 父容器里两个 flex item
            会 side-by-side 排列 — 视觉 broken。 */}
        <div
          class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-card text-card-foreground border border-border space-y-2"
          data-testid="agent-bubble"
        >
          {/* 1. 思考过程 (仅 assistant + 非空) */}
          <Show when={hasThinking()}>
            <ThinkingSection
              thinking={props.message.thinking ?? ""}
              streaming={isStreaming()}
              messageId={props.message.id}
            />
          </Show>

          {/* 2. 工具调用 (顺序:跟 LLM 决策顺序一致) */}
          <Show when={hasTools()}>
            <div class="space-y-1.5" data-testid="inline-tool-calls">
              <For each={pairedTools()}>
                {(it) => <ToolCallCard toolCall={it.toolCall} result={it.result} />}
              </For>
            </div>
          </Show>

          {/* 3. 正文 Markdown */}
          <Show when={hasContent()}>
            <div
              class="prose prose-sm dark:prose-invert max-w-none"
              data-testid="agent-text-content"
              innerHTML={renderMarkdown(props.message.content)}
            />
          </Show>

          {/* fallback: 三块全空 (e.g. abort 在第一个 token 之前) — 渲染占位 */}
          <Show when={!hasThinking() && !hasTools() && !hasContent()}>
            <div class="text-xs text-muted-foreground italic">(空响应)</div>
          </Show>
        </div>
      </Show>
      <Show when={role() === "tool"}>
        <details class="mt-2 text-sm border-t border-border pt-2">
          <summary>工具结果</summary>
          <pre class="mt-1 p-2 bg-muted rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(props.message.content, null, 2)}
          </pre>
          <Show when={props.message.toolResults && props.message.toolResults.length > 0}>
            <For each={props.message.toolResults!}>
              {(tr: ToolResult) => (
                <div class={`mt-1 text-xs ${tr.error ? "text-destructive" : "text-success"}`}>
                  <code>{tr.toolCallId}</code>: {tr.error ? (
                    <XCircle class="h-3 w-3 inline align-middle text-destructive" aria-label="error" data-testid="tool-error" />
                  ) : (
                    <CheckCircle2 class="h-3 w-3 inline align-middle text-success" aria-label="success" data-testid="tool-success" />
                  )}{" "}
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
                            <Show when={match.lineNumber !== null}>
                              <span class="text-muted-foreground">{match.lineNumber}:</span>
                            </Show>
                            <code class="text-primary">{match.path}</code>
                            <Show when={match.lineContent}>
                              <span class="text-foreground truncate max-w-xs">
                                {match.lineContent}
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
    </div>
  );
}