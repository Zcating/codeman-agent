
import { describe, it, expect, vi } from "vitest";
import { anthropicStream } from "./anthropic-stream-fn";

const { fakeApi } = vi.hoisted(() => ({
  fakeApi: { stream: vi.fn(), streamSimple: vi.fn() },
}));

vi.mock("@earendil-works/pi-ai/api/anthropic-messages.lazy", () => ({
  anthropicMessagesApi: () => fakeApi,
}));

describe("anthropicStream", () => {
  it("delegates to anthropicMessagesApi().stream", () => {
    const fakeStream = { fake: "stream" };
    fakeApi.stream.mockReturnValue(fakeStream);
    const model = {} as any;
    const context = {} as any;
    const options = { apiKey: "sk-x" } as any;
    const result = anthropicStream(model, context, options);
    expect(fakeApi.stream).toHaveBeenCalledWith(model, context, options);
    expect(result).toBe(fakeStream);
  });
});
