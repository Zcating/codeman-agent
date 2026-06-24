import { describe, it, expect } from "vitest";
import { createAgentRuntime, type ProviderConfig, type RuntimeEvent } from "./runtime";
import { Stream, Effect } from "effect";
import type { Message } from "../../../shared/lib/types";
import { vi } from "vitest";

// Mock pi-agent Agent
vi.mock("@mariozechner/pi-agent", () => {
  return {
    Agent: vi.fn().mockImplementation(function _MockAgent(_config: unknown) {
      let handler: ((evt: unknown) => void) | null = null;
      return {
        subscribe: (h: (evt: unknown) => void) => {
          handler = h;
          return () => {
            handler = null;
          };
        },
        prompt: vi.fn().mockImplementation(async (_userContent: string) => {
          // Simulate transport.run() yielding events by directly calling the handler
          // (transport.run() is what pi-agent.Agent.prompt() calls internally)
          if (handler) {
            handler({ type: "agent_start" });
            handler({
              type: "message_update",
              message: { content: [{ type: "text", text: "hello" }] },
            });
            handler({
              type: "message_end",
              message: { content: [{ type: "text", text: "hello" }] },
            });
            handler({
              type: "agent_end",
              messages: [{ content: [{ type: "text", text: "hello" }] }],
            });
          }
        }),
        appendMessage: vi.fn(),
      };
    }),
  };
});

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

describe("run() — event translation", () => {
  it("translates message_update text → token event", async () => {
    const runtime = createAgentRuntime();
    const events: RuntimeEvent[] = [];
    const program = Stream.runForEach(
      runtime.run({ context: mockContext, provider: mockProvider }),
      (e) => Effect.sync(() => events.push(e)),
    );
    await Effect.runPromise(program.pipe(Effect.scoped));
    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toMatchObject({ type: "token", content: "hello" });
  });
});
