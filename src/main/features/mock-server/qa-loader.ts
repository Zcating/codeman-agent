
import { Effect } from "effect";
import { logger } from "../../logger";

export interface QaToolUse {
  name: string;
  input: Record<string, unknown>;
}

export interface QaTurn {
  thinking?: string;
  text: string;
  toolUses?: QaToolUse[];
  done?: boolean;
}

export interface QaEntry {
  question: string;
  turns: QaTurn[];
  default?: boolean;
}

let cache: QaEntry[] | null = null;

function candidateSeedPaths(): string[] {
  const path = require("node:path") as typeof import("node:path");
  const candidates = [
    path.join(process.cwd(), "src", "assets", "qa.dev.json"),
    path.join(__dirname, "..", "..", "assets", "qa.dev.json"),
    path.join(__dirname, "..", "..", "..", "src", "assets", "qa.dev.json"),
    path.join(__dirname, "..", "..", "..", "..", "src", "assets", "qa.dev.json"),
  ];
  return Array.from(new Set(candidates));
}

// 辅助：读取并 normalize QA 文件，失败时返回 CandidateFailed
function readQaFile(path: string): Effect<QaEntry[], { _tag: "CandidateFailed"; path: string }> {
  return Effect.gen(function* () {
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return yield* Effect.fail({ _tag: "CandidateFailed", path });
    }
    return normalizeQaEntries(parsed);
  }).pipe(Effect.mapError(() => ({ _tag: "CandidateFailed", path })));
}

export function loadQaTable(): QaEntry[] {
  if (cache !== null) {
    return cache;
  }

  // 用 Effect.firstSuccessOf 表达回退链: env -> candidates -> fallback
  // env 失败 warn 后返回 "skip" 以落入 candidates
  // candidates 失败静默（逐个 try，所有失败落入 fallback）
  // fallback 返回空表并 warn "no dev seed found"

  const envEffect = Effect.gen(function* () {
    const envPath = process.env["CODEMAN_TEST_QA_TABLE"];
    if (!envPath) {
      return yield* Effect.fail("skip" as const);
    }
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(envPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return yield* Effect.fail("skip" as const);
    }
    const entries = normalizeQaEntries(parsed);
    logger.info(`loaded from CODEMAN_TEST_QA_TABLE=${envPath} (${entries.length} entries)`);
    return entries;
  }).pipe(
    Effect.mapError((e) => {
      // env 失败: warn 并返回 "skip" 以落入下一个
      logger.warn(
        `failed to read CODEMAN_TEST_QA_TABLE: ${e instanceof Error ? e.message : String(e)}`,
      );
      return "skip" as const;
    }),
  );

  const isDev = process.env["NODE_ENV"] !== "production" || !!process.env["VITE_DEV_SERVER_URL"];

  const candidatesEffect = isDev
    ? Effect.firstSuccessOf(
        candidateSeedPaths().map((seedPath) =>
          readQaFile(seedPath).pipe(
            Effect.mapError(() => {
              // candidates 失败静默（不在此处 warn）
              return "skip" as const;
            }),
          ),
        ),
      )
    : Effect.fail("skip" as const);

  const fallbackEffect = Effect.gen(function* () {
    if (isDev) {
      logger.warn(
        `no dev seed found. Tried: ${candidateSeedPaths().join(", ")}. ` +
          `mock-server will emit "[mock] no canned response queued" for every request.`,
      );
    }
    return [] as QaEntry[];
  });

  // 链式回退: env 失败则试 candidates，candidates 全部失败则用 fallback
  const chain = Effect.orElse(envEffect, () => candidatesEffect);

  const result = Effect.runSync(
    Effect.firstSuccessOf([chain, fallbackEffect]),
  );

  cache = result;
  return result;
}

export function getQaTable(): QaEntry[] {
  return cache ?? loadQaTable();
}

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

    if (Array.isArray(r.turns)) {
      entry.turns = r.turns
        .map((t) => normalizeTurn(t))
        .filter((t): t is QaTurn => t !== null);
      if (entry.turns.length === 0) {
        entry.turns = [{ text: "" }];
      }
      return entry;
    }

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

export function resetQaLoaderForTest(): void {
  cache = null;
}
