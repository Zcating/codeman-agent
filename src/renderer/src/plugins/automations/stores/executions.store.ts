import { type Accessor } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Effect } from "effect";
import { AutomationsApi, AutomationsApiLive } from "@codeman-frontend/shared/apis";
import type { AutomationId } from "@codeman-frontend/shared/lib/automation-types";
import type { AutomationExecution } from "@codeman-frontend/shared/apis/invoke.api";

interface ExecutionsState {
  executions: readonly AutomationExecution[];
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<ExecutionsState>({
  executions: [],
  loading: false,
  error: null,
});

export const executions$: Accessor<readonly AutomationExecution[]> = () => state.executions;
export const executionsLoading$: Accessor<boolean> = () => state.loading;
export const executionsError$: Accessor<string | null> = () => state.error;

export const executionsStore = {
  state,

  effects: {
    loadExecutions: (args: { ruleId?: AutomationId; limit?: number; offset?: number } = {}) =>
      Effect.gen(function* () {
        setState("loading", true);
        setState("error", null);
        const svc = yield* AutomationsApi;
        const executions = yield* svc.listExecutions(args);
        setState(produce((s) => {
          s.executions = executions;
          s.loading = false;
        }));
        return executions;
      }).pipe(Effect.provide(AutomationsApiLive)),

    loadExecution: (id: string) =>
      Effect.gen(function* () {
        const svc = yield* AutomationsApi;
        return yield* svc.getExecution(id);
      }).pipe(Effect.provide(AutomationsApiLive)),
  },

  actions: {
    prependExecution: (execution: AutomationExecution) => {
      setState(produce((s) => {
        s.executions = [execution, ...s.executions];
      }));
    },
  },

  _resetForTest: () => {
    setState({ executions: [], loading: false, error: null });
  },
};

export const _resetForTest = executionsStore._resetForTest;
