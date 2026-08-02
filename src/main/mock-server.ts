
import { createServer } from "node:http";
import { lookupQaAnswer } from "./features/mock-server/qa-lookup";
import { buildSseEvents, buildSseTurnEvents } from "./features/mock-server/sse";
import {
  extractLastUserText,
  extractFirstUserText,
  countAssistantMessages,
} from "./features/mock-server/request-parser";
import { readMockServerConfig } from "./config-service";
import { handleRequest } from "./features/mock-server/http-handler";


const logger = {
  warn(msg: string): void {
    console.warn(msg);
  },
  info(msg: string): void {
    console.log(msg);
  },
};

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