//! electron/main/mock-server.ts — 本地 mock LLM HTTP 服务器。
//!
//! 监听 `127.0.0.1:50000`(`CODEMAN_MOCK_PORT` 可覆盖)。POST `/mock/anthropic/v1/messages`
//! 收到 `AnthropicTransport` 的 fetch 请求,按 user message 末条做 substring match
//! Q→A Table(由 `qa-loader.ts` 提供),命中后用 `entry.turns[N]` 合成标准 Anthropic
//! SSE 协议响应(per-character streaming for text),**N = 请求中 `role: "assistant"`
//! 消息数**,即 agent loop 的轮次索引 — 支持 scripted 多 turn 连续工作模式。
//! `res.write()` per-event + 可配置 delay (`CODEMAN_MOCK_STREAM_DELAY_MS`,
//! 默认 1ms / event)让 transport 看到多个 `reader.read()` chunk。
//!
//! **Last-user-msg lookup**(2026-07-07 update): entry 由 user 最新一条 message 的
//! substring 决定,而不是首条 — 这样用户在续接的旧 conversation 里新输入 entry key
//! (如 "three-blocks")也能命中对应的 canned response,无需开新会话。
//! scripted 多 turn 本身仍按 `asstCount` 顺序推进(同一 entry 内 turn 切换不依赖 lookup)。
//!
//! 启动由 `electron/main/index.ts` 的 `app.whenReady()` 钩入。
//!
//! 设计要点(per CONTEXT.md 「Mock Server」):
//! - Stateless HTTP responder — 不接 provider record / settings / IPC
//! - 不识别 mock 性质 — user 配啥 base_url 都受理
//! - Production `NODE_ENV === "production"` 不启 server(节省资源,但用户若主动
//!   配 `http://127.0.0.1:50000/...` provider 仍能向本地 server 发请求)
//! - CORS 全开(`*`)— server 假定只 listen 在 loopback,renderer fetch 命中即可。

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadQaTable, type QaEntry, type QaTurn } from "./qa-loader";

// ─── Config ────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 50000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_STREAM_DELAY_MS = 1; // 1ms per SSE event — visible streaming without slowing tests
const DEFAULT_DELTA_SIZE = 1; // characters per content_block_delta

