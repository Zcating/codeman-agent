
import { Show, For, createMemo } from "solid-js";
import { XCircle, CheckCircle2 } from "lucide-solid";
import { ToolCallPanel } from "@codeman-frontend/features/chat/components/tool-call-panel";
import { ThinkingPanel } from "@codeman-frontend/features/chat/components/thinking-panel";
import type { Message, ToolResult, FileMatch, ToolCall } from "@codeman-frontend/shared/lib/types";
import { store } from "@codeman-frontend/features/chat/stores/chat.store";
import { renderMarkdown } from "@codeman-frontend/features/chat/lib/markdown";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pairToolCalls(message: Message): Array<{ toolCall: ToolCall; result: ToolResult | undefined }> {
  if (!message.toolCalls) {return [];}
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
        <div
          class="w-full p-3 leading-relaxed break-words text-foreground space-y-2"
          data-testid="agent-bubble"
        >
          <Show when={hasThinking()}>
            <ThinkingPanel
              thinking={props.message.thinking ?? ""}
              streaming={isStreaming()}
              messageId={props.message.id}
            />
          </Show>

          <Show when={hasTools()}>
            <div class="space-y-1.5" data-testid="inline-tool-calls">
              <For each={pairedTools()}>
                {(it) => (
                  <ToolCallPanel
                    toolCall={it.toolCall}
                    result={it.result}
                    messageId={props.message.id}
                  />
                )}
              </For>
            </div>
          </Show>

          <Show when={hasContent()}>
            <div
              class="typeset typeset-chat"
              data-testid="agent-text-content"
              innerHTML={renderMarkdown(props.message.content)}
            />
          </Show>

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
        <div class="max-w-prose p-3 rounded-lg leading-relaxed break-words bg-warning/10 text-warning-foreground italic border border-warning/30">
          {props.message.content}
        </div>
      </Show>
    </div>
  );
}