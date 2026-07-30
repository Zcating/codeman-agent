import "@codeman-frontend/index.css";
import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "@codeman-frontend/router";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { Cause, Effect, Exit } from "effect";
import { logger } from "@codeman-frontend/shared/lib/logger";
import * as chatStore from "@codeman-frontend/features/chat/stores/chat.store";
import { ToasterMount } from "@codeman-frontend/shared/components/internal/codeman-toast";

import "@codeman-frontend/plugins";

import { initializeAll } from "@codeman-frontend/plugins";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";


function bootstrap(): void {
  const root = document.getElementById("root");
  if (!root) {
    logger.error("[index.tsx] #root not found — cannot mount Solid");
    return;
  }

  const initPromise = Effect.runPromiseExit(initializeAll());

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

  initPromise.then((exit) => {
    if (Exit.isFailure(exit)) {
      logger.error(
        "[index.tsx] plugin initialization unexpectedly failed:",
        formatAppError(exit.cause),
      );
    } else {
      const result = exit.value;
      if (result.failures.size > 0) {
        for (const [pluginId, error] of result.failures) {
          logger.warn(
            `[index.tsx] plugin "${pluginId}" initialization failed:`,
            formatAppError(Cause.fail(error)),
          );
        }
      }
    }

    render(() => (
      <>
        <RouterProvider router={router} />
        <ToasterMount />
      </>
    ), root);

    Effect.runPromiseExit(appStore.refresh()).then((exit) => {
      if (Exit.isFailure(exit)) {
        logger.warn(
          "[index.tsx] background get_settings refresh failed — using defaults:",
          formatAppError(exit.cause),
        );
      }
    });

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