function resolvePort(): number {
  const raw = process.env["CODEMAN_MOCK_PORT"];
  if (!raw) {
    return DEFAULT_PORT;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    logger.warn(`[mock-server] invalid CODEMAN_MOCK_PORT=${raw}, fallback to ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return n;
}

function resolveHost(): string {
  return process.env["CODEMAN_MOCK_HOST"] ?? DEFAULT_HOST;
}

function resolveStreamDelayMs(): number {
  const raw = process.env["CODEMAN_MOCK_STREAM_DELAY_MS"];
  if (!raw) {
    return DEFAULT_STREAM_DELAY_MS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 10000) {
    logger.warn(`[mock-server] invalid CODEMAN_MOCK_STREAM_DELAY_MS=${raw}, fallback to ${DEFAULT_STREAM_DELAY_MS}`);
    return DEFAULT_STREAM_DELAY_MS;
  }
  return n;
}

function resolveDeltaSize(): number {
  const raw = process.env["CODEMAN_MOCK_DELTA_SIZE"];
  if (!raw) {
    return DEFAULT_DELTA_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 100) {
    logger.warn(`[mock-server] invalid CODEMAN_MOCK_DELTA_SIZE=${raw}, fallback to ${DEFAULT_DELTA_SIZE}`);
    return DEFAULT_DELTA_SIZE;
  }
  return n;
}

// ─── Logger (avoid pulling in shared/lib/logger which is renderer-side) ────

const logger = {
  warn(msg: string): void {
    // eslint-disable-next-line no-console
    console.warn(msg);
  },
  info(msg: string): void {
    // eslint-disable-next-line no-console
    console.log(msg);
  },
};

// ─── CORS headers (loopback-only server, so wildcard is safe) ──────────────
//
// Renderer fetches from `http://127.0.0.1:1420` (Vite dev server) to
// `http://127.0.0.1:50000` (mock LLM). Different origin → triggers CORS
// preflight. Without `Access-Control-Allow-Origin` on every response,
// browser kills the request with `net::ERR_FAILED`. We return * since the
// server only listens on loopback — wildcard is safe regardless of caller.

const CORS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Access-Control-Max-Age": "86400",
});

function writeHeadWithCors(
  res: ServerResponse,
  status: number,
  extra: Record<string, string>,
): void {
  res.writeHead(status, { ...CORS_HEADERS, ...extra });
}

// ─── Q→A match (replicates qa-table-lookup semantics for the server) ────────

interface QaMiss { readonly _tag: "QaMiss"; readonly question: string }
type QaResult = { readonly _tag: "Right"; readonly right: QaEntry } | { readonly _tag: "Left"; readonly left: QaMiss };

function lookupQaAnswer(table: QaEntry[], userText: string): QaResult {
  // Phase 1: substring match, first-wins
  for (const entry of table) {
    if (userText.includes(entry.question)) {
      return { _tag: "Right", right: entry };
    }
  }
  // Phase 2: default fallback
  for (const entry of table) {
    if (entry.default === true) {
      return { _tag: "Right", right: entry };
    }
  }
  // Phase 3: miss
  return { _tag: "Left", left: { _tag: "QaMiss", question: userText } };
}

// ─── SSE synthesis: full Anthropic protocol from QaTurn ─────────────────────
//
// Synthesize a complete Anthropic-protocol SSE response from a single QaTurn.
// Supports optional blocks in this fixed order:
//   1. thinking     (turn.thinking, optional) — single thinking_delta + signature_delta
//   2. text         (turn.text)               — N text_delta events (per-char streaming)
//   3. tool_use[]   (turn.toolUses, optional) — one full block per tool, single input_json_delta
//
// Returns an array of event-blocks (each ends with \n\n) so the caller can res.write()
// each one separately with optional delay.

function buildSseTurnEvents(turn: QaTurn, deltaSize: number): string[] {
  const events: string[] = [];
  const msgId = `msg_mock_${Date.now()}`;

  // 1) message_start (always)
  events.push(
    `event: message_start\n` +
      `data: {"type":"message_start","message":{"id":"${msgId}","type":"message","role":"assistant","content":[],"model":"mock-default","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n` +
      "\n",
  );

  let blockIdx = 0;

  // 2) Optional thinking block (sent before text per Anthropic convention).
  //    Single thinking_delta + signature_delta (no per-char streaming — not user-visible).
  if (turn.thinking && turn.thinking.length > 0) {
    events.push(
      `event: content_block_start\n` +
        `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"thinking","thinking":""}}\n` +
        "\n",
    );
    events.push(
      `event: content_block_delta\n` +
        `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"thinking_delta","thinking":${JSON.stringify(turn.thinking)}}}\n` +
        "\n",
    );
    events.push(
      `event: content_block_delta\n` +
        `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"signature_delta","signature":"sig_mock_${blockIdx}_${Date.now()}"}}\n` +
        "\n",
    );
    events.push(
      `event: content_block_stop\n` +
        `data: {"type":"content_block_stop","index":${blockIdx}}\n` +
        "\n",
    );
    blockIdx++;
  }

  // 3) Text block (skipped entirely if empty text + no thinking/toolUses).
  //    One content_block_delta per N characters.
  if (turn.text.length > 0) {
    events.push(
      `event: content_block_start\n` +
        `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"text","text":""}}\n` +
        "\n",
    );
    for (let i = 0; i < turn.text.length; i += deltaSize) {
      const chunk = turn.text.slice(i, i + deltaSize);
      events.push(
        `event: content_block_delta\n` +
          `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"text_delta","text":${JSON.stringify(chunk)}}}\n` +
          "\n",
      );
    }
    events.push(
      `event: content_block_stop\n` +
        `data: {"type":"content_block_stop","index":${blockIdx}}\n` +
        "\n",
    );
    blockIdx++;
  }

  // 4) Optional tool_use blocks (one per QaToolUse, after text).
  //    Each emits a full tool_use content block: start (with id+name+empty input) +
  //    single input_json_delta with the JSON-serialized input + stop.
  if (turn.toolUses && turn.toolUses.length > 0) {
    for (const tu of turn.toolUses) {
      const toolId = `toolu_mock_${blockIdx}_${Date.now()}`;
      events.push(
        `event: content_block_start\n` +
          `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"tool_use","id":"${toolId}","name":${JSON.stringify(tu.name)},"input":{}}}\n` +
          "\n",
      );
      // partial_json is a JSON-encoded string of the input object (real Anthropic
      // streams this; we send as one chunk for simplicity).
      events.push(
        `event: content_block_delta\n` +
          `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(JSON.stringify(tu.input))}}}\n` +
          "\n",
      );
      events.push(
        `event: content_block_stop\n` +
          `data: {"type":"content_block_stop","index":${blockIdx}}\n` +
          "\n",
      );
      blockIdx++;
    }
  }

  // 5) message_delta — stop_reason + usage.
  //    Real Anthropic: "tool_use" if any tool_use was emitted, else "end_turn".
  const stopReason = turn.toolUses && turn.toolUses.length > 0 ? "tool_use" : "end_turn";
  const outputTokens = turn.text.length + (turn.thinking?.length ?? 0);
  events.push(
    `event: message_delta\n` +
      `data: {"type":"message_delta","delta":{"stop_reason":"${stopReason}"},"usage":{"output_tokens":${outputTokens}}}\n` +
      "\n",
  );

  // 6) message_stop
  events.push(
    `event: message_stop\n` +
      `data: {"type":"message_stop"}\n` +
      "\n",
  );

  return events;
}

/** Backward-compatible wrapper: synthesizes events for `entry.turns[0]` only.
 *  Multi-turn entries should be served via `buildSseTurnEvents(entry.turns[N], ...)`
 *  directly from the handler. Kept exported for tests that exercise the per-turn
 *  SSE shape with a one-turn entry. */
function buildSseEvents(entry: QaEntry, deltaSize: number): string[] {
  return buildSseTurnEvents(entry.turns[0], deltaSize);
}

// ─── Request parsing ────────────────────────────────────────────────────────

interface AnthropicMessagesBody {
  model?: string;
  messages?: Array<{ role: string; content: unknown }>;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    req.on("error", reject);
  });
}

