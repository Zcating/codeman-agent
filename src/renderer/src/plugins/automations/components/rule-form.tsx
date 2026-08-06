import { Show, type JSX } from "solid-js";
import { createForm } from "@tanstack/solid-form";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@codeman-frontend/shared/components/ui/dialog";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { CodemanInput } from "@codeman-frontend/shared/components/internal/codeman-input";
import { CodemanTextarea } from "@codeman-frontend/shared/components/internal/codeman-textarea";
import { CodemanSelect } from "@codeman-frontend/shared/components/internal/codeman-select";
import { CodemanCheckbox } from "@codeman-frontend/shared/components/internal/codeman-checkbox";
import type { AutomationRule, AutomationSchedule, AutomationAction } from "@codeman-frontend/shared/lib/automation-types";

export interface RuleFormValues {
  name: string;
  enabled: boolean;
  scheduleKind: "interval" | "daily" | "weekly";
  everyMs: number; // interval: every N ms
  dailyHour: number;
  dailyMinute: number;
  weeklyWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  weeklyHour: number;
  weeklyMinute: number;
  actionKind: "llm" | "script";
  // LLM fields
  llmSystemPrompt: string;
  llmUserPrompt: string;
  llmProviderId: string;
  llmModelId: string;
  llmTimeoutMs: number;
  // Script fields
  scriptLanguage: "shell" | "javascript";
  scriptSource: string;
  scriptWorkspaceId: string;
  scriptTimeoutMs: number;
}

const emptyFormValues = (): RuleFormValues => ({
  name: "",
  enabled: true,
  scheduleKind: "interval",
  everyMs: 60_000,
  dailyHour: 9,
  dailyMinute: 0,
  weeklyWeekday: 1,
  weeklyHour: 9,
  weeklyMinute: 0,
  actionKind: "llm",
  llmSystemPrompt: "",
  llmUserPrompt: "",
  llmProviderId: "",
  llmModelId: "",
  llmTimeoutMs: 300_000,
  scriptLanguage: "shell",
  scriptSource: "",
  scriptWorkspaceId: "",
  scriptTimeoutMs: 300_000,
});

const ruleToFormValues = (rule: AutomationRule): RuleFormValues => {
  const schedule: AutomationSchedule = rule.schedule;
  const action: AutomationAction = rule.action;
  return {
    name: rule.name,
    enabled: rule.enabled,
    scheduleKind: schedule.kind,
    everyMs: schedule.kind === "interval" ? schedule.everyMs : 60_000,
    dailyHour: schedule.kind === "daily" ? schedule.hour : 9,
    dailyMinute: schedule.kind === "daily" ? schedule.minute : 0,
    weeklyWeekday: schedule.kind === "weekly" ? schedule.weekday : 1,
    weeklyHour: schedule.kind === "weekly" ? schedule.hour : 9,
    weeklyMinute: schedule.kind === "weekly" ? schedule.minute : 0,
    actionKind: action.kind,
    llmSystemPrompt: action.kind === "llm" ? action.systemPrompt : "",
    llmUserPrompt: action.kind === "llm" ? action.userPrompt : "",
    llmProviderId: action.kind === "llm" ? action.providerId : "",
    llmModelId: action.kind === "llm" ? action.modelId : "",
    llmTimeoutMs: action.kind === "llm" ? action.timeoutMs : 300_000,
    scriptLanguage: action.kind === "script" ? action.language : "shell",
    scriptSource: action.kind === "script" ? action.source : "",
    scriptWorkspaceId: action.kind === "script" ? action.workspaceId : "",
    scriptTimeoutMs: action.kind === "script" ? action.timeoutMs : 300_000,
  };
};

export function ruleToAutomationRule(form: RuleFormValues, existingId?: string): AutomationRule {
  let schedule: AutomationSchedule;
  switch (form.scheduleKind) {
    case "interval":
      schedule = { kind: "interval", everyMs: form.everyMs };
      break;
    case "daily":
      schedule = { kind: "daily", hour: form.dailyHour, minute: form.dailyMinute };
      break;
    case "weekly":
      schedule = { kind: "weekly", weekday: form.weeklyWeekday, hour: form.weeklyHour, minute: form.weeklyMinute };
      break;
  }

  let action: AutomationAction;
  if (form.actionKind === "llm") {
    action = {
      kind: "llm",
      systemPrompt: form.llmSystemPrompt,
      userPrompt: form.llmUserPrompt,
      providerId: form.llmProviderId,
      modelId: form.llmModelId,
      timeoutMs: form.llmTimeoutMs,
    };
  } else {
    action = {
      kind: "script",
      language: form.scriptLanguage,
      source: form.scriptSource,
      workspaceId: form.scriptWorkspaceId,
      timeoutMs: form.scriptTimeoutMs,
    };
  }

  const now = Date.now();
  return {
    id: existingId ?? crypto.randomUUID(),
    name: form.name,
    enabled: form.enabled,
    schedule,
    action,
    createdAt: existingId ? now : now, // Will be preserved by caller
    updatedAt: now,
  };
}

