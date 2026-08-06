import { createEffect, type JSX } from "solid-js";
import { Effect, Exit } from "effect";
import { Plus, Clock } from "lucide-solid";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";
import { Dialog } from "@codeman-frontend/shared/components/internal/codeman-dialog";
import {
  automationsStore,
} from "@codeman-frontend/plugins/automations/stores/automations.store";
import { RuleList } from "./rule-list";
import { RuleFormDialog } from "./rule-form";
import { ExecutionHistory } from "./execution-history";
import type { AutomationRule } from "@codeman-frontend/shared/lib/automation-types";

export function AutomationsSettingsTab(): JSX.Element {
  // Load rules on mount
  createEffect(() => {
    void Effect.runPromiseExit(automationsStore.effects.loadRules()).then((exit) =>
      Exit.match(exit, {
        onFailure: (err) => console.error("[automations] loadRules failed:", err),
        onSuccess: () => {},
      }),
    );
  });

  const openAddDialog = (): void => {
    void Dialog.show<AutomationRule | null>((resolve) => (
      <RuleFormDialog
        onSave={(rule) => resolve(rule)}
        onCancel={() => resolve(null)}
      />
    )).then((result) => {
      if (!result) return;
      void Effect.runPromiseExit(automationsStore.actions.createRule(result)).then((exit) =>
        Exit.match(exit, {
          onFailure: (err) => console.error("[automations] create failed:", err),
          onSuccess: () => {},
        }),
      );
    });
  };

  const openEditDialog = (rule: AutomationRule): void => {
    void Dialog.show<AutomationRule | null>((resolve) => (
      <RuleFormDialog
        initialValues={rule}
        onSave={(updated) => resolve(updated)}
        onCancel={() => resolve(null)}
      />
    )).then((result) => {
      if (!result) return;
      void Effect.runPromiseExit(automationsStore.actions.updateRule(result)).then((exit) =>
        Exit.match(exit, {
          onFailure: (err) => console.error("[automations] update failed:", err),
          onSuccess: () => {},
        }),
      );
    });
  };

  const handleDelete = (id: string): void => {
    void Effect.runPromiseExit(automationsStore.actions.deleteRule(id as any)).then((exit) =>
      Exit.match(exit, {
        onFailure: (err) => console.error("[automations] delete failed:", err),
        onSuccess: () => {},
      }),
    );
  };

  return (
    <ScrollArea
      class="flex-1 min-h-0"
      data-scroll-region="true"
      viewportClass="space-y-6 py-4 pl-4 pr-6"
    >
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Automations
          </h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Schedule rules to run automatically on a timer.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={openAddDialog}
          data-testid="add-rule-button"
        >
          <Plus class="h-4 w-4" aria-hidden="true" />
          <span>New Rule</span>
        </Button>
      </header>

      {/* Rules Section */}
      <section>
        <h3 class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
          <Clock class="h-4 w-4" aria-hidden="true" />
          Rules
        </h3>
        <RuleList onEdit={openEditDialog} onDelete={handleDelete} />
      </section>

      {/* Execution History Section */}
      <section>
        <ExecutionHistory />
      </section>
    </ScrollArea>
  );
}
