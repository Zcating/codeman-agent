import { describe, expect, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { it as itEffect } from "@effect/vitest";
import { subAgentsStore } from "./sub-agents.store";
import { SubAgentsApi } from "@codeman-frontend/shared/apis";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";

const SAMPLE_CONFIG: SubAgentConfig = {
  id: "agent-001" as SubAgentConfig["id"],
  name: "Researcher",
  description: "Research sub-agent",
  systemPrompt: "You are a research assistant.",
  modelId: "MiniMax-M2.5-highspeed",
  thinkingLevel: "medium",
  allowedTools: ["webfetch"],
  enabled: true,
  createdAt: 1234567890,
  updatedAt: 1234567890,
};

const SAMPLE_CONFIG_2: SubAgentConfig = {
  ...SAMPLE_CONFIG,
  id: "agent-002" as SubAgentConfig["id"],
  name: "Coder",
  description: "Coding sub-agent",
};

describe("sub-agents store", () => {
  beforeEach(() => {
    subAgentsStore._resetForTest();
  });

  itEffect("actions.add inserts config into byId and allIds", () =>
    Effect.gen(function* () {
      const mockList = () => Effect.succeed<readonly SubAgentConfig[]>([]);
      const mockAdd = (config: SubAgentConfig) => Effect.succeed(config);

      const mockLayer = Layer.succeed(SubAgentsApi, {
        list: mockList,
        add: mockAdd,
        update: () => Effect.succeed(SAMPLE_CONFIG),
        delete: () => Effect.succeed(undefined),
        setEnabled: () => Effect.succeed(SAMPLE_CONFIG),
      });

      yield* subAgentsStore.effects.load().pipe(Effect.provide(mockLayer));

      expect(subAgentsStore.state.byId[SAMPLE_CONFIG.id]).toEqual(SAMPLE_CONFIG);
      expect(subAgentsStore.state.allIds).toContain(SAMPLE_CONFIG.id);
    }),
  );

  itEffect("actions.update merges patch and updates updatedAt", () =>
    Effect.gen(function* () {
      const before = { ...SAMPLE_CONFIG };

      const mockList = () => Effect.succeed<readonly SubAgentConfig[]>([SAMPLE_CONFIG]);
      const mockUpdate = (_id: string, _patch: Partial<SubAgentConfig>) =>
        Effect.succeed({ ...before, name: "Updated Researcher", updatedAt: Date.now() });

      const mockLayer = Layer.succeed(SubAgentsApi, {
        list: mockList,
        add: () => Effect.succeed(SAMPLE_CONFIG),
        update: mockUpdate,
        delete: () => Effect.succeed(undefined),
        setEnabled: () => Effect.succeed(SAMPLE_CONFIG),
      });

      yield* subAgentsStore.effects.load().pipe(Effect.provide(mockLayer));

      const id = SAMPLE_CONFIG.id;
      yield* subAgentsStore.actions.update(id, { name: "Updated Researcher" }).pipe(Effect.provide(mockLayer));

      const after = subAgentsStore.state.byId[id];
      expect(after.name).toBe("Updated Researcher");
      expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    }),
  );

  itEffect("actions.delete removes config from byId and allIds", () =>
    Effect.gen(function* () {
      const mockList = () => Effect.succeed<readonly SubAgentConfig[]>([SAMPLE_CONFIG, SAMPLE_CONFIG_2]);
      const mockDelete = (_id: string) => Effect.succeed(undefined);

      const mockLayer = Layer.succeed(SubAgentsApi, {
        list: mockList,
        add: () => Effect.succeed(SAMPLE_CONFIG),
        update: () => Effect.succeed(SAMPLE_CONFIG),
        delete: mockDelete,
        setEnabled: () => Effect.succeed(SAMPLE_CONFIG),
      });

      yield* subAgentsStore.effects.load().pipe(Effect.provide(mockLayer));

      const idToDelete = SAMPLE_CONFIG.id;
      yield* subAgentsStore.actions.delete(idToDelete).pipe(Effect.provide(mockLayer));

      expect(subAgentsStore.state.byId[idToDelete]).toBeUndefined();
      expect(subAgentsStore.state.allIds).not.toContain(idToDelete);
      expect(subAgentsStore.state.byId[SAMPLE_CONFIG_2.id]).toEqual(SAMPLE_CONFIG_2);
    }),
  );

  itEffect("actions.setEnabled sets enabled flag on config", () =>
    Effect.gen(function* () {
      const mockList = () => Effect.succeed<readonly SubAgentConfig[]>([SAMPLE_CONFIG]);
      const mockSetEnabled = (_id: string, _enabled: boolean) =>
        Effect.succeed({ ...SAMPLE_CONFIG, enabled: false });

      const mockLayer = Layer.succeed(SubAgentsApi, {
        list: mockList,
        add: () => Effect.succeed(SAMPLE_CONFIG),
        update: () => Effect.succeed(SAMPLE_CONFIG),
        delete: () => Effect.succeed(undefined),
        setEnabled: mockSetEnabled,
      });

      yield* subAgentsStore.effects.load().pipe(Effect.provide(mockLayer));

      const id = SAMPLE_CONFIG.id;
      yield* subAgentsStore.actions.setEnabled(id, false).pipe(Effect.provide(mockLayer));

      expect(subAgentsStore.state.byId[id].enabled).toBe(false);
    }),
  );

  itEffect("enabledIds selector returns only enabled agent ids", () =>
    Effect.gen(function* () {
      const disabledAgent = { ...SAMPLE_CONFIG_2, enabled: false };
      const mockList = () => Effect.succeed<readonly SubAgentConfig[]>([SAMPLE_CONFIG, disabledAgent]);

      const mockLayer = Layer.succeed(SubAgentsApi, {
        list: mockList,
        add: () => Effect.succeed(SAMPLE_CONFIG),
        update: () => Effect.succeed(SAMPLE_CONFIG),
        delete: () => Effect.succeed(undefined),
        setEnabled: () => Effect.succeed(SAMPLE_CONFIG),
      });

      yield* subAgentsStore.effects.load().pipe(Effect.provide(mockLayer));

      expect(subAgentsStore.selectors.enabledIds()).toEqual([SAMPLE_CONFIG.id]);
    }),
  );
});
