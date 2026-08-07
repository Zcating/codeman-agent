import { Show, type JSX } from "solid-js";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@codeman-frontend/shared/components/ui/dialog";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import type { AutomationExecution } from "@codeman-frontend/shared/apis/invoke.api";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  success: "Success",
  failure: "Failure",
  timeout: "Timeout",
  skipped: "Skipped",
  missed: "Missed",
};

const TRIGGER_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  manual: "Manual",
  "missed-replay": "Missed Replay",
};

export interface ExecutionDetailDialogProps {
  execution: AutomationExecution | null;
  onClose: () => void;
}

export function ExecutionDetailDialog(props: ExecutionDetailDialogProps): JSX.Element {
  return (
    <Show when={props.execution}>
      {(exec) => (
        <DialogContent data-testid="execution-detail-dialog">
          <DialogHeader>
            <DialogTitle>Execution Detail</DialogTitle>
          </DialogHeader>

          <div class="flex flex-col gap-3 mt-4">
            <DetailRow label="Status">
              <span class={`font-medium ${
                exec().status === "success" ? "text-green-600" :
                exec().status === "failure" ? "text-red-600" :
                exec().status === "running" ? "text-blue-600" :
                "text-zinc-600"
              }`}>
                {STATUS_LABEL[exec().status] ?? exec().status}
              </span>
            </DetailRow>

            <DetailRow label="Trigger">
              {TRIGGER_LABEL[exec().triggerKind] ?? exec().triggerKind}
            </DetailRow>

            <DetailRow label="Started">
              {new Date(exec().startedAt).toLocaleString()}
            </DetailRow>

            <Show when={exec().completedAt !== null}>
              <DetailRow label="Completed">
                {new Date(exec().completedAt!).toLocaleString()}
              </DetailRow>
            </Show>

            <Show when={exec().durationMs !== null}>
              <DetailRow label="Duration">
                {exec().durationMs! / 1000}s
              </DetailRow>
            </Show>

            <Show when={exec().exitCode !== null}>
              <DetailRow label="Exit Code">
                <code class="text-sm">{exec().exitCode}</code>
              </DetailRow>
            </Show>

            <Show when={exec().error}>
              <DetailRow label="Error">
                <span class="text-red-600 text-sm">{exec().error}</span>
              </DetailRow>
            </Show>

            <Show when={exec().stderr}>
              <DetailRow label="Stderr">
                <pre class="text-xs bg-zinc-100 dark:bg-zinc-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {exec().stderr}
                </pre>
              </DetailRow>
            </Show>

            <Show when={exec().finalText}>
              <DetailRow label="Output">
                <pre class="text-xs bg-zinc-100 dark:bg-zinc-800 p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-48">
                  {exec().finalText}
                </pre>
              </DetailRow>
            </Show>
          </div>

          <div class="flex justify-end mt-4">
            <Button variant="outline" onClick={props.onClose}>Close</Button>
          </div>
        </DialogContent>
      )}
    </Show>
  );
}

function DetailRow(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="grid grid-cols-[120px_1fr] gap-2 items-start">
      <span class="text-sm text-zinc-500 dark:text-zinc-400">{props.label}</span>
      <span class="text-sm text-zinc-900 dark:text-zinc-100">{props.children}</span>
    </div>
  );
}
