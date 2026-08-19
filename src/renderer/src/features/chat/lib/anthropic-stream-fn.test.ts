
import { describe, it, expect, vi } from "vitest";
import { anthropicStream } from "@codeman-frontend/core/llm/anthropic-stream-fn";

const { fakeApi } = vi.hoisted(() => ({
  fakeApi: {
    stream: vi.fn(),
    streamSimple: vi.fn(),
  },
}));

vi.mock("@earendil-works/pi-ai/api/anthropic-messages.lazy", () => ({
  anthropicMessagesApi: () => fakeApi,
}));

describe("anthropicStream", () => {
  it("delegates to anthropicMessagesApi().streamSimple when available (per CHANGELOG 167bbe6)", () => {
    const fakeStream = { fake: "streamSimple" };
    fakeApi.streamSimple.mockReturnValue(fakeStream);
    const model = {} as any;
    const context = {} as any;
    const options = { apiKey: "sk-x" } as any;
    const result = anthropicStream(model, context, options);
    expect(fakeApi.streamSimple).toHaveBeenCalledWith(model, context, options);
    expect(result).toBe(fakeStream);
  });
});

