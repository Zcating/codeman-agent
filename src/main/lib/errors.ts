import { Schema } from "effect";

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
) {}

export class Network extends Schema.TaggedError<Network>()("Network", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()(
  "InvalidConfig",
  {
    message: Schema.String,
    field: Schema.optional(Schema.String),
  },
) {}

export class Database extends Schema.TaggedError<Database>()("Database", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.TaggedError<ToolCall>()("ToolCall", {
  toolCallId: Schema.String,
  message: Schema.String,
}) {}

export class Unknown extends Schema.TaggedError<Unknown>()("Unknown", {
  message: Schema.String,
}) {}

export class JsonRpcProtocolError extends Schema.TaggedError<JsonRpcProtocolError>()(
  "JsonRpcProtocolError",
  {
    message: Schema.String,
    code: Schema.Number,
  },
) {}

export class JsonRpcTimeoutError extends Schema.TaggedError<JsonRpcTimeoutError>()(
  "JsonRpcTimeoutError",
  {
    message: Schema.String,
    method: Schema.String,
    timeoutMs: Schema.Number,
  },
) {}

export class ModelProvider extends Schema.TaggedError<ModelProvider>()(
  "ModelProvider",
  {
    message: Schema.String,
    providerId: Schema.optional(Schema.String),
    statusCode: Schema.optional(Schema.Number),
  },
) {}

export class ModelAuth extends Schema.TaggedError<ModelAuth>()("ModelAuth", {
  message: Schema.String,
  providerId: Schema.optional(Schema.String),
}) {}

export class ModelRateLimit extends Schema.TaggedError<ModelRateLimit>()(
  "ModelRateLimit",
  {
    message: Schema.String,
    providerId: Schema.optional(Schema.String),
    retryAfterMs: Schema.optional(Schema.Number),
  },
) {}

export class ModelContextLength extends Schema.TaggedError<ModelContextLength>()(
  "ModelContextLength",
  {
    message: Schema.String,
    contextTokens: Schema.optional(Schema.Number),
    maxTokens: Schema.optional(Schema.Number),
  },
) {}

export class ModelTimeout extends Schema.TaggedError<ModelTimeout>()(
  "ModelTimeout",
  {
    message: Schema.String,
    timeoutMs: Schema.optional(Schema.Number),
  },
) {}

export class ModelProtocol extends Schema.TaggedError<ModelProtocol>()(
  "ModelProtocol",
  {
    message: Schema.String,
    detail: Schema.optional(Schema.String),
  },
) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()(
  "SessionNotFound",
  {
    message: Schema.String,
    sessionId: Schema.optional(Schema.String),
  },
) {}

export class SessionPermission extends Schema.TaggedError<SessionPermission>()(
  "SessionPermission",
  {
    message: Schema.String,
    path: Schema.optional(Schema.String),
  },
) {}

export class SessionFilesystem extends Schema.TaggedError<SessionFilesystem>()(
  "SessionFilesystem",
  {
    message: Schema.String,
    path: Schema.optional(Schema.String),
  },
) {}

export class ToolExecute extends Schema.TaggedError<ToolExecute>()("ToolExecute", {
  toolName: Schema.String,
  message: Schema.String,
}) {}

export class ToolArgument extends Schema.TaggedError<ToolArgument>()(
  "ToolArgument",
  {
    toolName: Schema.String,
    message: Schema.String,
    argumentName: Schema.optional(Schema.String),
  },
) {}

export class ToolUnavailable extends Schema.TaggedError<ToolUnavailable>()(
  "ToolUnavailable",
  {
    toolName: Schema.String,
    message: Schema.String,
  },
) {}

export class Compaction extends Schema.TaggedError<Compaction>()("Compaction", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class ExtensionLoad extends Schema.TaggedError<ExtensionLoad>()(
  "ExtensionLoad",
  {
    extensionPath: Schema.String,
    message: Schema.String,
  },
) {}

export class CredentialStore extends Schema.TaggedError<CredentialStore>()(
  "CredentialStore",
  {
    message: Schema.String,
    operation: Schema.optional(
      Schema.Union(
        Schema.Literal("login"),
        Schema.Literal("logout"),
        Schema.Literal("setRuntimeApiKey"),
        Schema.Literal("removeRuntimeApiKey"),
      ),
    ),
  },
) {}

export class ResourceLoad extends Schema.TaggedError<ResourceLoad>()(
  "ResourceLoad",
  {
    message: Schema.String,
    resourcePath: Schema.optional(Schema.String),
  },
) {}

export class PiRuntime extends Schema.TaggedError<PiRuntime>()("PiRuntime", {
  message: Schema.String,
  detail: Schema.optional(Schema.String),
}) {}

export const AppBackendError = {
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  Unknown,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
  ModelProvider,
  ModelAuth,
  ModelRateLimit,
  ModelContextLength,
  ModelTimeout,
  ModelProtocol,
  SessionNotFound,
  SessionPermission,
  SessionFilesystem,
  ToolExecute,
  ToolArgument,
  ToolUnavailable,
  Compaction,
  ExtensionLoad,
  CredentialStore,
  ResourceLoad,
  PiRuntime,
} as const;

export type AppBackendError =
  | NotFound
  | Unauthorized
  | Network
  | InvalidConfig
  | Database
  | ToolCall
  | Unknown
  | JsonRpcProtocolError
  | JsonRpcTimeoutError
  | ModelProvider
  | ModelAuth
  | ModelRateLimit
  | ModelContextLength
  | ModelTimeout
  | ModelProtocol
  | SessionNotFound
  | SessionPermission
  | SessionFilesystem
  | ToolExecute
  | ToolArgument
  | ToolUnavailable
  | Compaction
  | ExtensionLoad
  | CredentialStore
  | ResourceLoad
  | PiRuntime;

export const AppBackendErrorSchema = Schema.Union(
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  Unknown,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
  ModelProvider,
  ModelAuth,
  ModelRateLimit,
  ModelContextLength,
  ModelTimeout,
  ModelProtocol,
  SessionNotFound,
  SessionPermission,
  SessionFilesystem,
  ToolExecute,
  ToolArgument,
  ToolUnavailable,
  Compaction,
  ExtensionLoad,
  CredentialStore,
  ResourceLoad,
  PiRuntime,
);