export interface RuleFormDialogProps {
  initialValues?: AutomationRule;
  onSave: (rule: AutomationRule) => void;
  onCancel: () => void;
}

const SCHEDULE_PRESETS = [
  { label: "Every minute", value: 60_000 },
  { label: "Every 5 minutes", value: 300_000 },
  { label: "Every 15 minutes", value: 900_000 },
  { label: "Every hour", value: 3_600_000 },
  { label: "Every 6 hours", value: 21_600_000 },
  { label: "Every 12 hours", value: 43_200_000 },
  { label: "Daily", value: -1 }, // special sentinel for "custom daily"
  { label: "Weekly", value: -2 }, // special sentinel for "custom weekly"
];



export function RuleFormDialog(props: RuleFormDialogProps): JSX.Element {
  const isEdit = () => !!props.initialValues;

  const form = createForm(() => ({
    defaultValues: props.initialValues
      ? ruleToFormValues(props.initialValues)
      : emptyFormValues(),
  }));

  const handleSave = (): void => {
    const values = form.state.values as RuleFormValues;
    const rule = ruleToAutomationRule(values, props.initialValues?.id);
    // Preserve createdAt if editing
    if (props.initialValues) {
      (rule as any).createdAt = props.initialValues.createdAt;
    }
    props.onSave(rule);
  };

  return (
    <DialogContent data-testid="rule-form-dialog">
      <DialogHeader>
        <DialogTitle>{isEdit() ? "Edit Rule" : "New Automation Rule"}</DialogTitle>
        <DialogDescription>
          {isEdit()
            ? "Update the configuration for this automation rule."
            : "Create a new automation rule to run on a schedule."}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-3 mt-4 max-h-[60vh] overflow-y-auto">
        {/* Name */}
        <form.Field name="name">
          {(field) => (
            <CodemanInput
              label="Name"
              data-testid="field-name"
              value={field().state.value}
              onValueChange={field().handleChange}
            />
          )}
        </form.Field>

        {/* Enabled */}
        <form.Field name="enabled">
          {(field) => (
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <CodemanCheckbox
                value={field().state.value}
                onChange={field().handleChange}
                data-testid="field-enabled"
              />
              <span>Enabled</span>
            </label>
          )}
        </form.Field>

        {/* Schedule Kind */}
        <form.Field name="scheduleKind">
          {(field) => (
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Schedule</label>
              <div class="flex gap-2">
                {(["interval", "daily", "weekly"] as const).map((kind) => (
                  <button
                    type="button"
                    class={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                      field().state.value === kind
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400"
                    }`}
                    onClick={() => field().handleChange(kind)}
                  >
                    {kind === "interval" ? "Interval" : kind === "daily" ? "Daily" : "Weekly"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form.Field>

        {/* Interval fields */}
        <Show when={form.state.values.scheduleKind === "interval"}>
          <form.Field name="everyMs">
            {(field) => (
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Interval</label>
                <CodemanSelect
                  options={SCHEDULE_PRESETS.filter((p) => p.value > 0).map((p) => ({
                    label: p.label,
                    value: String(p.value),
                  }))}
                  value={String(field().state.value)}
                  onChange={(v) => field().handleChange(Number(v))}
                  data-testid="field-everyMs"
                />
              </div>
            )}
          </form.Field>
        </Show>

        {/* Daily fields */}
        <Show when={form.state.values.scheduleKind === "daily"}>
          <div class="grid grid-cols-2 gap-2">
            <form.Field name="dailyHour">
              {(field) => (
                <CodemanInput
                  label="Hour (0-23)"
                  type="number"
                  value={String(field().state.value)}
                  onValueChange={(v) => field().handleChange(Number(v))}
                  data-testid="field-dailyHour"
                />
              )}
            </form.Field>
            <form.Field name="dailyMinute">
              {(field) => (
                <CodemanInput
                  label="Minute (0-59)"
                  type="number"
                  value={String(field().state.value)}
                  onValueChange={(v) => field().handleChange(Number(v))}
                  data-testid="field-dailyMinute"
                />
              )}
            </form.Field>
          </div>
        </Show>

        {/* Weekly fields */}
        <Show when={form.state.values.scheduleKind === "weekly"}>
          <form.Field name="weeklyWeekday">
            {(field) => (
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Day of Week</label>
                <CodemanSelect
                  options={[
                    { label: "Sunday", value: "0" },
                    { label: "Monday", value: "1" },
                    { label: "Tuesday", value: "2" },
                    { label: "Wednesday", value: "3" },
                    { label: "Thursday", value: "4" },
                    { label: "Friday", value: "5" },
                    { label: "Saturday", value: "6" },
                  ]}
                  value={String(field().state.value)}
                  onChange={(v) => field().handleChange(Number(v) as 0 | 1 | 2 | 3 | 4 | 5 | 6)}
                  data-testid="field-weeklyWeekday"
                />
              </div>
            )}
          </form.Field>
          <div class="grid grid-cols-2 gap-2">
            <form.Field name="weeklyHour">
              {(field) => (
                <CodemanInput
                  label="Hour (0-23)"
                  type="number"
                  value={String(field().state.value)}
                  onValueChange={(v) => field().handleChange(Number(v))}
                  data-testid="field-weeklyHour"
                />
              )}
            </form.Field>
            <form.Field name="weeklyMinute">
              {(field) => (
                <CodemanInput
                  label="Minute (0-59)"
                  type="number"
                  value={String(field().state.value)}
                  onValueChange={(v) => field().handleChange(Number(v))}
                  data-testid="field-weeklyMinute"
                />
              )}
            </form.Field>
          </div>
        </Show>

        {/* Action Kind */}
        <form.Field name="actionKind">
          {(field) => (
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Action Type</label>
              <div class="flex gap-2">
                {(["llm", "script"] as const).map((kind) => (
                  <button
                    type="button"
                    class={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                      field().state.value === kind
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400"
                    }`}
                    onClick={() => field().handleChange(kind)}
                  >
                    {kind === "llm" ? "LLM" : "Script"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form.Field>

        {/* LLM action fields */}
        <Show when={form.state.values.actionKind === "llm"}>
          <form.Field name="llmSystemPrompt">
            {(field) => (
              <CodemanTextarea
                label="System Prompt"
                data-testid="field-llmSystemPrompt"
                value={field().state.value}
                onValueChange={field().handleChange}
                rows={4}
                placeholder="You are a helpful coding assistant..."
              />
            )}
          </form.Field>
          <form.Field name="llmUserPrompt">
            {(field) => (
              <CodemanTextarea
                label="User Prompt"
                data-testid="field-llmUserPrompt"
                value={field().state.value}
                onValueChange={field().handleChange}
                rows={3}
                placeholder="What would you like the agent to do?"
              />
            )}
          </form.Field>
          <div class="grid grid-cols-2 gap-2">
            <form.Field name="llmProviderId">
              {(field) => (
                <CodemanInput
                  label="Provider ID"
                  data-testid="field-llmProviderId"
                  value={field().state.value}
                  onValueChange={field().handleChange}
                  placeholder="provider-1"
                />
              )}
            </form.Field>
            <form.Field name="llmModelId">
              {(field) => (
                <CodemanInput
                  label="Model ID"
                  data-testid="field-llmModelId"
                  value={field().state.value}
                  onValueChange={field().handleChange}
                  placeholder="gpt-4o"
                />
              )}
            </form.Field>
          </div>
          <form.Field name="llmTimeoutMs">
            {(field) => (
              <CodemanInput
                label="Timeout (ms)"
                type="number"
                data-testid="field-llmTimeoutMs"
                value={String(field().state.value)}
                onValueChange={(v) => field().handleChange(Number(v))}
              />
            )}
          </form.Field>
        </Show>

        {/* Script action fields */}
        <Show when={form.state.values.actionKind === "script"}>
          <form.Field name="scriptLanguage">
            {(field) => (
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Language</label>
                <div class="flex gap-2">
                  {(["shell", "javascript"] as const).map((lang) => (
                    <button
                      type="button"
                      class={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                        field().state.value === lang
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400"
                      }`}
                      onClick={() => field().handleChange(lang)}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form.Field>
          <form.Field name="scriptSource">
            {(field) => (
              <CodemanTextarea
                label="Script Source"
                data-testid="field-scriptSource"
                value={field().state.value}
                onValueChange={field().handleChange}
                rows={5}
                placeholder="echo 'Hello, World!'"
              />
            )}
          </form.Field>
          <form.Field name="scriptWorkspaceId">
            {(field) => (
              <CodemanInput
                label="Workspace ID"
                data-testid="field-scriptWorkspaceId"
                value={field().state.value}
                onValueChange={field().handleChange}
                placeholder="workspace-uuid"
              />
            )}
          </form.Field>
          <form.Field name="scriptTimeoutMs">
            {(field) => (
              <CodemanInput
                label="Timeout (ms)"
                type="number"
                data-testid="field-scriptTimeoutMs"
                value={String(field().state.value)}
                onValueChange={(v) => field().handleChange(Number(v))}
              />
            )}
          </form.Field>
        </Show>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={props.onCancel} data-testid="cancel-button">
          Cancel
        </Button>
        <Button onClick={handleSave} data-testid="save-button">
          {isEdit() ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
