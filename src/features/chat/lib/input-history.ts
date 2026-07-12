//! 输入历史 — 纯函数 (Q1–Q6 设计契约)。
//!
//! 不依赖 Solid / Effect。当前历史存储用 localStorage (Q2=B) 而非 SQLite/IPC，
//! 原因：100 条 × 几 KB 的小规模 + 单进程单窗口假设 + 不引新 SQL migration。
//!
//! 数据布局：
//!   - newest-first 数组（栈顶 = 最新一次提交）
//!   - 最多 MAX_ENTRIES (100) 条，超出 FIFO 淘汰最旧的
//!   - 连续相同内容去重 (Q3a=II)
//!   - trim() 后空内容不记 (Q3b=I)

const STORAGE_KEY = "codeman.input-history.v1";
const MAX_ENTRIES = 100;

/**
 * 从 localStorage 读历史。损坏 / 不可用 → 返回空数组。
 *
 * 容忍：
 * - localStorage 不存在（SSR / 非浏览器环境）
 * - JSON 解析失败（被外部进程写入脏数据）
 * - 非 string 元素（数组中混入非字符串）
 * - 超过 MAX_ENTRIES（截断到上限）
 */
export function loadHistory(): string[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter((x): x is string => typeof x === "string");
    return filtered.slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * 写历史到 localStorage。QuotaExceededError 等静默吞 (Q6=A)，
 * 不阻塞主流程——历史持久化是 "best effort"。
 */
export function saveHistory(entries: string[]): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // QuotaExceededError / SecurityError / etc.：不抛。
    // 下次启动可以重新累积；不阻塞当前 send 的响应。
  }
}

/**
 * 把一条提交记录加入历史，返回新的（newest-first）数组。
 *
 * 规则：
 * - trim() 后为空 → 不变（Q3b=I）
 * - 栈顶已等于该内容 → 不变（Q3a=II 连续去重）
 * - 否则 prepend，超 100 条 FIFO 淘汰尾端
 *
 * 不修改输入数组（pure）——返回新数组。
 */
export function recordEntry(
  entries: readonly string[],
  content: string,
): string[] {
  const trimmed = content.trim();
  if (trimmed === "") return entries.slice();
  if (entries.length > 0 && entries[0] === trimmed) return entries.slice();
  const next = [trimmed, ...entries];
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
  return next;
}

/** 暴露给测试 / 调试 — 不参与业务逻辑 */
export const INPUT_HISTORY_STORAGE_KEY = STORAGE_KEY;
export const INPUT_HISTORY_MAX_ENTRIES = MAX_ENTRIES;
