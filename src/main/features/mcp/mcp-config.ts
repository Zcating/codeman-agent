/**
 * src/main/features/mcp/mcp-config.ts
 *
 * PR-γ (ADR-0058): MCP 配置文件 IO。
 * 读/写/存在性三件套全部走 src/main/lib/json-config.ts 抽象。
 *
 * 行为契约（与 PR-γ 之前一致）：
 * - 文件不存在 → 返回 {version: 1, servers: []}（默认空配置）
 * - 文件存在但解析失败 → Effect.fail(InvalidConfig)
 * - 文件存在但 schema 校验失败 → Effect.fail(InvalidConfig)
 *
 * 错误统一走 AppBackendError.InvalidConfig（来自 src/main/lib/errors.ts），
 * 不再依赖 renderer/src/shared/lib/errors.ts（ADR-0057 D1 物理分离）。
 */
import { Effect, Schema } from "effect";
import { app } from "electron";
import { join } from "node:path";
import {
  jsonConfigExists,
  readJsonConfig,
  writeJsonConfig,
} from "../../lib/json-config.js";
import type { McpServerConfig } from "./mcp-types";

const HOME = (): string => app.getPath("home");
export const MCP_CONFIG_PATH = (): string =>
  join(HOME(), ".agents", "mcp_servers.json");

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

const DEFAULT_MCP_CONFIG: McpConfigFile = { version: 1, servers: [] };

/**
 * 读 MCP 配置。文件不存在时返回默认空配置；解析/校验失败 → InvalidConfig。
 * R 通道要求 FileSystem.FileSystem。
 */
export const readMcpConfig = Effect.fn("readMcpConfig")(function* () {
  return yield* readJsonConfig(
    MCP_CONFIG_PATH(),
    McpConfigFileSchema,
    DEFAULT_MCP_CONFIG,
  );
});

/**
 * 写 MCP 配置（覆盖）。自动 mkdir 父目录。
 * R 通道要求 FileSystem.FileSystem | Path.Path。
 */
export const writeMcpConfig = Effect.fn("writeMcpConfig")(
  function* (config: McpConfigFile) {
    yield* writeJsonConfig(MCP_CONFIG_PATH(), config);
  },
);

/**
 * 检查 MCP 配置文件是否存在。永不 fail。
 * R 通道要求 FileSystem.FileSystem。
 */
export const mcpConfigExists = Effect.fn("mcpConfigExists")(function* () {
  return yield* jsonConfigExists(MCP_CONFIG_PATH());
});