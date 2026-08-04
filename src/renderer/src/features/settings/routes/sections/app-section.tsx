import type { JSX } from "solid-js";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { CodemanCheckbox } from "@codeman-frontend/shared/components/internal/codeman-checkbox";

export function AppSection(): JSX.Element {
  return (
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        App behavior
      </h2>
      <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <CodemanCheckbox
          value={appStore.state.value.startAtLogin}
          onChange={(v) => appStore.set({ startAtLogin: v })}
        />
        Start at login
      </label>
      <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
        The app starts in the taskbar. Click the window to bring it forward;
        use File → Quit to exit.
      </p>
    </section>
  );
}