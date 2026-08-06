import type { JSX } from "solid-js";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";

export function WindowSection(): JSX.Element {
  return (
    <ScrollArea class="flex-1 min-h-0" data-scroll-region="true" viewportClass="space-y-4 py-4 pl-4 pr-6">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Window
      </h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 italic">
        Window settings (default size 1280×1280, min 800×800; position is
        remembered)
      </p>
    </ScrollArea>
  );
}