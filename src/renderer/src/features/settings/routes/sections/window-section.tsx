import type { JSX } from "solid-js";

export function WindowSection(): JSX.Element {
  return (
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Window
      </h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 italic">
        Window settings (default size 1280×1280, min 800×800; position is
        remembered)
      </p>
    </section>
  );
}