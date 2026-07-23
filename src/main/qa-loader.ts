//! Q→A table loader — single source of seeded mock LLM responses. Per CONTEXT.md: loads once, cached.
//!
//! Resolution priority (first match wins):
//!   1. `CODEMAN_TEST_QA_TABLE` env var (path) — used by Playwright e2e to inject
//!      per-worker fixture file (deleted per ADR-0027 D2 — single seed now).
//!   2. Dev seed `qa.dev.json`. The seed lives at `src/assets/qa.dev.json` in
//!      the source tree, but where Electron actually runs from depends on the
//!      runner — `electron-vite` builds the main bundle to `dist-electron/main/`
//!      and `__dirname` does NOT have an `assets/` sibling, so we try multiple
//!      candidate paths:
//!      - `process.cwd()/electron/assets/qa.dev.json` (dev: `vp run dev`)
//!      - `__dirname/../assets/qa.dev.json` (packaged app where assets are bundled)
//!      - `__dirname/../../electron/assets/qa.dev.json` (rare layouts)
//!   3. Falls back to empty table — `mock-server` will emit `[mock] no canned
//!      response queued` for every request (we log loudly so this never goes silent).
//!
//! Lazy-loaded: file reads happen on first `loadQaTable()` call; subsequent calls
//! return the cache.

export interface QaToolUse {
  /** Anthropic tool name (matches `tools[].name` in the request body). */
  name: string;
  /** Tool input — will be JSON.stringify'd into SSE `input_json_delta` partials. */
  input: Record<string, unknown>;
}

/**
 * Single scripted turn of a multi-turn response. mock-server serves
 * `entry.turns[N]` on the (N+1)-th agent-loop iteration, where
 * `N = msgs.filter(role === "assistant").length` (see mock-server).
 *
 * Each turn follows the same Anthropic protocol order:
 *   1. `thinking` block (optional) — single thinking_delta + signature_delta
 *   2. `text` block               — N text_delta events (per-char streaming)
 *   3. `toolUses` blocks          — one full tool_use block per tool, single
 *                                   input_json_delta per block
 */
export interface QaTurn {
  /** Thinking block content — emitted BEFORE text per Anthropic convention.
   *  Single thinking_delta + signature_delta (no per-char streaming). */
  thinking?: string;
  /** Raw assistant text. mock-server synthesizes SSE bytes from this and streams
   *  one content_block_delta per character (or per N chars, see CODEMAN_MOCK_DELTA_SIZE).
   *  Can be empty string when the response is only thinking / tool_use blocks. */
  text: string;
  /** Tool_use blocks — emitted AFTER text. Each becomes a full tool_use content block. */
  toolUses?: QaToolUse[];
  /**
   * 显式终止标记 — T28 Stop operation。
   *
   * 当 true 且这条 turn 是 entry 的最后一轮时,mock-server 在
   * `asstCount >= entry.turns.length` 时合成一条 `end_turn` 完成响应
   * (`"(mock) Script complete."`),不再走 turns[N] 循环。
   *
   * 用途:单 toolUse entry(`turns.length === 1` + `toolUses`) — 工具执行
   * 后 agent 再调 LLM,如果不标 done,mock 会回到 turns[0] 再发一次同
   * toolUse,死循环。多 turn entry 的最后一轮若是纯 text 自然 end_turn,
   * 不需要标 done。
   *
   * 约定:标在非最后一 turn 无效(后续 turn 仍会被服务)。未标 done 的旧
   * entry 保持原行为(单 turn 会循环 — 调用方应升级 entry 加 done:true)。
   */
  done?: boolean;
}

/**
 * Q→A entry — single mock LLM response script, optionally spanning multiple
 * agent-loop turns. With `turns.length === 1` this is equivalent to a legacy
 * single-shot canned response; with `turns.length > 1` the agent loop iterates
 * and mock-server serves the next turn on each follow-up request.
 *
 * Legacy shapes accepted by `normalizeQaEntries` for backward compatibility:
 *   - `{question, answer: string}`  — wrapped as `turns: [{text: answer}]`
 *   - `{question, text: string}`    — wrapped as `turns: [{text}]`
 *   - `{question, text, thinking}`  — wrapped as `turns: [{text, thinking}]`
 *   - `{question, text, toolUses}`  — wrapped as `turns: [{text, toolUses}]`
 *
 * See CONTEXT.md "Scripted Multi-Turn Entry" for the full multi-turn semantics.
 */
export interface QaEntry {
  /** Substring-matched against the FIRST user message in the request (case-sensitive,
   *  first-wins). On follow-up requests after tool execution, the original first
   *  user message is used so the script is locked to the initial query. */
  question: string;
  /** Scripted turns. Length-1 = single-turn (legacy behavior); length > 1 =
   *  scripted multi-turn (see mock-server for turn-index algorithm). */
  turns: QaTurn[];
  /** Fallback flag — used when no entry's question substring-matches user text. */
  default?: boolean;
}

let cache: QaEntry[] | null = null;

// ─── Logger (avoid pulling in shared/lib/logger; this module is electron-side) ─

const loaderLogger = {
  warn(msg: string, ...rest: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(`[qa-loader] ${msg}`, ...rest);
  },
  info(msg: string, ...rest: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(`[qa-loader] ${msg}`, ...rest);
  },
};

// ─── Candidate path resolution ───────────────────────────────────────────────

