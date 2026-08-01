import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerWebfetchIpc } from "./ipc.js";
import { CancelMap } from "./cancel-map.js";

const fakeIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({ ipcMain: fakeIpcMain }));

vi.mock("./index.js", () => ({
  fetchSafe: vi.fn(),
}));

import { fetchSafe } from "./index.js";

describe("registerWebfetchIpc", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    vi.clearAllMocks();
  });

  it("registers abortRequest and webfetch:fetch channels", () => {
    registerWebfetchIpc({ cancelMap: new CancelMap() });
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(["abortRequest", "webfetch:fetch"]);
    expect(fakeIpcMain.handle).toHaveBeenCalledTimes(2);
  });

  it("abortRequest handler returns null for unknown id without throwing", () => {
    const cancelMap = new CancelMap();
    registerWebfetchIpc({ cancelMap });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "abortRequest",
    )![1] as (e: unknown, args: { requestId: string }) => unknown;
    expect(() => handler(undefined, { requestId: "missing" })).not.toThrow();
    expect(handler(undefined, { requestId: "missing" })).toBeNull();
  });

  it("abortRequest handler calls cancelMap.abort(id) and returns null", () => {
    const cancelMap = new CancelMap();
    cancelMap.register("id-1", new AbortController());
    const abortSpy = vi.spyOn(cancelMap, "abort");
    registerWebfetchIpc({ cancelMap });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "abortRequest",
    )![1] as (e: unknown, args: { requestId: string }) => unknown;
    const result = handler(undefined, { requestId: "id-1" });
    expect(abortSpy).toHaveBeenCalledWith("id-1");
    expect(result).toBeNull();
  });

  it("webfetch:fetch handler returns fetchSafe result", async () => {
    vi.mocked(fetchSafe).mockResolvedValue({
      status: 200,
      contentType: "text/html",
      body: "hi",
    } as never);
    registerWebfetchIpc({ cancelMap: new CancelMap() });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "webfetch:fetch",
    )![1] as (e: unknown, args: { url: string; timeout?: number }) => Promise<unknown>;
    const result = await handler(undefined, { url: "https://example.com" });
    expect(fetchSafe).toHaveBeenCalledWith("https://example.com", { timeoutSeconds: undefined });
    expect(result).toEqual({ status: 200, contentType: "text/html", body: "hi" });
  });

  it("webfetch:fetch handler rethrows when fetchSafe rejects", async () => {
    const boom = new Error("boom");
    vi.mocked(fetchSafe).mockRejectedValue(boom);
    registerWebfetchIpc({ cancelMap: new CancelMap() });
    const handler = fakeIpcMain.handle.mock.calls.find(
      (c) => c[0] === "webfetch:fetch",
    )![1] as (e: unknown, args: { url: string; timeout?: number }) => Promise<unknown>;
    await expect(handler(undefined, { url: "https://example.com" })).rejects.toThrow("boom");
  });
});

