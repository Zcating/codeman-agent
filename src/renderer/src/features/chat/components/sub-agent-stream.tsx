import { Show, createMemo, type JSX } from "solid-js";
import { CheckCircle2, XCircle, Loader2 } from "lucide-solid";
import { renderMarkdown } from "@codeman-frontend/features/chat/lib/markdown";
import type { DelegateStreamEntry } from "../stores/delegate-streams.store";

interface SubAgentStreamProps {
  entry: DelegateStreamEntry;
}

export function SubAgentStream(props: SubAgentStreamProps): JSX.Element {
  const statusBadge = createMemo(() => {
    switch (props.entry.status) {
      case "running":
        return (
          <span
            class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
            data-testid="sub-agent-running"
          >
            <Loader2 class="h-3 w-3 animate-spin" data-testid="sub-agent-spinner" aria-hidden="true" />
            Running
          </span>
        );
      case "completed":
        return (
          <span
            class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
            data-testid="sub-agent-completed"
          >
            <CheckCircle2 class="h-3 w-3" aria-hidden="true" />
            Completed
          </span>
        );
      case "error":
        return (
          <span
            class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            data-testid="sub-agent-error"
          >
            <XCircle class="h-3 w-3" aria-hidden="true" />
            Error
          </span>
        );
      default: {
        const _exhaustive: never = props.entry.status;
        return _exhaustive;
      }
    }
  });

  const markdownContent = createMemo(() => {
    if (props.entry.status === "error") {
      return props.entry.error ?? "Unknown error";
    }
    return props.entry.finalText ?? "";
  });

  return (
    <div
      class="flex flex-col h-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-card overflow-hidden"
      data-testid={`sub-agent-stream-${props.entry.toolCallId}`}
    >
      {/* Header */}
      <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <span class="text-sm font-medium text-foreground truncate">
          {props.entry.agentName}
        </span>
        {statusBadge()}
      </div>

      {/* Content */}
      <div class="flex-1 p-3 overflow-auto">
        <Show
          when={markdownContent()}
          fallback={
            <div class="flex items-center justify-center h-full">
              <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <div
            class="typeset typeset-chat text-sm"
            data-testid="sub-agent-content"
            innerHTML={renderMarkdown(markdownContent())}
          />
        </Show>
      </div>
    </div>
  );
}
