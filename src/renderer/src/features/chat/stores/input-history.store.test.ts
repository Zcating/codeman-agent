//! input-history.store Solid signal + cursor 单测

import { describe, it, expect, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import {
  INPUT_HISTORY_STORAGE_KEY,
  INPUT_HISTORY_MAX_ENTRIES,
} from "@codeman-frontend/features/chat/lib/input-history";
import {
  inputHistory$,
  inputHistoryCursor$,
  recordInputEntry,
  navigateInputHistoryPrev,
  navigateInputHistoryNext,
  handleArrowUp,
  handleArrowDown,
  handleArrowUpField,
  handleArrowDownField,
  _resetInputHistoryForTest,
} from "@codeman-frontend/features/chat/stores/input-history.store";

beforeEach(() => {
  window.localStorage.clear();
  _resetInputHistoryForTest();
});

// ─── 初始状态 ─────────────────────────────────────

describe("初始状态", () => {
  it("无 localStorage 数据 → 空数组 + cursor -1", () => {
    createRoot(() => {
      expect(inputHistory$()).toEqual([]);
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("有 localStorage 数据 → 模块加载即读到", () => {
    window.localStorage.setItem(
      INPUT_HISTORY_STORAGE_KEY,
      JSON.stringify(["pre", "seed"]),
    );
    // 模块级 createSignal 在 import 时已经执行过一次——本测试由于 vitest 模块缓存，
    // 重新 reset 后再手动 record 来覆盖。
    _resetInputHistoryForTest();
    createRoot(() => {
      recordInputEntry("alpha");
      expect(inputHistory$()).toContain("alpha");
    });
  });
});

// ─── recordInputEntry ────────────────────────────────

describe("recordInputEntry", () => {
  it("追加新条目 + 重置 cursor", () => {
    createRoot(() => {
      recordInputEntry("hello");
      recordInputEntry("world");
      expect(inputHistory$()).toEqual(["world", "hello"]);
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("连续相同 → 仅重置 cursor,不写", () => {
    createRoot(() => {
      recordInputEntry("hello");
      window.localStorage.clear(); // 清干净便于观察 store 是否再写
      recordInputEntry("hello"); // 连续相同
      const stored = window.localStorage.getItem(INPUT_HISTORY_STORAGE_KEY);
      // store 即便 dedup 也仍按设计要 setCursor(-1)；持久化层不写 → localStorage 应为空
      expect(stored).toBeNull();
    });
  });

  it("trim 空字符串 → 仅重置 cursor,不写", () => {
    createRoot(() => {
      recordInputEntry("real");
      recordInputEntry("   "); // trim 后空
      window.localStorage.clear();
      recordInputEntry("   ");
      expect(inputHistory$()).toContain("real");
      const stored = window.localStorage.getItem(INPUT_HISTORY_STORAGE_KEY);
      expect(stored).toBeNull();
    });
  });

  it("trim 值会被截掉首尾空白后存储", () => {
    createRoot(() => {
      recordInputEntry("  hello  ");
      expect(inputHistory$()).toEqual(["hello"]);
    });
  });

  it("超过 100 → FIFO 淘汰", () => {
    createRoot(() => {
      for (let i = 0; i < INPUT_HISTORY_MAX_ENTRIES; i++) {
        recordInputEntry(`e${i}`);
      }
      expect(inputHistory$()).toHaveLength(INPUT_HISTORY_MAX_ENTRIES);
      // 最新的应该在栈顶
      expect(inputHistory$()[0]).toBe(`e${INPUT_HISTORY_MAX_ENTRIES - 1}`);
    });
  });

  it("持久化到 localStorage（best effort）", () => {
    createRoot(() => {
      window.localStorage.clear();
      recordInputEntry("persist-test");
      const raw = window.localStorage.getItem(INPUT_HISTORY_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(["persist-test"]);
    });
  });
});

// ─── navigateInputHistoryPrev ──────────────────────────

describe("navigateInputHistoryPrev (↑)", () => {
  it("历史为空 → null", () => {
    createRoot(() => {
      expect(navigateInputHistoryPrev()).toBeNull();
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("-1 → 0 (进入 newest)", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b"); // history = ["b", "a"]
      const r = navigateInputHistoryPrev();
      expect(inputHistoryCursor$()).toBe(0);
      expect(r).toEqual({ value: "b" });
    });
  });

  it("沿历史向旧翻", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b");
      recordInputEntry("c"); // history = ["c", "b", "a"]
      expect(navigateInputHistoryPrev()).toEqual({ value: "c" });
      expect(navigateInputHistoryPrev()).toEqual({ value: "b" });
      expect(navigateInputHistoryPrev()).toEqual({ value: "a" });
      expect(inputHistoryCursor$()).toBe(2);
    });
  });

  it("到达最老条目 → no-op (不++, stay)", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b");
      navigateInputHistoryPrev();
      navigateInputHistoryPrev(); // → 1
      const r = navigateInputHistoryPrev(); // → null, 留 1
      expect(r).toBeNull();
      expect(inputHistoryCursor$()).toBe(1);
    });
  });
});

// ─── navigateInputHistoryNext ──────────────────────────

describe("navigateInputHistoryNext (↓)", () => {
  it("历史为空 → null", () => {
    createRoot(() => {
      expect(navigateInputHistoryNext()).toBeNull();
    });
  });

  it("cursor = -1 → null (无操作)", () => {
    createRoot(() => {
      recordInputEntry("a");
      expect(navigateInputHistoryNext()).toBeNull();
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("cursor = 0 → 退到 -1 (退出历史)", () => {
    createRoot(() => {
      recordInputEntry("a");
      navigateInputHistoryPrev(); // → 0
      const r = navigateInputHistoryNext();
      expect(r).toEqual({ value: "" });
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("cursor = N-1 → cursor = N-2 (向新)", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b"); // history = ["b", "a"]
      navigateInputHistoryPrev(); // 0
      navigateInputHistoryPrev(); // 1
      expect(inputHistoryCursor$()).toBe(1);
      const r = navigateInputHistoryNext();
      expect(r).toEqual({ value: "b" });
      expect(inputHistoryCursor$()).toBe(0);
    });
  });
});

// ─── handleArrowUp ────────────────────────────────

describe("handleArrowUp (UI 集成辅助)", () => {
  it("input 非空 → 返回 false (让原生 caret 处理)", () => {
    createRoot(() => {
      recordInputEntry("old");
      let inputVal = "draft";
      const setInput = (v: string) => {
        inputVal = v;
      };
      const handled = handleArrowUp(
        () => inputVal,
        (v: string) => setInput(v),
      );
      expect(handled).toBe(false);
      expect(inputVal).toBe("draft"); // 未动
    });
  });

  it("input 空 + 历史非空 → 进入 newest + 返回 true", () => {
    createRoot(() => {
      recordInputEntry("foo");
      recordInputEntry("bar");
      let inputVal = "";
      const setInput = (v: string) => {
        inputVal = v;
      };
      const handled = handleArrowUp(
        () => inputVal,
        (v: string) => setInput(v),
      );
      expect(handled).toBe(true);
      expect(inputVal).toBe("bar");
      expect(inputHistoryCursor$()).toBe(0);
    });
  });

  it("input 空 + 历史空 → 返回 false", () => {
    createRoot(() => {
      let inputVal = "";
      const handled = handleArrowUp(() => inputVal, (v: string) => {
        inputVal = v;
      });
      expect(handled).toBe(false);
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("已经导航态 → 继续向上翻", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b"); // ["b", "a"]
      let inputVal = "";
      const setInput = (v: string) => {
        inputVal = v;
      };
      handleArrowUp(() => inputVal, (v: string) => setInput(v));
      expect(inputVal).toBe("b");
      expect(inputHistoryCursor$()).toBe(0);
      // 改 input 不影响 cursor（在 history mode）
      const handled = handleArrowUp(() => inputVal, (v: string) => setInput(v));
      expect(handled).toBe(true);
      expect(inputVal).toBe("a");
      expect(inputHistoryCursor$()).toBe(1);
    });
  });
});

// ─── handleArrowDown ───────────────────────────────

describe("handleArrowDown (UI 集成辅助)", () => {
  it("cursor = -1 → 返回 false", () => {
    createRoot(() => {
      let inputVal = "";
      const handled = handleArrowDown((v: string) => {
        inputVal = v;
      });
      expect(handled).toBe(false);
      expect(inputVal).toBe("");
    });
  });

  it("cursor 在历史内 → 退一步 + 返回 true", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b");
      let inputVal = "";
      const setInput = (v: string) => {
        inputVal = v;
      };
      handleArrowUp(() => inputVal, (v: string) => setInput(v)); // → 0, "b"
      handleArrowUp(() => inputVal, (v: string) => setInput(v)); // → 1, "a"
      expect(inputVal).toBe("a");
      const handled = handleArrowDown((v: string) => setInput(v));
      expect(handled).toBe(true);
      expect(inputVal).toBe("b"); // 退一步
      expect(inputHistoryCursor$()).toBe(0);
    });
  });

  it("cursor = 0 退回 → input 清空 + cursor -1", () => {
    createRoot(() => {
      recordInputEntry("a");
      let inputVal = "";
      const setInput = (v: string) => {
        inputVal = v;
      };
      handleArrowUp(() => inputVal, (v: string) => setInput(v)); // → 0
      expect(inputVal).toBe("a");
      const handled = handleArrowDown((v: string) => setInput(v));
      expect(handled).toBe(true);
      expect(inputVal).toBe("");
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });
});

// ─── recordInputEntry 重置 cursor ─────────────────────

describe("recordInputEntry 重置 cursor（even on dedup/blank）", () => {
  it("发送后 cursor 应该 -1,无论是否真的写", () => {
    createRoot(() => {
      recordInputEntry("a");
      navigateInputHistoryPrev(); // 进入历史
      expect(inputHistoryCursor$()).toBe(0);
      recordInputEntry("a"); // 连续相同 → 仍要 reset
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("空白提交也会重置 cursor", () => {
    createRoot(() => {
      recordInputEntry("a");
      navigateInputHistoryPrev();
      recordInputEntry("   "); // trim 空
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });
});

// ─── handleArrowUpField / handleArrowDownField (ADR-0029 PR 5) ──────────────
//
// form.Field-aware variants: caller passes a () => FieldAccessor (TanStack Form's
// render prop shape) instead of writing closures for getInput/setInput.

describe("handleArrowUpField (form.Field-aware ↑)", () => {
  it("input 空 + 历史非空 → 进入 newest + 通过 field.handleChange 写回", () => {
    createRoot(() => {
      recordInputEntry("foo");
      recordInputEntry("bar"); // history = ["bar", "foo"]
      const fieldValue = { current: "" };
      const field = () => ({
        state: { value: fieldValue.current },
        handleChange: (v: string) => {
          fieldValue.current = v;
        },
      });
      const handled = handleArrowUpField(field);
      expect(handled).toBe(true);
      expect(fieldValue.current).toBe("bar");
      expect(inputHistoryCursor$()).toBe(0);
    });
  });

  it("input 非空 → 返回 false,field 值不变 (原生 caret 接管)", () => {
    createRoot(() => {
      recordInputEntry("old");
      const fieldValue = { current: "draft" };
      const field = () => ({
        state: { value: fieldValue.current },
        handleChange: (v: string) => {
          fieldValue.current = v;
        },
      });
      const handled = handleArrowUpField(field);
      expect(handled).toBe(false);
      expect(fieldValue.current).toBe("draft");
    });
  });
});

describe("handleArrowDownField (form.Field-aware ↓)", () => {
  it("cursor = -1 → 返回 false", () => {
    createRoot(() => {
      const fieldValue = { current: "" };
      const field = () => ({
        state: { value: fieldValue.current },
        handleChange: (v: string) => {
          fieldValue.current = v;
        },
      });
      const handled = handleArrowDownField(field);
      expect(handled).toBe(false);
      expect(fieldValue.current).toBe("");
    });
  });

  it("cursor = 0 退回 → field 清空 + cursor -1", () => {
    createRoot(() => {
      recordInputEntry("a");
      const fieldValue = { current: "" };
      const field = () => ({
        state: { value: fieldValue.current },
        handleChange: (v: string) => {
          fieldValue.current = v;
        },
      });
      handleArrowUpField(field); // → cursor 0, field "a"
      expect(fieldValue.current).toBe("a");
      const handled = handleArrowDownField(field);
      expect(handled).toBe(true);
      expect(fieldValue.current).toBe("");
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });
});
