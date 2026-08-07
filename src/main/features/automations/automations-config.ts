// ADR-0053 TB — automations-config (Main 端)
import { Effect, Schema } from "effect";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { app } from "electron";
import { InvalidConfig } from "../../../renderer/src/shared/lib/errors";
import { AutomationRuleSchema } from "./automations-schema";
import type { AutomationRule } from "../../../shared/lib/automation-types";

// ---------------------------------------------------------------------------
// Schema & Types
// ---------------------------------------------------------------------------

const AutomationsConfigFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  rules: Schema.Array(AutomationRuleSchema),
});

export interface AutomationsConfigFile {
  version: 1;
  rules: AutomationRule[];
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

const HOME = (): string => app.getPath("home");
export const AUTOMATIONS_CONFIG_PATH = (): string =>
  join(HOME(), ".agents", "automations.json");

// ---------------------------------------------------------------------------
// readAutomationsConfig
// ---------------------------------------------------------------------------

export const readAutomationsConfig = Effect.fn("readAutomationsConfig")(function* () {
  const configPath = AUTOMATIONS_CONFIG_PATH();
  const result = yield* Effect.async<{ raw: string; isEio: boolean }>((resolve) => {
    readFile(configPath, "utf-8")
      .then((raw) => resolve(Effect.succeed({ raw, isEio: false })))
      .catch((e: NodeJS.ErrnoException) =>
        resolve(Effect.succeed({ raw: "", isEio: e.code === "ENOENT" })),
      );
  });
  if (result.isEio) {
    return { version: 1 as const, rules: [] as AutomationRule[] };
  }
  const raw = result.raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return yield* Effect.fail(
      new InvalidConfig({
        field: "automations.json",
        message: `Cannot parse automations config as JSON: ${(e as Error).message}`,
      }),
    );
  }

  const decoded = Schema.decodeUnknownEither(AutomationsConfigFileSchema)(parsed);
  if (decoded._tag === "Left") {
    return yield* Effect.fail(
      new InvalidConfig({
        field: "automations.json",
        message: "Automations config does not match schema",
      }),
    );
  }
  return decoded.right as AutomationsConfigFile;
});

// ---------------------------------------------------------------------------
// writeAutomationsConfig
// ---------------------------------------------------------------------------

export const writeAutomationsConfig = Effect.fn("writeAutomationsConfig")(
  function* (config: AutomationsConfigFile) {
    const configPath = AUTOMATIONS_CONFIG_PATH();
    yield* Effect.tryPromise(() =>
      mkdir(dirname(configPath), { recursive: true })
    ).pipe(Effect.orElseSucceed(() => undefined));
    const json = JSON.stringify(config, null, 2);
    yield* Effect.tryPromise({
      try: () => writeFile(configPath, json, "utf-8"),
      catch: (e) =>
        new InvalidConfig({
          field: "automations.json",
          message: `Cannot write automations config: ${configPath} (${String(e)})`,
        }),
    });
  },
);

// ---------------------------------------------------------------------------
// automationsConfigExists
// ---------------------------------------------------------------------------

export async function automationsConfigExists(): Promise<boolean> {
  try {
    await access(AUTOMATIONS_CONFIG_PATH());
    return true;
  } catch {
    return false;
  }
}
