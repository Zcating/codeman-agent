/* @refresh reload */
import "./index.css";
import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "./router";
import { appStore } from "./shared/stores/app.store";
import { Effect } from "effect";

const root = document.getElementById("root");

// Render the RouterProvider FIRST with the in-memory defaultSettings, so the SPA
// is visible immediately even if the Rust backend is slow or `get_settings` IPC
// fails. We then refresh from backend in the background; on failure we keep the
// defaults and log a warning (settings edits will still work — they write through
// `appStore.forceFlush()` which catches its own errors).
//
// Previously this awaited `appStore.refresh()` before calling `render()`, which
// produced a white screen whenever `get_settings` rejected (race during Tauri
// startup, schema mismatch, etc.). See e2e canary spec 01.
function bootstrap() {
  if (!root) {
    console.error("[index.tsx] #root not found — cannot mount Solid");
    return;
  }
  render(() => <RouterProvider router={router} />, root);

  // Best-effort background refresh. We swallow errors so they don't surface as
  // unhandled rejections — the user keeps the defaults and the UI works.
  Effect.runPromise(appStore.refresh()).catch((e: unknown) => {
    console.warn("[index.tsx] background get_settings refresh failed — using defaults:", e);
  });
}

bootstrap();
