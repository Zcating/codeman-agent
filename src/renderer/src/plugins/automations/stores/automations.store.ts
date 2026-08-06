import { type Accessor } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Effect } from "effect";
import { AutomationsApi, AutomationsApiLive } from "@codeman-frontend/shared/apis";
import type { AutomationRule, AutomationId } from "@shared/lib/automation-types";

interface AutomationsState {
  rules: readonly AutomationRule[];
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<AutomationsState>({
  rules: [],
  loading: false,
  error: null,
});

export const automationsRules$: Accessor<readonly AutomationRule[]> = () => state.rules;

export const automationsLoading$: Accessor<boolean> = () => state.loading;

export const automationsError$: Accessor<string | null> = () => state.error;

export const automationsStore = {
  state,

  effects: {
    loadRules: () =>
      Effect.gen(function* () {
        setState("loading", true);
        setState("error", null);
        const svc = yield* AutomationsApi;
        const rules = yield* svc.listRules();
        setState(produce((s) => {
          s.rules = rules;
          s.loading = false;
        }));
        return rules;
      }).pipe(Effect.provide(AutomationsApiLive)),
  },

  actions: {
    createRule: (rule: AutomationRule) =>
      Effect.gen(function* () {
        const svc = yield* AutomationsApi;
        const created = yield* svc.createRule(rule);
        setState(produce((s) => {
          s.rules = [...s.rules, created];
        }));
        return created;
      }).pipe(Effect.provide(AutomationsApiLive)),

    updateRule: (rule: AutomationRule) =>
      Effect.gen(function* () {
        const svc = yield* AutomationsApi;
        const updated = yield* svc.updateRule(rule);
        setState(produce((s) => {
          s.rules = s.rules.map((r) => (r.id === updated.id ? updated : r));
        }));
        return updated;
      }).pipe(Effect.provide(AutomationsApiLive)),

    deleteRule: (id: AutomationId) =>
      Effect.gen(function* () {
        const svc = yield* AutomationsApi;
        yield* svc.deleteRule(id);
        setState(produce((s) => {
          s.rules = s.rules.filter((r) => r.id !== id);
        }));
      }).pipe(Effect.provide(AutomationsApiLive)),

    toggleRule: (id: AutomationId, enabled: boolean) =>
      Effect.gen(function* () {
        const svc = yield* AutomationsApi;
        const updated = yield* svc.toggleRule(id, enabled);
        setState(produce((s) => {
          s.rules = s.rules.map((r) => (r.id === updated.id ? updated : r));
        }));
        return updated;
      }).pipe(Effect.provide(AutomationsApiLive)),

    runNow: (id: AutomationId) =>
      Effect.gen(function* () {
        const svc = yield* AutomationsApi;
        yield* svc.runNow(id);
      }).pipe(Effect.provide(AutomationsApiLive)),
  },

  _resetForTest: () => {
    setState({ rules: [], loading: false, error: null });
  },
};

export const _resetForTest = automationsStore._resetForTest;
