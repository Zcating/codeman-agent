import { describe, it, expect } from "vitest";
import { toCompactionEntry, fromCompactionEntry, type CompactionEntry } from "./mappers.js";

describe("toCompactionEntry", () => {
  it("maps snake_case SQLite row to camelCase CompactionEntry", () => {
    const row = {
      id: "cmp-1",
      conversation_id: "conv-1",
      summary: "This is a summary",
      model: "gpt-4o",
      tokens_before: 1500,
      kind: "auto",
      created_at: 1700000000000,
      first_kept_message_id: "msg-42",
    };
    expect(toCompactionEntry(row)).toEqual({
      id: "cmp-1",
      conversationId: "conv-1",
      summary: "This is a summary",
      model: "gpt-4o",
      tokensBefore: 1500,
      kind: "auto",
      createdAt: 1700000000000,
      firstKeptMessageId: "msg-42",
    });
  });

  it("maps kind 'manual' correctly", () => {
    const row = {
      id: "cmp-2",
      conversation_id: "conv-2",
      summary: "Manual compaction",
      model: "claude-3-5-sonnet",
      tokens_before: 3000,
      kind: "manual",
      created_at: 1700000001000,
      first_kept_message_id: "msg-99",
    };
    expect(toCompactionEntry(row).kind).toBe("manual");
  });
});

describe("fromCompactionEntry", () => {
  it("returns INSERT-ready values with createdAt as number (epoch ms)", () => {
    const entry: CompactionEntry = {
      id: "cmp-1",
      conversationId: "conv-1",
      summary: "Summary text",
      model: "gpt-4o",
      tokensBefore: 1500,
      kind: "auto",
      createdAt: 1700000000000,
      firstKeptMessageId: "msg-42",
    };
    expect(fromCompactionEntry(entry)).toEqual([
      "cmp-1",
      "conv-1",
      "Summary text",
      "gpt-4o",
      1500,
      "auto",
      1700000000000,
      "msg-42",
    ]);
  });

  it("handles kind 'manual'", () => {
    const entry: CompactionEntry = {
      id: "cmp-2",
      conversationId: "conv-2",
      summary: "Manual compaction summary",
      model: "claude-3-5-sonnet",
      tokensBefore: 3000,
      kind: "manual",
      createdAt: 1700000001000,
      firstKeptMessageId: "msg-99",
    };
    const values = fromCompactionEntry(entry);
    expect(values[5]).toBe("manual"); // kind is at index 5
  });
});
