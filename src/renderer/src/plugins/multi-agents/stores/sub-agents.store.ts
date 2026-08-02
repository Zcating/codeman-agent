import { createStore } from "solid-js/store";
import { Effect, Exit } from "effect";
import { SubAgentsApi, SubAgentsApiLive } from "@codeman-frontend/shared/apis";
import type { SubAgentConfig, SubAgentId } from "../lib/sub-agent.types";

interface SubAgentsState {
  byId: Record<string, SubAgentConfig>;
  allIds: string[];
}

const [state, setState] = createStore<SubAgentsState>({ byId: {}, allIds: [] });

function populateFromList(list: readonly SubAgentConfig[]): void {
  const byId: Record<string, SubAgentConfig> = {};
  const allIds: string[] = [];
  for (const config of list) {
    byId[config.id] = config;
    allIds.push(config.id);
  }
  setState({ byId, allIds });
}

export const subAgentsStore = {
  state,

  effects: {
    load: () =>
      Effect.gen(function* () {
        const svc = yield* SubAgentsApi;
        const list = yield* svc.list();
        populateFromList(list);
        return list;
      }).pipe(Effect.provide(SubAgentsApiLive)),
  },

  actions: {
    add: (config: SubAgentConfig) =>
      Effect.gen(function* () {
        const svc = yield* SubAgentsApi;
        const added = yield* svc.add(config);
        setState((s) => ({
          byId: { ...s.byId, [added.id]: added },
          allIds: [...s.allIds, added.id],
        }));
        return added;
      }).pipe(Effect.provide(SubAgentsApiLive)),

    update: (id: SubAgentId, patch: Partial<SubAgentConfig>) =>
      Effect.gen(function* () {
        const svc = yield* SubAgentsApi;
        const updated = yield* svc.update(id, patch);
        setState((s) => ({
          ...s,
          byId: { ...s.byId, [id]: updated },
        }));
        return updated;
      }).pipe(Effect.provide(SubAgentsApiLive)),

    delete: (id: SubAgentId) =>
      Effect.gen(function* () {
        const svc = yield* SubAgentsApi;
        yield* svc.delete(id);
        setState((s) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...remainingById } = s.byId;
          return {
            byId: remainingById,
            allIds: s.allIds.filter((existingId) => existingId !== id),
          };
        });
      }).pipe(Effect.provide(SubAgentsApiLive)),

    setEnabled: (id: SubAgentId, enabled: boolean) =>
      Effect.gen(function* () {
        const svc = yield* SubAgentsApi;
        const updated = yield* svc.setEnabled(id, enabled);
        setState((s) => ({
          ...s,
          byId: { ...s.byId, [id]: updated },
        }));
        return updated;
      }).pipe(Effect.provide(SubAgentsApiLive)),
  },

  selectors: {
    enabledIds: () => state.allIds.filter((id) => state.byId[id]?.enabled),
  },

  _resetForTest: () => {
    setState({ byId: {}, allIds: [] });
  },
};