function extractLastUserText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {
    return "";
  }
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === "user") {
      const c = m.content;
      if (typeof c === "string") {
        return c;
      }
      return typeof c === "object" ? JSON.stringify(c) : String(c ?? "");
    }
  }
  return "";
}

/** Extract the FIRST user message text from the request. NOT used by the
 *  main handler (which uses `extractLastUserText` to honor follow-up entry-key
 *  switches in resumed conversations) — kept exported as a utility for callers
 *  that want the original query, e.g. for telemetry or alternative lookup
 *  strategies. Tests in `mock-server.test.ts` cover the helper in isolation. */
function extractFirstUserText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {
    return "";
  }
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m && m.role === "user") {
      const c = m.content;
      if (typeof c === "string") {
        return c;
      }
      return typeof c === "object" ? JSON.stringify(c) : String(c ?? "");
    }
  }
  return "";
}

/** Count `role: "assistant"` messages in the request body. Each prior turn
 *  that produced a tool_use block leaves one assistant message in the next
 *  request, so this equals the next scripted turn index to serve. */
function countAssistantMessages(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) return 0;
  let n = 0;
  for (const m of msgs) {
    if (m && m.role === "assistant") n++;
  }
  return n;
}

// ─── Streaming write helper ─────────────────────────────────────────────────

/** Write events one at a time with optional delay between writes.
 *  Uses res.write() per event so the transport sees multiple reader.read() chunks. */
function writeSseStream(
  res: ServerResponse,
  events: string[],
  delayMs: number,
): void {
  let i = 0;
  const writeNext = (): void => {
    if (i >= events.length) {
      res.end();
      return;
    }
    res.write(events[i]);
    i++;
    if (delayMs > 0) {
      setTimeout(writeNext, delayMs);
    } else {
      setImmediate(writeNext);
    }
  };

  writeNext();
}

// ─── HTTP request handler ───────────────────────────────────────────────────

