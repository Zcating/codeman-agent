import { For, Show, type JSX } from "solid-js";
import { Effect, Exit } from "effect";
import { Play, Pencil, Trash2, Clock } from "lucide-solid";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { Checkbox } from "@codeman-frontend/shared/components/ui/checkbox";
import {
  automationsRules$,
  automationsStore,
} from "@codeman-frontend/plugins/automations/stores/automations.store";
import type { AutomationRule } from "@codeman-frontend/shared/lib/automation-types";
import { formatSchedule, formatActionKind } from "../lib/format";

export interface RuleListProps {
  onEdit: (rule: AutomationRule) => void;
  onDelete: (id: string) => void;
}

export function RuleList(props: RuleListProps): JSX.Element {
  const handleToggle = (rule: AutomationRule): void => {
    void Effect.runPromiseExit(
      automationsStore.actions.toggleRule(rule.id, !rule.enabled),
    ).then((exit) =>
      Exit.match(exit, {
        onFailure: (err) => console.error("[automations] toggle failed:", err),
        onSuccess: () => {},
      }),
    );
  };

  const handleRunNow = (id: string): void => {
    void Effect.runPromiseExit(
      automationsStore.actions.runNow(id as any),
    ).then((exit) =>
      Exit.match(exit, {
        onFailure: (err) => console.error("[automations] runNow failed:", err),
        onSuccess: () => {},
      }),
    );
  };

  const handleDelete = (id: string): void => {
    void Effect.runPromiseExit(
      automationsStore.actions.deleteRule(id as any),
    ).then((exit) =>
      Exit.match(exit, {
        onFailure: (err) => console.error("[automations] delete failed:", err),
        onSuccess: () => {},
      }),
    );
  };

  return (
    <Show
      when={automationsRules$().length > 0}
      fallback={
        <div class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
          <Clock class="h-8 w-8 mx-auto text-zinc-400 dark:text-zinc-600" aria-hidden="true" />
          <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No automations.
          </p>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            Click "+ New Rule" to create one.
          </p>
        </div>
      }
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-zinc-200 dark:border-zinc-700">
              <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Enabled</th>
              <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Name</th>
              <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Schedule</th>
              <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Action</th>
              <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Last Updated</th>
              <th class="text-left py-2 px-2 text-xs font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={automationsRules$()}>
              {(rule) => (
                <tr class="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td class="py-2 px-2">
                    <Checkbox
                      checked={rule.enabled}
                      onChange={() => handleToggle(rule)}
                      aria-label={`Enable ${rule.name}`}
                    />
                  </td>
                  <td class="py-2 px-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {rule.name}
                  </td>
                  <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400 text-xs">
                    {formatSchedule(rule.schedule)}
                  </td>
                  <td class="py-2 px-2">
                    <span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
                      {formatActionKind(rule.action)}
                    </span>
                  </td>
                  <td class="py-2 px-2 text-xs text-zinc-400 dark:text-zinc-600">
                    {new Date(rule.updatedAt).toLocaleDateString()}
                  </td>
                  <td class="py-2 px-2">
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRunNow(rule.id)}
                        title="Run now"
                        aria-label={`Run ${rule.name} now`}
                        data-testid={`run-now-${rule.id}`}
                      >
                        <Play class="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => props.onEdit(rule)}
                        title="Edit"
                        aria-label={`Edit ${rule.name}`}
                        data-testid={`edit-${rule.id}`}
                      >
                        <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(rule.id)}
                        title="Delete"
                        aria-label={`Delete ${rule.name}`}
                        data-testid={`delete-${rule.id}`}
                        class="hover:text-red-600"
                      >
                        <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