function candidateSeedPaths(): string[] {
  const path = require("node:path") as typeof import("node:path");
  const candidates = [
    // 1) CWD-based: works for `vp run dev` where Electron is spawned from repo root.
    path.join(process.cwd(), "src", "assets", "qa.dev.json"),
    // 2) Bundled main: `dist-electron/main/index.js` → `../assets/qa.dev.json`
    path.join(__dirname, "..", "assets", "qa.dev.json"),
    // 3) Up one more level: e.g. tsc output or nested layouts
    path.join(__dirname, "..", "..", "src", "assets", "qa.dev.json"),
    // 4) Asar-style: packaged app where assets live next to main bundle
    path.join(__dirname, "..", "..", "..", "src", "assets", "qa.dev.json"),
  ];
  // Deduplicate while preserving order
  return Array.from(new Set(candidates));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Resolves Q→A entries per priority: env var → dev seed (multi-path) → []. Caches once. */
export function loadQaTable(): QaEntry[] {
  if (cache !== null) {return cache;}

  // Priority 1: e2e env var path
  const envPath = process.env["CODEMAN_TEST_QA_TABLE"];
  if (envPath) {
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      const raw = fs.readFileSync(envPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        cache = normalizeQaEntries(parsed);
        loaderLogger.info(`loaded from CODEMAN_TEST_QA_TABLE=${envPath} (${cache.length} entries)`);
        return cache;
      }
    } catch (e) {
      loaderLogger.warn(
        `failed to read CODEMAN_TEST_QA_TABLE=${envPath}:`,
        e instanceof Error ? e.message : String(e),
      );
      // fall through
    }
  }

  // Priority 2: dev seed (multi-path candidates)
  const isDev = process.env["NODE_ENV"] !== "production" || !!process.env["VITE_DEV_SERVER_URL"];
  if (isDev) {
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      for (const seedPath of candidateSeedPaths()) {
        try {
          const raw = fs.readFileSync(seedPath, "utf-8");
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            cache = normalizeQaEntries(parsed);
            loaderLogger.info(`loaded ${cache.length} entries from ${seedPath}`);
            return cache;
          }
        } catch {
          // file not found at this candidate, try next
        }
      }
      // All candidates exhausted
      loaderLogger.warn(
        `no dev seed found. Tried: ${candidateSeedPaths().join(", ")}. ` +
          `mock-server will emit "[mock] no canned response queued" for every request.`,
      );
    } catch (e) {
      loaderLogger.warn(
        `unexpected error during dev seed load:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  cache = [];
  return cache;
}

export function getQaTable(): QaEntry[] {
  return cache ?? loadQaTable();
}

/** Normalize QA entries: legacy top-level `answer`/`text`/`thinking`/`toolUses`
 *  are wrapped into `turns: [{...}]`. New `turns[]` shape is validated per turn
 *  (each turn's `text` defaults to "" if missing, optional `thinking` +
 *  `toolUses` pass through with light validation). */
function normalizeQaEntries(raw: unknown[]): QaEntry[] {
  return raw.map((e) => {
    const r = e as Record<string, unknown>;
    const entry: QaEntry = {
      question: String(r.question ?? ""),
      turns: [],
    };
    if (r.default === true) {
      entry.default = true;
    }

    // Preferred path: explicit `turns[]` array.
    if (Array.isArray(r.turns)) {
      entry.turns = r.turns
        .map((t) => normalizeTurn(t))
        .filter((t): t is QaTurn => t !== null);
      if (entry.turns.length === 0) {
        // Empty turns is invalid but recoverable — give it a single empty-text turn
        // so handler's lookup always produces a valid response.
        entry.turns = [{ text: "" }];
      }
      return entry;
    }

    // Legacy path: wrap top-level fields into turns:[{...}].
    const legacyText = typeof r.text === "string"
      ? r.text
      : typeof r.answer === "string"
        ? r.answer
        : "";
    const legacyTurn: QaTurn = { text: legacyText };
    if (typeof r.thinking === "string" && r.thinking.length > 0) {
      legacyTurn.thinking = r.thinking;
    }
    if (Array.isArray(r.toolUses)) {
      const tuses = parseToolUses(r.toolUses);
      if (tuses.length > 0) {
        legacyTurn.toolUses = tuses;
      }
    }
    if (r.done === true) {
      legacyTurn.done = true;
    }
    entry.turns = [legacyTurn];
    return entry;
  });
}

/** Normalize a single turn from a `turns[]` entry. Returns null if the input is
 *  not a usable object (skipped by filter()). */
function normalizeTurn(t: unknown): QaTurn | null {
  if (!t || typeof t !== "object" || Array.isArray(t)) {return null;}
  const tr = t as Record<string, unknown>;
  const text = typeof tr.text === "string"
    ? tr.text
    : typeof tr.answer === "string"
      ? tr.answer
      : "";
  const turn: QaTurn = { text };
  if (typeof tr.thinking === "string" && tr.thinking.length > 0) {
    turn.thinking = tr.thinking;
  }
  if (Array.isArray(tr.toolUses)) {
    const tuses = parseToolUses(tr.toolUses);
    if (tuses.length > 0) {
      turn.toolUses = tuses;
    }
  }
  if (tr.done === true) {
    turn.done = true;
  }
  return turn;
}

/** Validate + extract a toolUses array. Filters out malformed entries silently. */
function parseToolUses(raw: unknown[]): QaToolUse[] {
  const tuses: QaToolUse[] = [];
  for (const t of raw) {
    if (t && typeof t === "object") {
      const tr = t as Record<string, unknown>;
      if (typeof tr.name === "string") {
        const input = tr.input && typeof tr.input === "object" && !Array.isArray(tr.input)
          ? (tr.input as Record<string, unknown>)
          : {};
        tuses.push({ name: tr.name, input });
      }
    }
  }
  return tuses;
}

/** Test-only: clear module cache. */
export function resetQaLoaderForTest(): void {
  cache = null;
}
