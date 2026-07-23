//! 输入历史 — Solid 反应式桥接层 (V2.4+ 输入历史功能)。
//!
//! 暴露给 UI：
//!   - inputHistory$ — newest-first 数组（栈顶最新）
//!   - inputHistoryCursor$ — `-1` = 不在历史；`0..N-1` = 历史位置
//!   - recordInputEntry — 提交后调用，自动重置 cursor 并持久化
//!   - navigateInputHistoryPrev / navigateInputHistoryNext — cursor 推移
//!   - handleArrowUp / handleArrowDown — UI 集成辅助：是否阻止默认键行为
//!
//! 跨 Home + ChatView 两输入框共享同一份历史（Q1=A）。
//!
//! 持久化走 `lib/input-history.ts` 的 localStorage 助手（Q2=B）。

import { createSignal, type Accessor } from "solid-js";
import {
  INPUT_HISTORY_MAX_ENTRIES,
  loadHistory,
  saveHistory,
} from "../lib/input-history";

// ─── 反应式状态 ───────────────────────────────

const [history, setHistory] = createSignal<string[]>(loadHistory());
const [cursor, setCursor] = createSignal<number>(-1);

export const inputHistory$: Accessor<string[]> = history;
export const inputHistoryCursor$: Accessor<number> = cursor;

// ─── 写入：recordInputEntry ─────────────────────────────

/**
 * 提交一条历史。trim 后空或与栈顶相等则仅重置 cursor（不写、不持久化）。
 *
 * 写后副作用（仅当真正 prepend）：
 *   - 持久化到 localStorage (best effort)
 *   - cursor 重置回 -1（用户不再处于历史导航态）
 *
 * 不依赖 lib 的 recordEntry（避免其永远返回新 array 的 reference 差异），
 * 直接用内容相等做 dedup 检测。
 */
export function recordInputEntry(content: string): void {
  const trimmed = content.trim();
  if (trimmed === "") {
    setCursor(-1);
    return;
  }
  const current = inputHistory$();
  // Q3a=II 连续去重：与栈顶相等 → 仅重置 cursor
  if (current.length > 0 && current[0] === trimmed) {
    setCursor(-1);
    return;
  }
  const next = [trimmed, ...current];
  if (next.length > INPUT_HISTORY_MAX_ENTRIES) {
    next.length = INPUT_HISTORY_MAX_ENTRIES;
  }
  setHistory(next);
  saveHistory(next);
  setCursor(-1);
}

// ─── 游标推进：navigateInputHistoryPrev / Next ─────────────

/**
 * 导航结果：返回 `null` 表示 no-op（UI 不应 preventDefault），
 * 返回 `{ value }` 表示"把 input 设为 value"（caller 负责 setInput）。
 *
 * 是否退出历史模式 = 调完后查 `inputHistoryCursor$()` 是否为 -1。
 * 不在 NavResult 里重复暴露 —— 单一真值源是 cursor signal。
 */
export interface NavResult {
  readonly value: string;
}

/**
 * ↑ 推进。语义（Q5 系列决策）：
 * - 历史为空 → no-op（返回 null，让 UI 不 preventDefault）
 * - cursor === -1 且已经"激活历史"条件 → 进入 [0]（newest）
 * - cursor 在 [0..N-2] → 推进到 [cursor+1]
 * - cursor === N-1（最老） → no-op（stay）
 */
export function navigateInputHistoryPrev(): NavResult | null {
  const e = inputHistory$();
  if (e.length === 0) {return null;}
  const c = inputHistoryCursor$();
  if (c === e.length - 1) {return null;}
  const next = c + 1;
  setCursor(next);
  return { value: e[next]! };
}

/**
 * ↓ 回退。语义（Q5 系列决策）：
 * - 历史为空 或 cursor === -1 → no-op
 * - cursor === 0 → 退到 -1（input 清空，离开历史态）
 * - cursor 在 [1..N-1] → 退到 [cursor-1]
 */
export function navigateInputHistoryNext(): NavResult | null {
  const e = inputHistory$();
  if (e.length === 0) {return null;}
  const c = inputHistoryCursor$();
  if (c === -1) {return null;}
  if (c === 0) {
    setCursor(-1);
    return { value: "" };
  }
  const next = c - 1;
  setCursor(next);
  return { value: e[next]! };
}

/** 测试 / 调试：硬重置信号 + 清 localStorage 残留 */
export function _resetInputHistoryForTest(): void {
  setHistory([]);
  setCursor(-1);
}

// ─── UI 集成辅助 ─────────────────────────────

/**
 * ↑ 键处理器。返回 `true` 时调用方应 e.preventDefault()。
 *
 * - 若已在历史导航态（cursor !== -1）：Q5c=I 继续向上翻
 * - 若 cursor === -1：要求 input.trim() === "" 才进入历史（Q4 + Q5a=II）
 *   - 否则让原生 caret 行为接管（返回 false）
 * - 若历史空：no-op（返回 false）
 */
export function handleArrowUp(
  getInput: () => string,
  setInput: (value: string) => void,
): boolean {
  const cursorVal = inputHistoryCursor$();
  if (cursorVal === -1) {
    if (getInput().trim() !== "") {return false;}
    if (inputHistory$().length === 0) {return false;}
  }
  const result = navigateInputHistoryPrev();
  if (result !== null) {setInput(result.value);}
  return true;
}

/**
 * ↓ 键处理器。返回 `true` 时调用方应 e.preventDefault()。
 *
 * 仅在 cursor !== -1 时响应；其它情况让原生 caret 行为接管（返回 false）。
 */
export function handleArrowDown(setInput: (value: string) => void): boolean {
  if (inputHistoryCursor$() === -1) {return false;}
  const result = navigateInputHistoryNext();
  if (result !== null) {setInput(result.value);}
  return true;
}

// ─── form.Field-aware wrappers (ADR-0029 PR 5) ─────────────────────────────────
//
// TanStack Form 的 `form.Field` render prop 暴露一个 FieldApi 实例，
// 包含 `state.value` + `handleChange(v)`。调用方不必手写 closure 来把
// form.Field 适配成 (getInput, setInput) 签名。

/** 描述 form.Field accessor 的最小 subset（避免 import @tanstack/solid-form 类型）。 */
export interface FieldAccessor {
  readonly state: { readonly value: string };
  handleChange(value: string): void;
}

/** form.Field-aware ↑ 包装。语义同 handleArrowUp，写回通过 field().handleChange。 */
export function handleArrowUpField(field: () => FieldAccessor): boolean {
  return handleArrowUp(
    () => field().state.value,
    (v) => field().handleChange(v),
  );
}

/** form.Field-aware ↓ 包装。语义同 handleArrowDown，写回通过 field().handleChange。 */
export function handleArrowDownField(field: () => FieldAccessor): boolean {
  return handleArrowDown((v) => field().handleChange(v));
}
