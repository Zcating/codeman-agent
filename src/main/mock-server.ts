
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadQaTable } from "./features/mock-server/qa-loader";
import { writeHeadWithCors } from "./features/mock-server/cors";
import { lookupQaAnswer } from "./features/mock-server/qa-lookup";
import { buildSseEvents, buildSseTurnEvents, writeSseStream } from "./features/mock-server/sse";
import {
  readJsonBody,
  extractLastUserText,
  extractFirstUserText,
  countAssistantMessages,
  countCurrentRunAssistants,
} from "./features/mock-server/request-parser";
import { readMockServerConfig } from "./config-service";


const logger = {
  warn(msg: string): void {
    console.warn(msg);
  },
  info(msg: string): void {
    console.log(msg);
  },
};

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