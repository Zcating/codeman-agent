import { match } from "ts-pattern";
import {
  AppBackendError,
  Compaction,
  CredentialStore,
  ExtensionLoad,
  ModelAuth,
  ModelContextLength,
  ModelProtocol,
  ModelProvider,
  ModelRateLimit,
  ModelTimeout,
  PiRuntime,
  ResourceLoad,
  SessionFilesystem,
  SessionNotFound,
  SessionPermission,
  ToolArgument,
  ToolExecute,
  ToolUnavailable,
  Unknown,
} from "../lib/errors.js";
import { classifyError } from "./error-classifier.js";

export function mapPiError(err: unknown): AppBackendError {
  const category = classifyError(err);
  const message = err instanceof Error ? err.message : String(err);

  return match(category)
    .with("model_provider", () =>
      new ModelProvider({
        message,
        statusCode:
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err.statusCode as number | undefined)
            : undefined,
        providerId:
          typeof err === "object" && err !== null && "providerId" in err
            ? (err.providerId as string | undefined)
            : undefined,
      }),
    )
    .with("model_auth", () =>
      new ModelAuth({
        message,
        providerId:
          typeof err === "object" && err !== null && "providerId" in err
            ? (err.providerId as string | undefined)
            : undefined,
      }),
    )
    .with("model_rate_limit", () =>
      new ModelRateLimit({
        message,
        retryAfterMs:
          typeof err === "object" && err !== null && "retryAfterMs" in err
            ? (err.retryAfterMs as number | undefined)
            : undefined,
      }),
    )
    .with("model_context_length", () =>
      new ModelContextLength({
        message,
        contextTokens:
          typeof err === "object" && err !== null && "contextTokens" in err
            ? (err.contextTokens as number | undefined)
            : undefined,
        maxTokens:
          typeof err === "object" && err !== null && "maxTokens" in err
            ? (err.maxTokens as number | undefined)
            : undefined,
      }),
    )
    .with("model_timeout", () =>
      new ModelTimeout({
        message,
        timeoutMs:
          typeof err === "object" && err !== null && "timeoutMs" in err
            ? (err.timeoutMs as number | undefined)
            : undefined,
      }),
    )
    .with("model_protocol", () =>
      new ModelProtocol({
        message,
        detail:
          typeof err === "object" && err !== null && "detail" in err
            ? (err.detail as string | undefined)
            : undefined,
      }),
    )
    .with("session_not_found", () =>
      new SessionNotFound({
        message,
        sessionId:
          typeof err === "object" && err !== null && "sessionId" in err
            ? (err.sessionId as string | undefined)
            : undefined,
      }),
    )
    .with("session_permission", () =>
      new SessionPermission({
        message,
        path:
          typeof err === "object" && err !== null && "path" in err
            ? (err.path as string | undefined)
            : undefined,
      }),
    )
    .with("session_filesystem", () =>
      new SessionFilesystem({
        message,
        path:
          typeof err === "object" && err !== null && "path" in err
            ? (err.path as string | undefined)
            : undefined,
      }),
    )
    .with("tool_execute", () =>
      new ToolExecute({
        toolName:
          typeof err === "object" && err !== null && "toolName" in err
            ? (err.toolName as string)
            : "unknown",
        message,
      }),
    )
    .with("tool_argument", () =>
      new ToolArgument({
        toolName:
          typeof err === "object" && err !== null && "toolName" in err
            ? (err.toolName as string)
            : "unknown",
        message,
        argumentName:
          typeof err === "object" && err !== null && "argumentName" in err
            ? (err.argumentName as string | undefined)
            : undefined,
      }),
    )
    .with("tool_unavailable", () =>
      new ToolUnavailable({
        toolName:
          typeof err === "object" && err !== null && "toolName" in err
            ? (err.toolName as string)
            : "unknown",
        message,
      }),
    )
    .with("compaction", () =>
      new Compaction({
        message,
      }),
    )
    .with("extension_load", () =>
      new ExtensionLoad({
        extensionPath:
          typeof err === "object" && err !== null && "extensionPath" in err
            ? (err.extensionPath as string)
            : "unknown",
        message,
      }),
    )
    .with("credential_store", () =>
      new CredentialStore({
        message,
        operation:
          typeof err === "object" && err !== null && "operation" in err
            ? (err.operation as "login" | "logout" | "setRuntimeApiKey" | "removeRuntimeApiKey" | undefined)
            : undefined,
      }),
    )
    .with("resource_load", () =>
      new ResourceLoad({
        message,
        resourcePath:
          typeof err === "object" && err !== null && "resourcePath" in err
            ? (err.resourcePath as string | undefined)
            : undefined,
      }),
    )
    .with("pi_runtime", () =>
      new PiRuntime({
        message,
        detail:
          typeof err === "object" && err !== null && "detail" in err
            ? (err.detail as string | undefined)
            : undefined,
      }),
    )
    .with("unknown", () => new Unknown({ message }))
    .exhaustive();
}
