import { JsonRpcConnection } from "../../jsonrpc";
import { logger } from "../../logger";
import type { McpTool } from "./mcp-types";


interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
}

interface ToolsListResult {
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}

const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "codeman-agent", version: "0.3.0" } as const;


export type HandshakePhase = "initialize" | "tools_list";

export class HandshakeError extends Error {
  readonly phase: HandshakePhase;
  constructor(phase: HandshakePhase, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.phase = phase;
    this.name = "HandshakeError";
  }
}


export async function performHandshake(
  connection: JsonRpcConnection,
  serverName: string,
): Promise<McpTool[]> {
  let initResult: InitializeResult;
  try {
    initResult = await connection.request<InitializeResult>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
  } catch (err) {
    throw new HandshakeError("initialize", err);
  }
  logger.info(`[mcp] ${serverName} initialized: serverInfo=${JSON.stringify(initResult.serverInfo)}`);

  connection.notify("notifications/initialized", {});

  let toolsResult: ToolsListResult;
  try {
    toolsResult = await connection.request<ToolsListResult>("tools/list", {});
  } catch (err) {
    throw new HandshakeError("tools_list", err);
  }
  return (toolsResult.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? {},
  }));
}