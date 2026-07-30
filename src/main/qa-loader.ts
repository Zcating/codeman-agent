
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


const loaderLogger = {
  warn(msg: string, ...rest: unknown[]): void {
    console.warn(`[qa-loader] ${msg}`, ...rest);
  },
  info(msg: string, ...rest: unknown[]): void {
    console.log(`[qa-loader] ${msg}`, ...rest);
  },
};


function candidateSeedPaths(): string[] {
  const path = require("node:path") as typeof import("node:path");
  const candidates = [
    path.join(process.cwd(), "src", "assets", "qa.dev.json"),
    path.join(__dirname, "..", "assets", "qa.dev.json"),
    path.join(__dirname, "..", "..", "src", "assets", "qa.dev.json"),
    path.join(__dirname, "..", "..", "..", "src", "assets", "qa.dev.json"),
  ];
  return Array.from(new Set(candidates));
}


export function loadQaTable(): QaEntry[] {
  if (cache !== null) {return cache;}

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
    }
  }

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
        }
      }
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
