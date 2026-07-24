//! V3.1 MCP — `~/.agents/mcp_servers.json` config loader (ADR-0032 D1).
//!
//! Format:
//! ```json
//! {
//!   "version": 1,
//!   "servers": [
//!     { "name": "github", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
//!       "env": { "GITHUB_TOKEN": "..." }, "enabled": true }
//!   ]
//! }
//! ```
//!
//! V1: read-only. Enable toggling writes back to disk (preserves comments — well, no
//! JSON has no comments, but we preserve the rest of the file structure).

import { Effect, Schema } from "effect";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { app } from "electron";
import { InvalidConfig } from "../renderer/src/shared/lib/errors";
import type { McpServerConfig } from "./mcp-host";

const HOME = (): string => app.getPath("home");
export const MCP_CONFIG_PATH = (): string => join(HOME(), ".agents", "mcp_servers.json");
const MCP_CONFIG_DIR = (): string => join(HOME(), ".agents");

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

/** Read `~/.agents/mcp_servers.json`. Returns empty config if file doesn't exist. */
export const readMcpConfig = Effect.fn("readMcpConfig")(function* () {
  const configPath = MCP_CONFIG_PATH();
  // ENOENT → empty config (no servers configured yet)
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

/** Write `~/.agents/mcp_servers.json`, creating the directory if needed. */
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

/** Convenience: check if config file exists. */
export async function mcpConfigExists(): Promise<boolean> {
  try {
    await access(MCP_CONFIG_PATH());
    return true;
  } catch {
    return false;
  }
}