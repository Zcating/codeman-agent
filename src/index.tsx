/* @refresh reload */
import "./index.css";
import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "./router";
import { appStore } from "./shared/stores/app.store";
import { Effect, Exit } from "effect";
import { logger } from "./shared/lib/logger";
import * as chatStore from "./features/chat/stores/chat.store";

// Render the RouterProvider FIRST with the in-memory defaultSettings, so the SPA
// is visible immediately even if the Rust backend is slow or `get_settings` IPC
// fails. We then refresh from backend in the background; on failure we keep the
// defaults and log a warning (settings edits will still work — they write through
// `appStore.forceFlush()` which catches its own errors).
//
// Previously this awaited `appStore.refresh()` before calling `render()`, which
// produced a white screen whenever `get_settings` rejected (race during Tauri
// startup, schema mismatch, etc.). See e2e canary spec 01.
//
// V1.8+ ADR-0016 D3: 启动 refresh 改用 Effect.runPromiseExit 替换 .catch, 失败时
// 用 formatAppError 输出 (保留 AppError 类型信息), 不用 String(e) 拍平。
import { formatAppError } from "./shared/lib/format-app-error";

function bootstrap() {
  const root = document.getElementById("root");
  if (!root) {
    logger.error("[index.tsx] #root not found — cannot mount Solid");
    return;
  }
  render(() => <RouterProvider router={router} />, root);

  // Best-effort background refresh. We swallow errors so they don't surface as
  // unhandled rejections — the user keeps the defaults and the UI works.
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

  // D8-W: e2e bridge for chatStore workspace methods
  type WindowWithChatStore = {
    __chatStore?: {
      loadWorkspaces: () => Promise<void>;
      setSelectedWorkspaceId: (id: string | null) => void;
      /** Create a conversation without sending a message (avoids LLM consumption). Returns the new conv id. */
      createConversationOnly: (workspaceId: string, title?: string) => Promise<string>;
      /** Check if a conversation is currently streaming. Used by e2e D5 test. */
      getStreamingMessageId: (convId: string) => string | null;
    };
  };
  (window as unknown as WindowWithChatStore).__chatStore = {
    loadWorkspaces: () =>
      Effect.runPromiseExit(chatStore.loadWorkspaces()).then((exit) => {
        if (Exit.isFailure(exit)) {
          throw new Error("loadWorkspaces failed");
        }
      }),
    setSelectedWorkspaceId: (id: string | null) => {
      chatStore.setSelectedWorkspaceId(id);
    },
    createConversationOnly: async (workspaceId: string, title?: string): Promise<string> => {
      await chatStore.createConversation(workspaceId, title ?? "E2E Test Conv");
      // Return the active conversation id after creation
      return chatStore.activeId$() ?? "";
    },
    getStreamingMessageId: (convId: string) => chatStore.store.byId[convId]?.streamingMessageId ?? null,
  };
}

bootstrap();
