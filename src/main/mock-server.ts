
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadQaTable, type QaEntry, type QaTurn } from "./features/mock-server/qa-loader";
import { writeHeadWithCors } from "./features/mock-server/cors";
import { lookupQaAnswer } from "./features/mock-server/qa-lookup";
import { readMockServerConfig } from "./config-service";


const logger = {
  warn(msg: string): void {
    console.warn(msg);
  },
  info(msg: string): void {
    console.log(msg);
  },
};

function buildSseTurnEvents(turn: QaTurn, deltaSize: number): string[] {
  const events: string[] = [];
  const msgId = `msg_mock_${Date.now()}`;

  events.push(
    `event: message_start\n` +
      `data: {"type":"message_start","message":{"id":"${msgId}","type":"message","role":"assistant","content":[],"model":"mock-default","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n` +
      "\n",
  );

  let blockIdx = 0;

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

  if (turn.toolUses && turn.toolUses.length > 0) {
    for (const tu of turn.toolUses) {
      const toolId = `toolu_mock_${blockIdx}_${Date.now()}`;
      events.push(
        `event: content_block_start\n` +
          `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"tool_use","id":"${toolId}","name":${JSON.stringify(tu.name)},"input":{}}}\n` +
          "\n",
      );
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

  const stopReason = turn.toolUses && turn.toolUses.length > 0 ? "tool_use" : "end_turn";
  const outputTokens = turn.text.length + (turn.thinking?.length ?? 0);
  const inputTokens = Math.ceil((turn.text.length + (turn.thinking?.length ?? 0)) / 4);
  events.push(
    `event: message_delta\n` +
      `data: {"type":"message_delta","delta":{"stop_reason":"${stopReason}"},"usage":{"input_tokens":${inputTokens},"output_tokens":${outputTokens}}}\n` +
      "\n",
  );

  events.push(
    `event: message_stop\n` +
      `data: {"type":"message_stop"}\n` +
      "\n",
  );

  return events;
}

function buildSseEvents(entry: QaEntry, deltaSize: number): string[] {
  return buildSseTurnEvents(entry.turns[0], deltaSize);
}


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

function countAssistantMessages(body: unknown): number {
  if (!body || typeof body !== "object") {return 0;}
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {return 0;}
  let n = 0;
  for (const m of msgs) {
    if (m && m.role === "assistant") {n++;}
  }
  return n;
}

function countCurrentRunAssistants(body: unknown): number {
  if (!body || typeof body !== "object") {return 0;}
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {return 0;}

  let lastPlainUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== "user") {continue;}
    const c = m.content;
    if (
      Array.isArray(c) &&
      c.some(
        (block: unknown) =>
          !!block &&
          typeof block === "object" &&
          (block as { type?: unknown }).type === "tool_result",
      )
    ) {
      continue;
    }
    lastPlainUserIdx = i;
    break;
  }

  if (lastPlainUserIdx < 0) {return 0;}

  let n = 0;
  for (let i = lastPlainUserIdx + 1; i < msgs.length; i++) {
    const m = msgs[i];
    if (m && m.role === "assistant") {n++;}
  }
  return n;
}


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


const SHORT_CIRCUIT_TEXT = "(mock) Script complete.";

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
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
  const url = req.url ?? "";
  if (!/^\/(?:mock\/anthropic\/)?v1\/messages\/?$/.test(url)) {
    writeHeadWithCors(res, 404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  readJsonBody(req)
    .then((body) => {
      const asstCount = countAssistantMessages(body);
      const lastUserText = extractLastUserText(body);
      const qaTable = loadQaTable();
      const result = lookupQaAnswer(qaTable, lastUserText);

      logger.info(
        `[mock-server/diag] lastUserText="${lastUserText.slice(0, 200)}"` +
          (lastUserText.length > 200 ? "..." : "") +
          ` asstCount=${asstCount}` +
          (result._tag === "Right"
            ? ` -> entry.question="${result.right.question}"`
            : ` -> MISS (no entry matched)`),
      );

      if (result._tag === "Left") {
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
        writeSseStream(res, events, readMockServerConfig().streamDelayMs);
        return;
      }

      const entry = result.right;
      const turnIdx = Math.min(asstCount, entry.turns.length - 1);
      const turn = entry.turns[turnIdx];

      const lastTurn = entry.turns[entry.turns.length - 1];
      const currentRunAsstCount = countCurrentRunAssistants(body);
      const isPastLastTurn = currentRunAsstCount >= entry.turns.length;
      if (isPastLastTurn && lastTurn?.done === true) {
        const events = buildSseTurnEvents(
          {
            text: SHORT_CIRCUIT_TEXT,
            ...(lastTurn.thinking ? { thinking: lastTurn.thinking } : {}),
          },
          SHORT_CIRCUIT_TEXT.length,
        );
        logger.info(
          `[mock-server] done short-circuit "${entry.question}" ` +
            `asstCount=${asstCount} currentRunAsstCount=${currentRunAsstCount} ` +
            `turns.length=${entry.turns.length} ` +
            `lastTurn.done=true -> end_turn (${events.length} events)`,
        );
        writeHeadWithCors(res, 200, {
          "Content-Type": "application/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        writeSseStream(res, events, readMockServerConfig().streamDelayMs);
        return;
      }

      const { streamDelayMs: delayMs, deltaSize } = readMockServerConfig();
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


let server: ReturnType<typeof createServer> | null = null;

export function startMockServer(): void {
  if (server) {
    return;
  }

  const cfg = readMockServerConfig();

  if (cfg.isProduction && !cfg.forceEnableInProduction) {
    logger.info(`[mock-server] production mode, skipping (set CODEMAN_MOCK_FORCE=1 to override)`);
    return;
  }

  const host = cfg.host;
  const port = cfg.port;

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

export {
  lookupQaAnswer,
  buildSseEvents,
  buildSseTurnEvents,
  extractLastUserText,
  extractFirstUserText,
  countAssistantMessages,
};