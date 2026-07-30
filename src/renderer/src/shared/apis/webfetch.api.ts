import { Context, Effect, Layer } from "effect";
import { invoke } from "./invoke.api";
import { htmlToMarkdown, htmlToText } from "@codeman-frontend/tools/webfetch/html-to-markdown";
import { type AppError } from "@codeman-frontend/shared/lib/errors";

export interface FetchResult {
  url: string;
  contentType: string;
  format: "text" | "markdown" | "html";
  output: string;
}

export class WebfetchApi extends Context.Tag("WebfetchApi")<
  WebfetchApi,
  {
    readonly fetch: (args: {
      url: string;
      format: "text" | "markdown" | "html";
      timeoutSeconds: number;
    }) => Effect.Effect<FetchResult, AppError>;
  }
>() {}

export const WebfetchApiLive = Layer.succeed(WebfetchApi, {
  fetch: ({ url, format, timeoutSeconds }) =>
    Effect.gen(function* () {
      const raw = yield* invoke<{
        status: number;
        contentType: string;
        body: ArrayBuffer;
      }>("webfetch", { url, timeout: timeoutSeconds });
      const decoder = new TextDecoder();
      const body = decoder.decode(raw.body);
      const isHtml = raw.contentType?.toLowerCase().includes("text/html") ?? false;
      const output = isHtml
        ? format === "markdown"
          ? htmlToMarkdown(body)
          : format === "text"
            ? htmlToText(body)
            : body
        : body;
      return { url, contentType: raw.contentType, format, output };
    }),
});
