
import { Show, type Component } from "solid-js";
import {
  FileText,
  FilePlus,
  FileEdit,
  FileSearch,
  FileX,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-solid";
import type { ToolCall, ToolResult } from "@codeman-frontend/shared/lib/types";

type Status = "running" | "success" | "error";

const TOOL_ICONS: Record<string, Component<{ class?: string }>> = {
  read_file: FileText,
  write_file: FilePlus,
  edit_file: FileEdit,
  search_files: FileSearch,
  delete_file: FileX,
};

export function ToolCallCard(props: { toolCall: ToolCall; result?: ToolResult }) {
  const status = (): Status => {
    if (!props.result) {
      return "running";
    }
    return props.result.error ? "error" : "success";
  };

  const outerClass = () => {
    const s = status();
    const base = "p-3 border rounded-lg space-y-2 mb-2";
    if (s === "running") {
      return `${base} border-border bg-card`;
    }
    if (s === "success") {
      return `${base} border-success/40 bg-success/5`;
    }
    return `${base} border-destructive/40 bg-destructive/5`;
  };

  const StatusIcon = () => {
    const s = status();
    if (s === "running") {
      return <Loader2 class="h-4 w-4 animate-spin" aria-label="running" data-testid="icon-running" />;
    }
    if (s === "success") {
      return <CheckCircle2 class="h-4 w-4 text-success" aria-label="success" data-testid="icon-success" />;
    }
    return <XCircle class="h-4 w-4 text-destructive" aria-label="error" data-testid="icon-error" />;
  };

  const Icon = () => {
    const ToolIcon = TOOL_ICONS[props.toolCall.name] ?? Wrench;
    return <ToolIcon class="h-4 w-4" />;
  };

  const pathLabel = () => {
    if (props.toolCall.name === "read_file" && props.toolCall.args.path) {
      return String(props.toolCall.args.path);
    }
    return null;
  };

  return (
    <div class={outerClass()}>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-muted-foreground" aria-hidden="true">
          <StatusIcon />
        </span>
        <span class="text-muted-foreground" aria-hidden="true">
          <Icon />
        </span>
        <code class="text-sm font-mono font-semibold text-foreground">{props.toolCall.name}</code>
        <Show when={pathLabel()}>
          <span class="text-xs text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">
            {pathLabel()}
          </span>
        </Show>
        <code class="text-xs text-muted-foreground font-mono ml-auto">{props.toolCall.id}</code>
      </div>
      {}
      <div class="text-sm border-t border-border pt-2 mt-2">
        <div class="font-medium text-muted-foreground py-1">参数</div>
        <pre
          class="p-2 bg-muted rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-border"
          data-testid="tool-call-args"
        >
          {JSON.stringify(props.toolCall.args, null, 2)}
        </pre>
      </div>
      <Show when={props.result}>
        <div class="text-sm border-t border-border pt-2 mt-2">
          <div class="font-medium text-muted-foreground py-1">结果</div>
          <pre
            class="p-2 bg-muted rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-border"
            data-testid="tool-call-result"
          >
            {JSON.stringify(props.result!.result, null, 2)}
          </pre>
          <Show when={props.result!.error}>
            <div class="mt-2 p-2 bg-destructive/10 text-destructive rounded text-sm border border-destructive/30">
              {props.result!.error}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
