import { Schema } from "effect";

const URL_PATTERN = /^https?:\/\//i;

export const WebfetchParamsSchema = Schema.Struct({
  url: Schema.String.pipe(
    Schema.pattern(URL_PATTERN, { message: () => "URL must start with http:// or https://" }),
  ),
  format: Schema.optional(
    Schema.Literal("text", "markdown", "html"),
  ),
  timeout: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.between(5, 120),
    ),
  ),
});
