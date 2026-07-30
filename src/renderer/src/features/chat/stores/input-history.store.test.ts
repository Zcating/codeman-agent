

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
    
    
    _resetInputHistoryForTest();
    createRoot(() => {
      recordInputEntry("alpha");
      expect(inputHistory$()).toContain("alpha");
    });
  });
});



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
      window.localStorage.clear(); 
      recordInputEntry("hello"); 
      const stored = window.localStorage.getItem(INPUT_HISTORY_STORAGE_KEY);
      
      expect(stored).toBeNull();
    });
  });

  it("trim 空字符串 → 仅重置 cursor,不写", () => {
    createRoot(() => {
      recordInputEntry("real");
      recordInputEntry("   "); 
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
      recordInputEntry("b"); 
      const r = navigateInputHistoryPrev();
      expect(inputHistoryCursor$()).toBe(0);
      expect(r).toEqual({ value: "b" });
    });
  });

  it("沿历史向旧翻", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b");
      recordInputEntry("c"); 
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
      navigateInputHistoryPrev(); 
      const r = navigateInputHistoryPrev(); 
      expect(r).toBeNull();
      expect(inputHistoryCursor$()).toBe(1);
    });
  });
});



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
      navigateInputHistoryPrev(); 
      const r = navigateInputHistoryNext();
      expect(r).toEqual({ value: "" });
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("cursor = N-1 → cursor = N-2 (向新)", () => {
    createRoot(() => {
      recordInputEntry("a");
      recordInputEntry("b"); 
      navigateInputHistoryPrev(); 
      navigateInputHistoryPrev(); 
      expect(inputHistoryCursor$()).toBe(1);
      const r = navigateInputHistoryNext();
      expect(r).toEqual({ value: "b" });
      expect(inputHistoryCursor$()).toBe(0);
    });
  });
});



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
      expect(inputVal).toBe("draft"); 
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
      recordInputEntry("b"); 
      let inputVal = "";
      const setInput = (v: string) => {
        inputVal = v;
      };
      handleArrowUp(() => inputVal, (v: string) => setInput(v));
      expect(inputVal).toBe("b");
      expect(inputHistoryCursor$()).toBe(0);
      
      const handled = handleArrowUp(() => inputVal, (v: string) => setInput(v));
      expect(handled).toBe(true);
      expect(inputVal).toBe("a");
      expect(inputHistoryCursor$()).toBe(1);
    });
  });
});



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
      handleArrowUp(() => inputVal, (v: string) => setInput(v)); 
      handleArrowUp(() => inputVal, (v: string) => setInput(v)); 
      expect(inputVal).toBe("a");
      const handled = handleArrowDown((v: string) => setInput(v));
      expect(handled).toBe(true);
      expect(inputVal).toBe("b"); 
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
      handleArrowUp(() => inputVal, (v: string) => setInput(v)); 
      expect(inputVal).toBe("a");
      const handled = handleArrowDown((v: string) => setInput(v));
      expect(handled).toBe(true);
      expect(inputVal).toBe("");
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });
});



describe("recordInputEntry 重置 cursor（even on dedup/blank）", () => {
  it("发送后 cursor 应该 -1,无论是否真的写", () => {
    createRoot(() => {
      recordInputEntry("a");
      navigateInputHistoryPrev(); 
      expect(inputHistoryCursor$()).toBe(0);
      recordInputEntry("a"); 
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });

  it("空白提交也会重置 cursor", () => {
    createRoot(() => {
      recordInputEntry("a");
      navigateInputHistoryPrev();
      recordInputEntry("   "); 
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });
});






describe("handleArrowUpField (form.Field-aware ↑)", () => {
  it("input 空 + 历史非空 → 进入 newest + 通过 field.handleChange 写回", () => {
    createRoot(() => {
      recordInputEntry("foo");
      recordInputEntry("bar"); 
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
      handleArrowUpField(field); 
      expect(fieldValue.current).toBe("a");
      const handled = handleArrowDownField(field);
      expect(handled).toBe(true);
      expect(fieldValue.current).toBe("");
      expect(inputHistoryCursor$()).toBe(-1);
    });
  });
});
