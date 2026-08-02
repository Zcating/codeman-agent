/**
 * conversations/ipc.ts
 *
 * ADR-0046 D3: 接线到 data.ts Effect 函数，经 runMain 边界执行。
 * 删 db dep，删 better-sqlite3 import。
 */

import { ipcMain } from "electron";

import { runMain } from "../../runtime.js";
import {
  listConversations,
  getConversation,
  createConversation,
  archiveConversation,
  deleteConversation,
  renameConversation,
  listMessages,
  appendMessage,
  searchMessages,
  clearAllHistory,
} from "./data.js";

export function registerConversationsIpc(): void {
  ipcMain.handle("clearAllHistory", async () => {
    return runMain(clearAllHistory());
  });

  ipcMain.handle(
    "listConversations",
    async (_e, args: { includeArchived?: boolean } | null | undefined) => {
      const include = !!(args && typeof args === "object" && args.includeArchived);
      return runMain(listConversations(include));
    }
  );

  ipcMain.handle("getConversation", async (_e, args: { id: string }) => {
    return runMain(getConversation(args.id));
  });

  ipcMain.handle(
    "createConversation",
    async (
      _e,
      args: { title?: string; workspaceId?: string; systemPrompt?: string | null }
    ) => {
      return runMain(createConversation(args));
    }
  );

  ipcMain.handle("archiveConversation", async (_e, args: { id: string }) => {
    return runMain(archiveConversation(args.id));
  });

  ipcMain.handle("deleteConversation", async (_e, args: { id: string }) => {
    return runMain(deleteConversation(args.id));
  });

  ipcMain.handle(
    "renameConversation",
    async (_e, args: { id: string; title: string }) => {
      return runMain(renameConversation(args.id, args.title));
    }
  );

  ipcMain.handle(
    "listMessages",
    async (_e, args: { conversationId?: string }) => {
      return runMain(listMessages(args.conversationId ?? ""));
    }
  );

  ipcMain.handle(
    "appendMessage",
    async (
      _e,
      args: {
        conversationId?: string;
        role: string;
        content: string;
        thinking?: string | null;
        toolCalls?: string;
        toolResults?: string;
        model?: string | null;
      }
    ) => {
      return runMain(appendMessage(args));
    }
  );

  ipcMain.handle(
    "searchMessages",
    async (_e, args: { query: string; limit?: number }) => {
      // FTS 失败返回 []（data.ts searchMessagesSafe 已做 try/catch）
      return runMain(
        args.limit !== undefined
          ? searchMessages(args.query, args.limit)
          : searchMessages(args.query)
      );
    }
  );
}
