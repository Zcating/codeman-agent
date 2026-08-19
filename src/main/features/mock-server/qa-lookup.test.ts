// qa-lookup.test.ts — lookupQaAnswer 的 unit 测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect } from "vitest";
import { lookupQaAnswer } from "./qa-lookup";

describe("lookupQaAnswer — substring match", () => {
  it("T1: 第一条 entry 的 question 包含在 userText → Right(entry with .turns[0].text)", () => {
    const table = [
      { question: "hello", turns: [{ text: "world" }] },
      { question: "ping", turns: [{ text: "pong" }] },
    ];
    const result = lookupQaAnswer(table, "say hello");
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.turns[0].text).toBe("world");
      expect(result.right.question).toBe("hello");
    }
  });

  it("T2: 多 entry + 多字串,first-wins 命中", () => {
    const table = [
      { question: "ab", turns: [{ text: "match-ab" }] },
      { question: "abcd", turns: [{ text: "match-abcd" }] },
    ];
    const result = lookupQaAnswer(table, "abcdef");
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.turns[0].text).toBe("match-ab");
    }
  });

  it("T3: substring miss → 退到 default entry", () => {
    const table = [
      { question: "hello", turns: [{ text: "world" }] },
      { question: "x", turns: [{ text: "fallback" }], default: true },
    ];
    const result = lookupQaAnswer(table, "这条消息不匹配");
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.turns[0].text).toBe("fallback");
    }
  });

  it("T4: 多个 default:true → first-wins 选第一个", () => {
    const table = [
      { question: "a", turns: [{ text: "first-default" }], default: true },
      { question: "b", turns: [{ text: "second-default" }], default: true },
    ];
    const result = lookupQaAnswer(table, "no match here");
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.turns[0].text).toBe("first-default");
    }
  });

  it("T5: miss + 无 default → Left(QaMiss) 带 question 回声", () => {
    const table = [{ question: "hello", turns: [{ text: "world" }] }];
    const result = lookupQaAnswer(table, "no match");
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("QaMiss");
      expect(result.left.question).toBe("no match");
    }
  });

  it("T6: 空 table → Left(QaMiss)", () => {
    const result = lookupQaAnswer([], "any question");
    expect(result._tag).toBe("Left");
  });
});
