import { createSignal, For, Show, type JSX } from "solid-js";
import { ChevronDown, ChevronRight, Clock } from "lucide-solid";
import { Effect, Exit } from "effect";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import {
  executions$,
  executionsLoading$,
  executionsStore,
} from "@codeman-frontend/plugins/automations/stores/executions.store";
import type { AutomationExecution, AutomationExecutionStatus } from "@codeman-frontend/shared/apis/invoke.api";
import type { AutomationId } from "@shared/lib/automation-types";
import { ExecutionDetailDialog } from "./execution-detail-dialog";

const STATUS_CLASS: Record<AutomationExecutionStatus, string> = {
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  failure: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  timeout: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  skipped: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  missed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const STATUS_LABEL: Record<AutomationExecutionStatus, string> = {
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

export interface ExecutionHistoryProps {
  ruleIdFilter?: AutomationId;
}

export function ExecutionHistory(props: ExecutionHistoryProps): JSX.Element {
  const [collapsed, setCollapsed] = createSignal(false);
  const [selectedExecution, setSelectedExecution] = createSignal<AutomationExecution | null>(null);
  const [filterStatus, setFilterStatus] = createSignal<string>("all");

  const loadExecutions = (): void => {
    void Effect.runPromiseExit(
      executionsStore.effects.loadExecutions({
        ruleId: props.ruleIdFilter,
        limit: 100,
      }),
    ).then((exit) =>
      Exit.match(exit, {
        onFailure: (err) => console.error("[automations] loadExecutions failed:", err),
        onSuccess: () => {},
      }),
    );
  };

  const filteredExecutions = () => {
    const status = filterStatus();
    const all = executions$();
    if (status === "all") return all;
    return all.filter((e) => e.status === status);
  };

  const handleRowClick = (exec: AutomationExecution): void => {
    setSelectedExecution(exec);
  };

  return (
    <section>
      <button
        type="button"
        class="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-foreground transition-colors"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed()}
        data-testid="execution-history-toggle"
      >
        {collapsed() ? <ChevronRight class="h-4 w-4" /> : <ChevronDown class="h-4 w-4" />}
        <span>Execution History</span>
        <Show when={!collapsed()}>
          <span class="text-xs text-zinc-400">({filteredExecutions().length})</span>
        </Show>
      </button>

      <Show when={!collapsed()}>
        <div class="mt-3 space-y-3">
          {/* Filter */}
          <div class="flex items-center gap-3">
            <label class="text-xs text-zinc-500">Filter:</label>
            <select
              class="text-xs border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 bg-white dark:bg-zinc-800"
              value={filterStatus()}
              onChange={(e) => setFilterStatus(e.currentTarget.value)}
              data-testid="execution-status-filter"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="timeout">Timeout</option>
              <option value="skipped">Skipped</option>
              <option value="missed">Missed</option>
            </select>
            <Button variant="ghost" size="xs" onClick={loadExecutions} disabled={executionsLoading$()}>
              <Clock class="h-3 w-3" aria-hidden="true" />
              <span>Refresh</span>
            </Button>
          </div>

          <Show
            when={filteredExecutions().length > 0}
            fallback={
              <div class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center">
                <Clock class="h-6 w-6 mx-auto text-zinc-400 dark:text-zinc-600" aria-hidden="true" />
                <p class="mt-1 text-xs text-zinc-500">No executions yet.</p>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-zinc-200 dark:border-zinc-700">
                    <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Started</th>
                    <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Duration</th>
                    <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Status</th>
                    <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Trigger</th>
                    <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Output</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={filteredExecutions()}>
                    {(exec) => (
                      <tr
                        class="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                        onClick={() => handleRowClick(exec)}
                        data-testid={`execution-row-${exec.id}`}
                      >
                        <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400 text-xs">
                          {new Date(exec.startedAt).toLocaleString()}
                        </td>
                        <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400 text-xs">
                          {exec.durationMs !== null ? `${(exec.durationMs / 1000).toFixed(1)}s` : "—"}
                        </td>
                        <td class="py-2 px-2">
                          <span class={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_CLASS[exec.status]}`}>
                            {STATUS_LABEL[exec.status]}
                          </span>
                        </td>
                        <td class="py-2 px-2 text-zinc-500 dark:text-zinc-400 text-xs">
                          {TRIGGER_LABEL[exec.triggerKind] ?? exec.triggerKind}
                        </td>
                        <td class="py-2 px-2 text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate">
                          {exec.finalText ?? exec.error ?? (exec.exitCode !== null ? `Exit ${exec.exitCode}` : "—")}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </Show>

      {/* Detail Dialog */}
      <Show when={selectedExecution()}>
        {(exec) => (
          <ExecutionDetailDialog
            execution={exec()}
            onClose={() => setSelectedExecution(null)}
          />
        )}
      </Show>
    </section>
  );
}
