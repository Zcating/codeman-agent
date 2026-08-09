import { Effect } from "effect";
import { setupAutomationMainListener } from "./lib/automation-llm";

export { automationsRules$, automationsLoading$, automationsError$, automationsStore } from "./stores/automations.store";
export { executions$, executionsLoading$, executionsStore } from "./stores/executions.store";
export { computeNextDelay } from "./lib/schedule";
export { AutomationsSettingsTab } from "./components/settings-tab";

/**
 * Initialize automations plugin.
 * Sets up the main process → renderer IPC listener for LLM execution.
 */
export const initializeAutomations = (): Effect.Effect<void, never> =>
  Effect.sync(() => setupAutomationMainListener());
