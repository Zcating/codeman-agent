export type PiErrorCategory =
  | "model_provider"
  | "model_auth"
  | "model_rate_limit"
  | "model_context_length"
  | "model_timeout"
  | "model_protocol"
  | "session_not_found"
  | "session_permission"
  | "session_filesystem"
  | "tool_execute"
  | "tool_argument"
  | "tool_unavailable"
  | "compaction"
  | "extension_load"
  | "credential_store"
  | "resource_load"
  | "pi_runtime"
  | "unknown";

const PI_ERROR_CLASSIFIER: Record<string, PiErrorCategory> = {
  CredentialSynchronizationError: "credential_store",
  MissingSessionCwdError: "session_permission",
  SessionImportFileNotFoundError: "session_not_found",
  AuthCommandError: "model_auth",
  SessionNotFoundError: "session_not_found",
  SessionPermissionError: "session_permission",
  SessionFilesystemError: "session_filesystem",
  ModelProviderError: "model_provider",
  ModelAuthError: "model_auth",
  ModelRateLimitError: "model_rate_limit",
  ModelContextLengthError: "model_context_length",
  ModelTimeoutError: "model_timeout",
  ModelProtocolError: "model_protocol",
  ToolExecuteError: "tool_execute",
  ToolArgumentError: "tool_argument",
  ToolUnavailableError: "tool_unavailable",
  CompactionError: "compaction",
  ExtensionLoadError: "extension_load",
  ResourceLoadError: "resource_load",
  PiRuntimeError: "pi_runtime",
};

const EFFECT_ERROR_TAG_TO_CATEGORY: Record<string, PiErrorCategory> = {
  ModelProvider: "model_provider",
  ModelAuth: "model_auth",
  ModelRateLimit: "model_rate_limit",
  ModelContextLength: "model_context_length",
  ModelTimeout: "model_timeout",
  ModelProtocol: "model_protocol",
  SessionNotFound: "session_not_found",
  SessionPermission: "session_permission",
  SessionFilesystem: "session_filesystem",
  ToolExecute: "tool_execute",
  ToolArgument: "tool_argument",
  ToolUnavailable: "tool_unavailable",
  Compaction: "compaction",
  ExtensionLoad: "extension_load",
  CredentialStore: "credential_store",
  ResourceLoad: "resource_load",
  PiRuntime: "pi_runtime",
  NotFound: "unknown",
  Unauthorized: "unknown",
  Network: "unknown",
  InvalidConfig: "unknown",
  Database: "unknown",
  ToolCall: "tool_execute",
  Unknown: "unknown",
  JsonRpcProtocolError: "model_protocol",
  JsonRpcTimeoutError: "model_timeout",
};

const HTTP_STATUS_TO_CATEGORY: Record<number, PiErrorCategory> = {
  400: "model_protocol",
  401: "model_auth",
  403: "model_auth",
  404: "resource_load",
  408: "model_timeout",
  409: "model_protocol",
  413: "model_context_length",
  414: "model_context_length",
  422: "tool_argument",
  429: "model_rate_limit",
  500: "model_provider",
  502: "model_provider",
  503: "model_provider",
  504: "model_timeout",
};

export function classifyError(err: unknown): PiErrorCategory {
  if (err === null || err === undefined) {
    return "unknown";
  }

  if (typeof err === "object") {
    const e = err as Record<string, unknown>;

    if (typeof e._tag === "string") {
      const category = EFFECT_ERROR_TAG_TO_CATEGORY[e._tag];
      if (category) {
        return category;
      }
    }

    if (typeof e.constructor === "function" && typeof e.constructor.name === "string") {
      const constructorName = e.constructor.name;
      const category = PI_ERROR_CLASSIFIER[constructorName];
      if (category) {
        return category;
      }
    }

    if (typeof e.statusCode === "number") {
      const category = HTTP_STATUS_TO_CATEGORY[e.statusCode];
      if (category) {
        return category;
      }
    }

    if (typeof e.code === "number") {
      const category = HTTP_STATUS_TO_CATEGORY[e.code];
      if (category) {
        return category;
      }
    }

    if (typeof e.name === "string") {
      const category = PI_ERROR_CLASSIFIER[e.name];
      if (category) {
        return category;
      }
    }

    if (e instanceof Error) {
      if (e.message.includes("timeout") || e.message.includes("Timeout")) {
        return "model_timeout";
      }
      if (e.message.includes("auth") || e.message.includes("Auth")) {
        return "model_auth";
      }
      if (e.message.includes("rate limit") || e.message.includes("rate_limit")) {
        return "model_rate_limit";
      }
      if (e.message.includes("context length") || e.message.includes("context_window")) {
        return "model_context_length";
      }
    }
  }

  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return "model_timeout";
    }
    if (err.message.includes("credential") || err.message.includes("Credential")) {
      return "credential_store";
    }
    if (err.message.includes("session") || err.message.includes("Session")) {
      return "session_not_found";
    }
  }

  return "unknown";
}
