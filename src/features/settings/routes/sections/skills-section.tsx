//! SkillsSection — `/settings/skills` route component.
//!
//! Lists all skills (from src/plugins/skills/stores/skills.store) with toggle
//! controls + Refresh button. Writes to `appStore.settings.enabledSkills` array.
//!
//! V3.1 ADR-0031 Wave A6.

import { Show, For, type JSX, createSignal } from "solid-js";
import { Effect, Exit } from "effect";
import { appStore } from "../../../../shared/stores/app.store";
import { settingsSaver } from "../../lib/settings-saver";
import {
  refreshManifests,
  skillsManifests$,
} from "../../../../plugins/skills/stores/skills.store";
import { codemanToast } from "../../../../shared/components/internal/codeman-toast";
import { CheckCircle2, Package, RefreshCw, XCircle } from "lucide-solid";

export function SkillsSection(): JSX.Element {
  const [refreshing, setRefreshing] = createSignal(false);

  const enabledSet = (): Set<string> =>
    new Set(appStore.state.value.enabledSkills ?? []);

  const isEnabled = (name: string): boolean => enabledSet().has(name);

  const toggleSkill = (name: string, next: boolean): void => {
    const current = appStore.state.value.enabledSkills ?? [];
    const updated = next
      ? Array.from(new Set([...current, name]))
      : current.filter((n) => n !== name);
    appStore.set({ enabledSkills: updated });
    settingsSaver.scheduleSave();
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    const exit = await Effect.runPromiseExit(refreshManifests());
    setRefreshing(false);
    Exit.match(exit, {
      onSuccess: () => {
        codemanToast.success(`Refreshed ${skillsManifests$().length} skill(s)`);
      },
      onFailure: (cause) => {
        const errMsg =
          cause._tag === "Fail"
            ? String(cause.error)
            : "(unknown error)";
        codemanToast.error(`Refresh failed: ${errMsg}`);
      },
    });
  };

  const formatSource = (source: "preinstalled" | "user"): string =>
    source === "preinstalled" ? "Pre-installed" : "User";

  return (
    <section class="space-y-4">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Skills
        </h2>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing()}
          class="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-foreground disabled:opacity-50 transition-colors"
          aria-label="Refresh skills list"
          data-testid="skills-refresh"
        >
          <RefreshCw
            class={`h-4 w-4 ${refreshing() ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>{refreshing() ? "Refreshing…" : "Refresh"}</span>
        </button>
      </header>

      <p class="text-xs text-zinc-500 dark:text-zinc-400">
        Skills augment the system prompt with instructions the LLM follows.
        Enable a skill to make its instructions available; the LLM can request
        the full body via the <code>_load_skill</code> meta-tool when needed.
      </p>

      <Show
        when={skillsManifests$().length > 0}
        fallback={
          <div class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
            <Package class="h-8 w-8 mx-auto text-zinc-400 dark:text-zinc-600" aria-hidden="true" />
            <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No skills found.
            </p>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Click Refresh to scan <code>~/.agents/skills/</code>, or add a
              <code>SKILL.md</code> file under a directory there.
            </p>
          </div>
        }
      >
        <ul class="space-y-2" data-testid="skills-list">
          <For each={skillsManifests$()}>
            {(skill) => (
              <li
                class="flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3"
                data-testid={`skill-item-${skill.name}`}
              >
                <input
                  type="checkbox"
                  checked={isEnabled(skill.name)}
                  onChange={(e) =>
                    toggleSkill(skill.name, e.currentTarget.checked)
                  }
                  class="mt-0.5 rounded text-primary-500 focus:ring-primary-500 w-4 h-4"
                  aria-label={`Enable ${skill.name}`}
                  data-testid={`skill-toggle-${skill.name}`}
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <code class="text-sm font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {skill.name}
                    </code>
                    <span
                      class={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md ${
                        skill.source === "preinstalled"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {isEnabled(skill.name) ? (
                        <CheckCircle2 class="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <XCircle class="h-3 w-3" aria-hidden="true" />
                      )}
                      <span>{formatSource(skill.source)}</span>
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {skill.description}
                  </p>
                  <p class="mt-1 text-xs text-zinc-400 dark:text-zinc-600 font-mono truncate">
                    {skill.path}
                  </p>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}