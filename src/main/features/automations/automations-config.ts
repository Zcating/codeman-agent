/**
 * src/main/features/automations/automations-config.ts
 *
 * PR-γ (ADR-0058): automations 配置文件 IO。
 * 读/写/存在性三件套全部走 src/main/lib/json-config.ts 抽象。
 *
 * 行为契约（与 PR-γ 之前一致）：
 * - 文件不存在 → 返回 {version: 1, rules: []}（默认空配置）
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
import { AutomationRuleSchema } from "./automations-schema";
import type { AutomationRule } from "../../../shared/lib/automation-types";

const HOME = (): string => app.getPath("home");
export const AUTOMATIONS_CONFIG_PATH = (): string =>
  join(HOME(), ".agents", "automations.json");

const AutomationsConfigFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  rules: Schema.Array(AutomationRuleSchema),
});

export interface AutomationsConfigFile {
  version: 1;
  rules: AutomationRule[];
}

const DEFAULT_AUTOMATIONS_CONFIG: AutomationsConfigFile = {
  version: 1,
  rules: [],
};

/**
 * 读 automations 配置。文件不存在时返回默认空配置；解析/校验失败 → InvalidConfig。
 * R 通道要求 FileSystem.FileSystem。
 */
export const readAutomationsConfig = Effect.fn("readAutomationsConfig")(
  function* () {
    return yield* readJsonConfig(
      AUTOMATIONS_CONFIG_PATH(),
      AutomationsConfigFileSchema,
      DEFAULT_AUTOMATIONS_CONFIG,
    );
  },
);

/**
 * 写 automations 配置（覆盖）。自动 mkdir 父目录。
 * R 通道要求 FileSystem.FileSystem | Path.Path。
 */
export const writeAutomationsConfig = Effect.fn("writeAutomationsConfig")(
  function* (config: AutomationsConfigFile) {
    yield* writeJsonConfig(AUTOMATIONS_CONFIG_PATH(), config);
  },
);

/**
 * 检查 automations 配置文件是否存在。永不 fail。
 * R 通道要求 FileSystem.FileSystem。
 */
export const automationsConfigExists = Effect.fn("automationsConfigExists")(
  function* () {
    return yield* jsonConfigExists(AUTOMATIONS_CONFIG_PATH());
  },
);