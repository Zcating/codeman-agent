













import { Schema } from "effect";

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
}) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

export class Network extends Schema.TaggedError<Network>()("Network", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {
  message: Schema.String,
  field: Schema.optional(Schema.String),
}) {}

export class Database extends Schema.TaggedError<Database>()("Database", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.TaggedError<ToolCall>()("ToolCall", {
  toolCallId: Schema.String,
  message: Schema.String,
}) {}

export class SandboxViolation extends Schema.TaggedError<SandboxViolation>()("SandboxViolation", {
  
  
  message: Schema.optional(Schema.String),
  path: Schema.String,
  workspaceLabel: Schema.String,
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


export type AppError =
  | NotFound
  | Unauthorized
  | Network
  | InvalidConfig
  | Database
  | ToolCall
  | SandboxViolation
  | Unknown
  | JsonRpcProtocolError
  | JsonRpcTimeoutError;


export const isAppError = (u: unknown): u is AppError =>
  u instanceof NotFound ||
  u instanceof Unauthorized ||
  u instanceof Network ||
  u instanceof InvalidConfig ||
  u instanceof Database ||
  u instanceof ToolCall ||
  u instanceof SandboxViolation ||
  u instanceof Unknown ||
  u instanceof JsonRpcProtocolError ||
  u instanceof JsonRpcTimeoutError;
