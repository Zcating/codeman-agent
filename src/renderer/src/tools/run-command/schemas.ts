import { Schema } from "effect";

export const RunCommandParamsSchema = Schema.Struct({
  command: Schema.String.pipe(Schema.minLength(1, { message: () => "command must not be empty" })),
  cwd: Schema.optional(
    Schema.String.pipe(
      Schema.filter((s) => !s.split(/[\\/]+/).some((seg) => seg === ".."), {
        message: () => "Path component '..' is not allowed",
      }),
    ),
  ),
  timeoutMs: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(1000, 1_800_000))),
});
