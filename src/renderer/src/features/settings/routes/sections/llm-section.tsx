import type { JSX } from "solid-js";

export function LlmSection(): JSX.Element {
  return (
    <div class="flex flex-col flex-1 min-h-0 p-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        LLM Providers
      </h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
        Provider configuration is managed through pi ModelRuntime.
      </p>
    </div>
  );
}
