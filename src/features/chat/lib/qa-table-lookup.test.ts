import { describe, it, expect } from "vitest";
import { Either } from "effect";
import { lookupQaAnswer } from "./qa-table-lookup";

interface QaEntry {
  question: string;
  answer: string;
  default?: boolean;
}

describe("lookupQaAnswer", () => {
  it("T1: 首次匹配优先 — 子字符串匹配返回对应 answer", () => {
    const table: QaEntry[] = [{ question: "hello", answer: "world" }];
    const result = lookupQaAnswer(table, "hello there");
    expect(Either.isRight(result) && result.right).toBe("world");
  });

  it("T2: 首次匹配优先 — 多条匹配时返回第一条的 answer", () => {
    const table: QaEntry[] = [
      { question: "abc", answer: "1" },
      { question: "abc", answer: "2" },
    ];
    const result = lookupQaAnswer(table, "abc...");
    expect(Either.isRight(result) && result.right).toBe("1");
  });

  it("T3: 无匹配时有 default fallback 时返回 default 的 answer", () => {
    const table: QaEntry[] = [
      { question: "hi", answer: "x" },
      { question: "any", answer: "fallback", default: true },
    ];
    const result = lookupQaAnswer(table, "foo bar baz");
    expect(Either.isRight(result) && result.right).toBe("fallback");
  });

  it("T4: 无匹配且无 default 时返回 Either.left(QaMiss)", () => {
    const table: QaEntry[] = [{ question: "hi", answer: "x" }];
    const result = lookupQaAnswer(table, "other");
    expect(Either.isLeft(result) && result.left.question).toBe("other");
  });

  it("T5: 空 table 时返回 Either.left(QaMiss)", () => {
    const result = lookupQaAnswer([], "x");
    expect(Either.isLeft(result) && result.left.question).toBe("x");
  });
});
