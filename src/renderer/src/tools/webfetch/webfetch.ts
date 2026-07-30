import { Effect, Exit, Schema } from "effect";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";
import type { Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { WebfetchApi, WebfetchApiLive, type FetchResult } from "@codeman-frontend/shared/apis";
import { InvalidConfig, Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";
import { WebfetchParamsSchema } from "./schemas.js";

const webfetchParams = toToolParameters(WebfetchParamsSchema);

const webfetch = Effect.fn(
  function* (typedArgs: Static<typeof webfetchParams>) {
    const svc = yield* WebfetchApi;
    return yield* svc.fetch({
      url: typedArgs.url,
      format: typedArgs.format ?? "markdown",
      timeoutSeconds: typedArgs.timeout ?? 30,
    });
  },
  Effect.provide(WebfetchApiLive),
);

export const webfetchTool: AgentTool<typeof webfetchParams, FetchResult | AppError> = {
  label: "webfetch",
  name: "webfetch",
  description:
    "Fetch the content of a public HTTP/HTTPS URL and return it as text, markdown, or HTML. " +
    "Markdown is the default. Use this to look up documentation, read changelogs, or fetch error " +
    "messages from public sources. Private/loopback IPs are blocked. Max response: 5MB; default timeout: 30s.",
  parameters: webfetchParams,
  execute: async (_toolCallId, args) => {
    const decoded = Schema.decodeUnknownEither(WebfetchParamsSchema)(args);
    if (decoded._tag === "Left") {
      const err = new InvalidConfig({ message: decoded.left.message });
      return {
        content: [{ type: "text" as const, text: `Invalid params: ${err.message}` }],
        details: err,
      };
    }
    const typedArgs = decoded.right;
    const exit = await Effect.runPromiseExit(webfetch(typedArgs));
    if (Exit.isFailure(exit)) {
      const cause = exit.cause;
      const err: AppError =
        cause._tag === "Fail"
          ? (cause.error as AppError)
          : new Unknown({ message: String(cause) });
      return {
        content: [
          {
            type: "text" as const,
            text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}`,
          },
        ],
        details: err,
      };
    }
    const value = exit.value;
    return {
      content: [
        {
          type: "text" as const,
          text: `URL: ${value.url}\nContent-Type: ${value.contentType}\nFormat: ${value.format}\n\n${value.output}`,
        },
      ],
      details: value,
    };
  },
};
