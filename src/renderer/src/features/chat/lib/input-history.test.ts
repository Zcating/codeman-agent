
import { describe, it, expect, beforeEach } from "vitest";
import {
  INPUT_HISTORY_STORAGE_KEY,
  INPUT_HISTORY_MAX_ENTRIES,
  loadHistory,
  saveHistory,
  recordEntry,
} from "@codeman-frontend/features/chat/lib/input-history";

beforeEach(() => {
  window.localStorage.clear();
});


describe("loadHistory", () => {
  it("localStorage 为空时返回空数组", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("读回之前 save 的历史", () => {
    saveHistory(["hello", "world"]);
    expect(loadHistory()).toEqual(["hello", "world"]);
  });

  it("JSON 解析失败时不抛错,返回空", () => {
    window.localStorage.setItem(INPUT_HISTORY_STORAGE_KEY, "not json{");
    expect(loadHistory()).toEqual([]);
  });

  it("非数组内容返回空", () => {
    window.localStorage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify("string-not-array"));
    expect(loadHistory()).toEqual([]);
  });

  it("数组中混入非 string 元素 → 仅保留 string", () => {
    window.localStorage.setItem(
      INPUT_HISTORY_STORAGE_KEY,
      JSON.stringify(["a", 42, null, "b", { x: 1 }, "c"]),
    );
    expect(loadHistory()).toEqual(["a", "b", "c"]);
  });

  it("超过 MAX_ENTRIES 时截断到上限", () => {
    const oversized = Array.from({ length: 150 }, (_, i) => `e${i}`);
    window.localStorage.setItem(
      INPUT_HISTORY_STORAGE_KEY,
      JSON.stringify(oversized),
    );
    const loaded = loadHistory();
    expect(loaded.length).toBe(INPUT_HISTORY_MAX_ENTRIES);
    expect(loaded[0]).toBe("e0");
    expect(loaded[99]).toBe("e99");
  });

  it("null 字符串（key 不存在）视作空", () => {
    expect(loadHistory()).toEqual([]);
  });
});


describe("saveHistory", () => {
  it("写入 localStorage 的 JSON 字符串", () => {
    saveHistory(["test"]);
    const raw = window.localStorage.getItem(INPUT_HISTORY_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(["test"]);
  });

  it("QuotaExceededError 等静默吞,不阻塞调用", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    };
    expect(() => saveHistory(["x"])).not.toThrow();
    window.localStorage.setItem = original;
  });

  it("空数组也能写（不会写出 null）", () => {
    saveHistory([]);
    const raw = window.localStorage.getItem(INPUT_HISTORY_STORAGE_KEY);
    expect(raw).toBe("[]");
  });
});


describe("recordEntry", () => {
  it("空数组 + 内容 → prepend", () => {
    expect(recordEntry([], "hello")).toEqual(["hello"]);
  });

  it("已有内容 + 新条目 → 新条目置顶", () => {
    expect(recordEntry(["world"], "hello")).toEqual(["hello", "world"]);
  });

  it("trim 后空白 → 不变（Q3b=I）", () => {
    expect(recordEntry([], "")).toEqual([]);
    expect(recordEntry(["a"], "   ")).toEqual(["a"]);
    expect(recordEntry(["a"], "\t\n")).toEqual(["a"]);
    expect(recordEntry(["a"], " \t \n ")).toEqual(["a"]);
  });

  it("trim 后非空时才用 trim 值", () => {
    expect(recordEntry([], "  hello  ")).toEqual(["hello"]);
    expect(recordEntry([], "hello")).toEqual(["hello"]);
  });

  it("连续相同内容 → 不变（Q3a=II dedup）", () => {
    expect(recordEntry(["hello"], "hello")).toEqual(["hello"]);
    expect(recordEntry(["hello"], "  hello  ")).toEqual(["hello"]);
  });

  it("超过 MAX_ENTRIES → FIFO 淘汰最旧", () => {
    const initial = Array.from({ length: 100 }, (_, i) => `e${i}`);
    const result = recordEntry(initial, "new");
    expect(result.length).toBe(INPUT_HISTORY_MAX_ENTRIES);
    expect(result[0]).toBe("new");
    expect(result[99]).toBe("e98");
  });

  it("正好 100 条 + 新条目 → 长仍是 100", () => {
    const initial = Array.from({ length: 100 }, (_, i) => `e${i}`);
    const result = recordEntry(initial, "new");
    expect(result).toHaveLength(100);
    expect(result[0]).toBe("new");
    expect(result[1]).toBe("e0");
  });

  it("99 条 + 新条目 → 长变 100,不淘汰", () => {
    const initial = Array.from({ length: 99 }, (_, i) => `e${i}`);
    const result = recordEntry(initial, "new");
    expect(result).toHaveLength(100);
    expect(result[0]).toBe("new");
    expect(result[99]).toBe("e98");
  });

  it("不修改输入数组（pure）", () => {
    const initial = ["a", "b"];
    const result = recordEntry(initial, "c");
    expect(initial).toEqual(["a", "b"]);
    expect(result).not.toBe(initial);
    expect(result).toEqual(["c", "a", "b"]);
  });

  it("content 前后空白被 trim 但保留中间内容", () => {
    expect(recordEntry([], "  hello world  ")).toEqual(["hello world"]);
  });
});
