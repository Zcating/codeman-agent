
import { Effect, Schema } from "effect";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { app } from "electron";
import { InvalidConfig } from "../../../renderer/src/shared/lib/errors";
import type { McpServerConfig } from "./mcp-types";

const HOME = (): string => app.getPath("home");
export const MCP_CONFIG_PATH = (): string => join(HOME(), ".agents", "mcp_servers.json");

const McpConfigFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  servers: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      command: Schema.String,
      args: Schema.Array(Schema.String),
      env: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
      enabled: Schema.Boolean,
    }),
  ),
});

export interface McpConfigFile {
  version: 1;
  servers: McpServerConfig[];
}

export const readMcpConfig = Effect.fn("readMcpConfig")(function* () {
  const configPath = MCP_CONFIG_PATH();
  const result = yield* Effect.async<{ raw: string; isEio: boolean }>((resolve) => {
    readFile(configPath, "utf-8")
      .then((raw) => resolve(Effect.succeed({ raw, isEio: false })))
      .catch((e: NodeJS.ErrnoException) =>
        resolve(Effect.succeed({ raw: "", isEio: e.code === "ENOENT" })),
      );
  });
  if (result.isEio) {
    return { version: 1 as const, servers: [] as McpServerConfig[] };
  }
  const raw = result.raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return yield* Effect.fail(
      new InvalidConfig({
        field: "mcp_servers.json",
        message: `Cannot parse MCP config as JSON: ${(e as Error).message}`,
      }),
    );
  }

  const decoded = Schema.decodeUnknownEither(McpConfigFileSchema)(parsed);
  if (decoded._tag === "Left") {
    return yield* Effect.fail(
      new InvalidConfig({
        field: "mcp_servers.json",
        message: "MCP config does not match schema",
      }),
    );
  }
  return decoded.right as McpConfigFile;
});

export const writeMcpConfig = Effect.fn("writeMcpConfig")(function* (config: McpConfigFile) {
  const configPath = MCP_CONFIG_PATH();
  yield* Effect.tryPromise(() => mkdir(dirname(configPath), { recursive: true })).pipe(
    Effect.orElseSucceed(() => undefined),
  );
  const json = JSON.stringify(config, null, 2);
  yield* Effect.tryPromise({
    try: () => writeFile(configPath, json, "utf-8"),
    catch: (e) =>
      new InvalidConfig({
        field: "mcp_servers.json",
        message: `Cannot write MCP config: ${configPath} (${String(e)})`,
      }),
  });
});

export async function mcpConfigExists(): Promise<boolean> {
  try {
    await access(MCP_CONFIG_PATH());
    return true;
  } catch {
    return false;
  }
}