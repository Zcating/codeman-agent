import { describe, it, expect } from "vitest";
import { applyCompactionToContext } from "./apply";
import type { Message } from "@codeman-frontend/shared/lib/types";

const msg = (id: string, role: string, content: string): Message => ({
  id,
  conversationId: "conv-1",
  role: role as "user" | "assistant",
  content,
  thinking: null,
  toolCalls: null,
  toolResults: null,
  model: null,
  inputTokens: null,
  outputTokens: null,
  createdAt: Date.now(),
  parts: [{ kind: "text", content }],
});

describe("applyCompactionToContext", () => {
  it("returns synthetic summary + tail parts when tailStartId is found", () => {
    const messages = [
      msg("m1", "user", "hello"),
      msg("m2", "assistant", "hi there"),
      msg("m3", "user", "follow up"),
      msg("m4", "assistant", "answer"),
    ];
    const result = applyCompactionToContext({
      messages,
      summary: "Earlier conversation summary",
      tailStartId: "m3",
    });
    expect(result[0]!.kind).toBe("text");
    if (result[0]!.kind === "text") {
      expect(result[0]!.content).toContain("Earlier conversation summary");
      expect((result[0] as any).synthetic).toBe(true);
    }
  });

  it("returns all parts when tailStartId is not found (stale fallback)", () => {
    const messages = [msg("m1", "user", "hello"), msg("m2", "assistant", "hi")];
    const result = applyCompactionToContext({
      messages,
      summary: "summary",
      tailStartId: "m999",
    });
    expect(result.length).toBe(2);
  });

  it("returns empty when no messages", () => {
    expect(applyCompactionToContext({ messages: [], summary: "x", tailStartId: "m1" })).toEqual([]);
  });

  it("skips compaction parts in tail (trigger messages are hidden)", () => {
    const messages = [
      msg("m1", "user", "hello"),
      {
        ...msg("m2", "user", ""),
        parts: [{ kind: "compaction" as const, summary: "compaction summary", tokensSaved: 100 }],
      },
      msg("m3", "assistant", "after compaction"),
    ];
    const result = applyCompactionToContext({
      messages,
      summary: "summary",
      tailStartId: "m3",
    });
    expect(result.some((p) => p.kind === "compaction")).toBe(false);
  });
});
