import { Show, For, type JSX } from "solid-js";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import { skillsManifests$ } from "@codeman-frontend/plugins/skills/stores/skills.store";
import { CodemanCheckbox } from "@codeman-frontend/shared/components/internal/codeman-checkbox";
import { CheckCircle2, Package, XCircle } from "lucide-solid";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";

export function SkillsSection(): JSX.Element {
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

  const formatSource = (source: "preinstalled" | "user"): string =>
    source === "preinstalled" ? "Pre-installed" : "User";

  return (
    <ScrollArea class="flex-1 min-h-0" data-scroll-region="true" viewportClass="space-y-4 py-4 pl-4 pr-6">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Skills
        </h2>
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
              Skills are scanned during application startup from{' '}
              <code>~/.agents/skills/</code>.
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
                <CodemanCheckbox
                  value={isEnabled(skill.name)}
                  onChange={(v) => toggleSkill(skill.name, v)}
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
    </ScrollArea>
  );
}