import { Show, createSignal, type JSX } from "solid-js";
import { Trash2 } from "lucide-solid";
import { PageLayoutShell } from "@codeman-frontend/shared/components/internal/page-layout-shell";
import { clearAllHistoryBridge } from "@codeman-frontend/features/settings/lib/clear-all-history-bridge";
import { logger } from "@codeman-frontend/shared/lib/logger";

export function AdvancedSection(): JSX.Element {
  const [confirmClear, setConfirmClear] = createSignal(false);

  const clearHistory = async (): Promise<void> => {
    const ok = await clearAllHistoryBridge();
    if (ok) {
      setConfirmClear(false);
    } else {
      logger.error("[AdvancedSection] clearAllHistory failed");
    }
  };

  return (
    <PageLayoutShell
      title="Privacy"
      body={
        <Show
          when={!confirmClear()}
          fallback={
            <div class="p-4 border border-amber-300 dark:border-amber-700 rounded-md bg-amber-50 dark:bg-amber-900/20 space-y-2">
              <p class="text-sm text-amber-900 dark:text-amber-200">
                Delete all conversations? This cannot be undone.
              </p>
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => void clearHistory()}
                  class="px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  <Trash2 class="h-4 w-4 inline mr-1" />
                  Yes, delete all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  class="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        >
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            class="px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <Trash2 class="h-4 w-4 inline mr-1" />
            Clear all history…
          </button>
        </Show>
      }
    />
  );
}
