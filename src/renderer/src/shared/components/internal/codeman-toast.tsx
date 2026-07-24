//! codeman-toast.tsx — Imperative codemanToast.error / .success API.
//! Module-level singleton toaster shared between ToasterMount and codemanToast.
//! Per ADR-0029 D5: based on @ark-ui/solid Toast primitive.

import { type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import {
  createToaster,
  Toaster as ArkToaster,
  Toast as ArkToast,
} from "@ark-ui/solid";
import { AlertCircle, CheckCircle2 } from "lucide-solid";
import { cn } from "../../lib/cn";

// ─── Singleton toaster ───────────────────────────────────────────────────────
//
// Module-level singleton: createToaster() at module load, shared between
// ToasterMount (consumer of DOM render) and codemanToast (writer of toast
// entries). Mirrors the codeman-dialog pattern of a module-level imperative
// API backed by a Portal-mounted React-style tree.

const toaster = createToaster({
  placement: "bottom-end",
  overlap: false,
  duration: 5000,
});

// ─── Public API ─────────────────────────────────────────────────────────────

export interface CodemanToastOptions {
  duration?: number;
}

export const codemanToast = {
  error(message: string, opts?: CodemanToastOptions): void {
    toaster.error({ title: message, ...(opts ?? {}) });
  },
  success(message: string, opts?: CodemanToastOptions): void {
    toaster.success({ title: message, ...(opts ?? {}) });
  },
};

// ─── ToasterMount ────────────────────────────────────────────────────────────
//
// Render once at the app root (mount in src/index.tsx). Subsequent codemanToast
// calls render into this Toaster.

export function ToasterMount(): JSX.Element {
  return (
    <Portal>
      <ArkToaster toaster={toaster}>
        {(toast) => (
          <ArkToast.Root
            class={cn(
              "flex items-start gap-3 rounded-md border p-4 shadow-lg",
              "bg-background text-foreground",
              "min-w-[320px] max-w-[420px]",
              "data-[type=error]:border-red-500 data-[type=error]:bg-red-50 data-[type=error]:text-red-900",
              "dark:data-[type=error]:bg-red-900/20 dark:data-[type=error]:text-red-200",
              "data-[type=success]:border-green-500 data-[type=success]:bg-green-50 data-[type=success]:text-green-900",
              "dark:data-[type=success]:bg-green-900/20 dark:data-[type=success]:text-green-200",
            )}
          >
            {toast().type === "error" ? (
              <AlertCircle
                class="h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
            ) : (
              <CheckCircle2
                class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
                aria-hidden="true"
              />
            )}
            <div class="flex-1 min-w-0">
              <ArkToast.Title class="text-sm font-medium break-words">
                {toast().title}
              </ArkToast.Title>
              {toast().description ? (
                <ArkToast.Description class="mt-1 text-xs text-muted-foreground break-words">
                  {toast().description}
                </ArkToast.Description>
              ) : null}
            </div>
            <ArkToast.CloseTrigger
              class="ml-2 text-muted-foreground hover:text-foreground"
              aria-label="关闭"
            >
              ×
            </ArkToast.CloseTrigger>
          </ArkToast.Root>
        )}
      </ArkToaster>
    </Portal>
  );
}