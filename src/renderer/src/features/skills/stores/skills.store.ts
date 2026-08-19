import { createSignal, type Accessor } from "solid-js";
import { Effect } from "effect";
import { SkillsApi, SkillsApiLive } from "@codeman-frontend/shared/apis";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";


const [manifests, setManifestsInternal] = createSignal<SkillManifest[]>([]);

export const skillsManifests$: Accessor<SkillManifest[]> = manifests;


export function setManifests(next: SkillManifest[]): void {
  setManifestsInternal(next);
}

export function resetManifests(): void {
  setManifestsInternal([]);
}

export const refreshManifests = Effect.fn(function* () {
  const svc = yield* SkillsApi;
  const fresh = yield* svc.scan();
  setManifestsInternal(fresh);
  return fresh;
}, Effect.provide(SkillsApiLive));

export const initializeSkillsManifests = Effect.fn(
  function* () {
    const svc = yield* SkillsApi;
    const fresh = yield* svc.scan();
    setManifestsInternal(fresh);
  },
  Effect.provide(SkillsApiLive),
);

export function _resetSkillsStoreForTest(): void {
  setManifestsInternal([]);
}