const SHORT_CIRCUIT_TEXT = "(mock) Script complete.";

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // CORS preflight — short-circuit before method/path checks.
  if (req.method === "OPTIONS") {
    writeHeadWithCors(res, 204, { "Content-Length": "0" });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    writeHeadWithCors(res, 405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }
  // Accept both `/mock/anthropic/v1/messages` and `/v1/messages` (in case future
  // dev users pick a path prefix other than `/mock/anthropic/`).
  const url = req.url ?? "";
  if (!/^\/(?:mock\/anthropic\/)?v1\/messages\/?$/.test(url)) {
    writeHeadWithCors(res, 404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  readJsonBody(req)
    .then((body) => {
      // Scripted multi-turn dispatch. Turn index N = count of prior assistant
      // messages in the request (0 for initial request). Substring match against
      // the LAST user message so resumed conversations can switch scripts by
      // typing the new entry key (e.g. "three-blocks") in a follow-up msg.
      //
      // Capped turn index (v2026-07-07+): `turnIdx = min(asstCount, length-1)`.
      // Single-turn entries thus ALWAYS serve `turns[0]` regardless of how
      // many prior asst msgs exist (resumed chats work — no more
      // "(mock) Script complete." short-circuit breaking canned-response
      // UX). Multi-turn entries still advance via asstCount and cap at the
      // last turn instead of short-circuiting. The agent loop terminates
      // naturally because tool execution changes the LAST user msg to
      // toolResult content, which fails lookup and falls back to `*`
      // default (end_turn) — no infinite loops.
      const asstCount = countAssistantMessages(body);
      const lastUserText = extractLastUserText(body);
      const qaTable = loadQaTable();
      const result = lookupQaAnswer(qaTable, lastUserText);

      // DIAG: print which entry was matched against the LAST user text — this
      // surfaces substring-match misfires (e.g. "three-blocks" being misread
      // as the "read" canned answer).
      logger.info(
        `[mock-server/diag] lastUserText="${lastUserText.slice(0, 200)}"` +
          (lastUserText.length > 200 ? "..." : "") +
          ` asstCount=${asstCount}` +
          (result._tag === "Right"
            ? ` -> entry.question="${result.right.question}"`
            : ` -> MISS (no entry matched)`),
      );

      if (result._tag === "Left") {
        // Substring miss (and no default fallback). Emit a warning SSE so
        // tests don't silently leak — the same path is taken for any turn
        // index when no script entry is configured.
        const fallbackText =
          asstCount > 0
            ? `${SHORT_CIRCUIT_TEXT} (turn=${asstCount}, no entry matched)`
            : "[mock] no canned response queued";
        logger.warn(
          `[mock-server] miss for "${lastUserText.slice(0, 80)}${lastUserText.length > 80 ? "..." : ""}" ` +
            `(turn=${asstCount}) — emitting fallback SSE`,
        );
        const events = buildSseTurnEvents({ text: fallbackText }, fallbackText.length);
        writeHeadWithCors(res, 200, {
          "Content-Type": "application/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        writeSseStream(res, events, resolveStreamDelayMs());
        return;
      }

      const entry = result.right;
      const turnIdx = Math.min(asstCount, entry.turns.length - 1);
      const turn = entry.turns[turnIdx];

      const delayMs = resolveStreamDelayMs();
      const deltaSize = resolveDeltaSize();
      const events = buildSseTurnEvents(turn, deltaSize);
      logger.info(
        `[mock-server] hit "${entry.question}" turn=${turnIdx}/${entry.turns.length - 1} ` +
          `(asstCount=${asstCount}) ` +
          `-> ${events.length} SSE events (text=${turn.text.length}, ` +
          `thinking=${turn.thinking?.length ?? 0}, toolUses=${turn.toolUses?.length ?? 0}, ` +
          `delay=${delayMs}ms, delta=${deltaSize})`,
      );

      writeHeadWithCors(res, 200, {
        "Content-Type": "application/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      writeSseStream(res, events, delayMs);
    })
    .catch((e: unknown) => {
      logger.warn(`[mock-server] bad request: ${e instanceof Error ? e.message : String(e)}`);
      writeHeadWithCors(res, 400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    });
}

// ─── Server lifecycle ───────────────────────────────────────────────────────

let server: ReturnType<typeof createServer> | null = null;

/** Start the local mock server (idempotent — safe to call multiple times). */
export function startMockServer(): void {
  if (server) {
    return;
  }

  // Production: skip — 节省资源(user 不大可能配 127.0.0.1:50000 mock provider 在生产)
  const isProd = process.env["NODE_ENV"] === "production";
  if (isProd && !process.env["CODEMAN_MOCK_FORCE"]) {
    logger.info(`[mock-server] production mode, skipping (set CODEMAN_MOCK_FORCE=1 to override)`);
    return;
  }

  const host = resolveHost();
  const port = resolvePort();

  server = createServer(handleRequest);
  server.on("error", (err: Error) => {
    logger.warn(`[mock-server] server error: ${err.message}`);
  });

  try {
    server.listen(port, host, () => {
      logger.info(`[mock-server] listening on http://${host}:${port} (POST /mock/anthropic/v1/messages)`);
    });
  } catch (err) {
    logger.warn(`[mock-server] failed to listen: ${err instanceof Error ? err.message : String(err)}`);
    server = null;
  }
}

/** Stop the local mock server (used in test cleanup). */
export function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    const s = server;
    server = null;
    s.close(() => resolve());
  });
}

// Re-exports for testing.
export {
  lookupQaAnswer,
  buildSseEvents,
  buildSseTurnEvents,
  extractLastUserText,
  extractFirstUserText,
  countAssistantMessages,
};