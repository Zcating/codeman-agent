import { describe, it, expect } from "vitest";
import { createAgentRuntime, type ProviderConfig } from "./runtime";
import type { Message } from "../../../shared/lib/types";

const mockProvider: ProviderConfig = {
  apiKey: "test-key",
  baseUrl: "https://mock.local",
  defaultModel: "mock-model",
  systemPrompt: "You are a helpful assistant.",
  tools: [],
};

const mockContext: Message[] = [
  {
    id: "u1",
    conversation_id: "c1",
    role: "user",
    content: "hi",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1,
  },
];

describe("createAgentRuntime()", () => {
  it("returns object with run + cancel methods", () => {
    const runtime = createAgentRuntime();
    expect(typeof runtime.run).toBe("function");
    expect(typeof runtime.cancel).toBe("function");
  });

  it("cancel() before run() does not throw", () => {
    const runtime = createAgentRuntime();
    expect(() => runtime.cancel()).not.toThrow();
  });

  it("run() returns a Stream", () => {
    const runtime = createAgentRuntime();
    const stream = runtime.run({ context: mockContext, provider: mockProvider });
    expect(stream).toBeDefined();
  });
});
