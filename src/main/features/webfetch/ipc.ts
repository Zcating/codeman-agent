import { ipcMain } from "electron";
import { fetchSafe } from "./index.js";
import { sandboxHandler } from "../../lib/sandbox-handler.js";
import type { CancelMap } from "./cancel-map.js";

export function registerWebfetchIpc(deps: { cancelMap: CancelMap }): void {
  ipcMain.handle("abortRequest", (_e, args: { requestId: string }) => {
    deps.cancelMap.abort(args.requestId);
    return null;
  });

  ipcMain.handle("webfetch:fetch", sandboxHandler(async (args: { url: string; timeout?: number }) => {
    const result = await fetchSafe(args.url, { timeoutSeconds: args.timeout });
    return {
      status: result.status,
      contentType: result.contentType,
      body: result.body,
    };
  }));
}
