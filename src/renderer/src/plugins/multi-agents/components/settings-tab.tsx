import { For, Show, createMemo, type JSX } from "solid-js";
import { Effect } from "effect";
import { Plus, Pencil, Trash2, Users } from "lucide-solid";
import { subAgentsStore } from "../stores/sub-agents.store";
import type { SubAgentConfig, ThinkingLevel } from "../lib/sub-agent.types";
import { Dialog } from "@codeman-frontend/shared/components/internal/codeman-dialog";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@codeman-frontend/shared/components/ui/dialog";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { Checkbox } from "@codeman-frontend/shared/components/ui/checkbox";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { buildEnabledProviders } from "@codeman-frontend/features/chat/lib/build-enabled-providers";

interface SubAgentRowProps {
  config: SubAgentConfig;
  onEdit: (config: SubAgentConfig) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

function SubAgentRow(props: SubAgentRowProps): JSX.Element {
  const handleToggle = (): void => {
    void Effect.runPromise(
      subAgentsStore.actions.setEnabled(props.config.id, !props.config.enabled),
    );
  };

  const handleEdit = (): void => {
    props.onEdit(props.config);
  };

  const handleDelete = (): void => {
    void Effect.runPromise(subAgentsStore.actions.delete(props.config.id));
  };

  return (
    <li
      class="flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3"
      data-testid={`sub-agent-row-${props.config.id}`}
    >
      <Users class="h-5 w-5 mt-0.5 text-zinc-400 shrink-0" aria-hidden="true" />
      <div class="flex-1 min-w-0 space-y-1">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <code class="text-sm font-mono font-medium text-zinc-900 dark:text-zinc-100">
              {props.config.name}
            </code>
            <span
              class={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ${
                props.config.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {props.config.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEdit}
              class="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-foreground transition-colors"
              aria-label={`Edit ${props.config.name}`}
              data-testid={`edit-sub-agent-${props.config.id}`}
            >
              <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={handleDelete}
              class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              aria-label={`Delete ${props.config.name}`}
              data-testid={`delete-sub-agent-${props.config.id}`}
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
        </div>
        <p class="text-xs text-zinc-500 dark:text-zinc-400 truncate">
          {props.config.description}
        </p>
        <div class="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600 flex-wrap">
          <span class="font-mono">{props.config.modelId}</span>
          <span>{props.config.allowedTools.length} tool{props.config.allowedTools.length !== 1 ? "s" : ""}</span>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={props.config.enabled}
              onChange={handleToggle}
              aria-label={`Enable ${props.config.name}`}
            />
            <span>Enabled</span>
          </label>
        </div>
      </div>
    </li>
  );
}

interface SubAgentFormValues {
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  allowedTools: string[];
  enabled: boolean;
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

const ALL_TOOLS = [
  "read_file",
  "write_file",
  "grep",
  "webfetch",
  "run_command",
  "glob",
] as const;

function SubAgentFormDialog(props: {
  initialValues?: SubAgentConfig;
  onSave: (values: SubAgentFormValues) => void;
  onCancel: () => void;
}): JSX.Element {
  const isEdit = () => !!props.initialValues;

  let nameVal = props.initialValues?.name ?? "";
  let descVal = props.initialValues?.description ?? "";
  let promptVal = props.initialValues?.systemPrompt ?? "";
  let modelVal = props.initialValues?.modelId ?? "";
  let thinkingVal = props.initialValues?.thinkingLevel ?? "medium";
  let toolsVal = [...(props.initialValues?.allowedTools ?? [])];
  let enabledVal = props.initialValues?.enabled ?? true;

  // Local state for form fields
  let nameField: HTMLInputElement | undefined;
  let descField: HTMLInputElement | undefined;
  let promptField: HTMLTextAreaElement | undefined;
  let modelField: HTMLSelectElement | undefined;
  let thinkingField: HTMLSelectElement | undefined;

  const handleToolToggle = (tool: string, checked: boolean): void => {
    if (checked) {
      if (!toolsVal.includes(tool)) {
        toolsVal.push(tool);
      }
    } else {
      toolsVal = toolsVal.filter((t) => t !== tool);
    }
  };

  const handleSave = (): void => {
    const values: SubAgentFormValues = {
      name: nameField?.value ?? nameVal,
      description: descField?.value ?? descVal,
      systemPrompt: promptField?.value ?? promptVal,
      modelId: modelField?.value ?? modelVal,
      thinkingLevel: (thinkingField?.value ?? thinkingVal) as ThinkingLevel,
      allowedTools: toolsVal,
      enabled: enabledVal,
    };
    props.onSave(values);
  };

  const enabledModels = createMemo(() => {
    const providers = appStore.state.value.providers ?? [];
    const enabled = buildEnabledProviders(providers);
    return enabled.flatMap((p) => p.models.map((m) => ({ provider: p.label, model: m })));
  });

  return (
    <DialogContent data-testid="sub-agent-form-dialog">
      <DialogHeader>
        <DialogTitle>{isEdit() ? "Edit sub-agent" : "Add sub-agent"}</DialogTitle>
        <DialogDescription>
          {isEdit()
            ? "Update the configuration for this sub-agent."
            : "Create a new sub-agent configuration."}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-3 mt-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Name</label>
          <input
            ref={nameField}
            type="text"
            data-testid="field-name"
            class="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={nameVal}
          />
        </div>

        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Description</label>
          <input
            ref={descField}
            type="text"
            data-testid="field-description"
            class="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={descVal}
          />
        </div>

        <div>
          <label class="text-xs text-muted-foreground mb-1 block">System Prompt</label>
          <textarea
            ref={promptField}
            data-testid="field-system-prompt"
            class="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            value={promptVal}
          />
        </div>

        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Model</label>
          <select
            ref={modelField}
            data-testid="field-model"
            class="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={modelVal}
          >
            <option value="">Select a model...</option>
            <For each={enabledModels()}>
              {(item) => (
                <option value={item.model.id}>
                  {item.provider} / {item.model.label}
                </option>
              )}
            </For>
          </select>
        </div>

        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Thinking Level</label>
          <select
            ref={thinkingField}
            data-testid="field-thinking-level"
            class="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={thinkingVal}
          >
            <For each={THINKING_LEVELS}>
              {(level) => <option value={level}>{level}</option>}
            </For>
          </select>
        </div>

        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Allowed Tools</label>
          <div class="flex flex-wrap gap-2">
            <For each={ALL_TOOLS}>
              {(tool) => (
                <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={toolsVal.includes(tool)}
                    onChange={(e) => handleToolToggle(tool, e.currentTarget.checked)}
                    data-testid={`tool-${tool}`}
                  />
                  <span class="font-mono text-zinc-700 dark:text-zinc-300">{tool}</span>
                </label>
              )}
            </For>
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={enabledVal}
            onChange={(e) => { enabledVal = e.currentTarget.checked; }}
            data-testid="field-enabled"
          />
          <span>Enabled</span>
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={props.onCancel} data-testid="cancel-button">
          Cancel
        </Button>
        <Button onClick={handleSave} data-testid="save-button">
          {isEdit() ? "Save" : "Add"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function SettingsTab(): JSX.Element {
  const agents = createMemo(() =>
    subAgentsStore.state.allIds.map((id) => subAgentsStore.state.byId[id]).filter(Boolean) as SubAgentConfig[],
  );

  const openAddDialog = (): void => {
    void Dialog.show<SubAgentFormValues | null>((resolve) => (
      <SubAgentFormDialog
        onSave={(values) => resolve(values)}
        onCancel={() => resolve(null as unknown as SubAgentFormValues)}
      />
    )).then((result) => {
      if (!result) {return;}
      const newConfig: SubAgentConfig = {
        id: `agent-${Date.now().toString(36)}`,
        name: result.name,
        description: result.description,
        systemPrompt: result.systemPrompt,
        modelId: result.modelId,
        thinkingLevel: result.thinkingLevel,
        allowedTools: result.allowedTools,
        enabled: result.enabled,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      void Effect.runPromise(subAgentsStore.actions.add(newConfig));
    });
  };

  const openEditDialog = (config: SubAgentConfig): void => {
    void Dialog.show<SubAgentFormValues | null>((resolve) => (
      <SubAgentFormDialog
        initialValues={config}
        onSave={(values) => resolve(values)}
        onCancel={() => resolve(null as unknown as SubAgentFormValues)}
      />
    )).then((result) => {
      if (!result) {return;}
      void Effect.runPromise(
        subAgentsStore.actions.update(config.id, {
          name: result.name,
          description: result.description,
          systemPrompt: result.systemPrompt,
          modelId: result.modelId,
          thinkingLevel: result.thinkingLevel,
          allowedTools: result.allowedTools,
          enabled: result.enabled,
        }),
      );
    });
  };

  return (
    <section class="space-y-4">
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Sub-Agents
          </h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Configure sub-agents that the main agent can delegate tasks to.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddDialog}
          class="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          data-testid="add-sub-agent-button"
        >
          <Plus class="h-4 w-4" aria-hidden="true" />
          <span>Add sub-agent</span>
        </button>
      </header>

      <Show
        when={agents().length > 0}
        fallback={
          <div
            class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center"
            data-testid="empty-state"
          >
            <Users class="h-8 w-8 mx-auto text-zinc-400 dark:text-zinc-600" aria-hidden="true" />
            <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No sub-agents configured.
            </p>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Click "Add sub-agent" to create one.
            </p>
          </div>
        }
      >
        <ul class="space-y-2" data-testid="sub-agents-list">
          <For each={agents()}>
            {(agent) => (
              <SubAgentRow
                config={agent}
                onEdit={openEditDialog}
                onDelete={(id) => void Effect.runPromise(subAgentsStore.actions.delete(id))}
                onToggle={(id, enabled) =>
                  void Effect.runPromise(subAgentsStore.actions.setEnabled(id, enabled))
                }
              />
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
