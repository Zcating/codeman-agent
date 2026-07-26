/* @refresh reload */
import "@codeman-frontend/index.css";
import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "@codeman-frontend/router";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { Effect, Exit } from "effect";
import { logger } from "@codeman-frontend/shared/lib/logger";
import * as chatStore from "@codeman-frontend/features/chat/stores/chat.store";
import { ToasterMount } from "@codeman-frontend/shared/components/internal/codeman-toast";

// Plugin initialization barrel — concrete descriptors register on import.
// This import is critical: it ensures plugin descriptors are registered with
// their real initialize Effects BEFORE bootstrap calls initializeAll().
import "@codeman-frontend/plugins";

import { initializeAll } from "@codeman-frontend/plugins";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";

// V1.8+ ADR-0016 D3: 启动 refresh 改用 Effect.runPromiseExit 替换 .catch, 失败时
// 用 formatAppError 输出 (保留 AppError 类型信息), 不用 String(e) 拍平。
//
// V3.1+ plugin-registry-startup Order A5:
// - Plugin initialization MUST complete before first render
// - Individual plugin failures do NOT block render; failures are logged only
// - Background refreshes (appStore.refresh, chatStore.loadWorkspaces) start AFTER render
// - Window e2e APIs are preserved

function bootstrap(): void {
  const root = document.getElementById("root");
  if (!root) {
    logger.error("[index.tsx] #root not found — cannot mount Solid");
    return;
  }

  // Start plugin initialization in background while we set up the rest.
  // We await it before render to satisfy Order A5: plugins must be ready
  // before first paint.
  const initPromise = Effect.runPromiseExit(initializeAll());

  // Expose appStore on window for e2e tests — e2e specs (e.g. mock-provider)
  // call invoke("update_settings", ...) to switch the active LLM provider, but
  // the in-memory Solid signal is the chat-view's source of truth. After
  // updating backend settings via raw IPC, the test must refresh appStore so
  // the next handleSend() picks up the new provider.
  // Production code never reads window.__appStore — this is test infra only.
  //
  // We expose `refreshAsync` (Promise-returning) rather than `refresh` (Effect-returning)
  // so the e2e test can `await page.evaluate(() => window.__appStore.refreshAsync())`
  // without needing to import Effect at the call site.
  type WindowWithAppStore = {
    __appStore?: {
      refresh: () => Effect.Effect<unknown, unknown>;
      refreshAsync: () => Promise<unknown>;
    };
    __chatStore?: {
      loadWorkspacesAsync: () => Promise<void>;
    };
  };
  (window as unknown as WindowWithAppStore).__appStore = {
    refresh: () => appStore.refresh(),
    refreshAsync: () =>
      Effect.runPromiseExit(appStore.refresh() as Effect.Effect<unknown, unknown>).then(
        (exit) => {
          if (Exit.isFailure(exit)) {
            throw new Error("appStore.refresh failed");
          }
          return exit.value;
        },
      ),
  };

  // Expose chatStore on window for e2e tests — tests create workspaces via raw
  // IPC (invoke("add_workspace", ...)) which bypasses the in-memory store.
  // After creating workspaces, the test must refresh chatStore so the
  // HomeAgentForm's workspace picker and sidebar see the new workspaces.
  (window as unknown as WindowWithAppStore).__chatStore = {
    loadWorkspacesAsync: () =>
      Effect.runPromiseExit(chatStore.loadWorkspaces() as Effect.Effect<void>).then(
        (exit) => {
          if (Exit.isFailure(exit)) {
            throw new Error("chatStore.loadWorkspaces failed");
          }
        },
      ),
  };

  // Now await plugin initialization BEFORE render.
  // Individual plugin failures are logged but do NOT block render.
  // The overall initializeAll() always succeeds after all plugins settle.
  initPromise.then((exit) => {
    if (Exit.isFailure(exit)) {
      // This should not happen with a properly implemented initializeAll
      // (it catches individual failures and returns result with failures map)
      logger.error(
        "[index.tsx] plugin initialization unexpectedly failed:",
        formatAppError(exit.cause),
      );
    } else {
      const result = exit.value;
      // Log individual plugin failures but do NOT block render
      if (result.failures.size > 0) {
        for (const [pluginId, error] of result.failures) {
          logger.warn(
            `[index.tsx] plugin "${pluginId}" initialization failed:`,
            formatAppError(error),
          );
        }
      }
    }

    // Render the RouterProvider FIRST with the in-memory defaultSettings, so the SPA
    // is visible immediately even if the Rust backend is slow or `get_settings` IPC
    // fails. We then refresh from backend in the background; on failure we keep the
    // defaults and log a warning (settings edits will still work — they write through
    // `appStore.forceFlush()` which catches its own errors).
    //
    // Previously this awaited `appStore.refresh()` before calling `render()`, which
    // produced a white screen whenever `get_settings` rejected (race during Tauri
    // startup, schema mismatch, etc.). See e2e canary spec 01.
    render(() => (
      <>
        <RouterProvider router={router} />
        <ToasterMount />
      </>
    ), root);

    // Best-effort background refresh. We swallow errors so they don't surface as
    // unhandled rejections — the user keeps the defaults and the UI works.
    // These start AFTER render (per plugin-registry-startup Order A5).
    Effect.runPromiseExit(appStore.refresh()).then((exit) => {
      if (Exit.isFailure(exit)) {
        logger.warn(
          "[index.tsx] background get_settings refresh failed — using defaults:",
          formatAppError(exit.cause),
        );
      }
    });

    // D8-W: 首次加载 workspace 列表到 chat.store
    Effect.runPromiseExit(chatStore.loadWorkspaces()).then((exit) => {
      if (Exit.isFailure(exit)) {
        logger.warn(
          "[index.tsx] loadWorkspaces failed — workspaces signal will be empty:",
          formatAppError(exit.cause),
        );
      }
    });
  });
}

bootstrap();
