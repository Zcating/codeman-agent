//! ADR-0025 — Effect Schema-based AppError model.
//!
//! Eight INDEPENDENT `Schema.TaggedError` leaf classes, each carrying its own
//! instance `_tag`, exported as the `AppError` union + an `isAppError` type guard.
//! Replaces the legacy `{ kind }` union that previously lived in `./types`
//! (deleted in PR 2).
//!
//! DESIGN NOTE (ADR-0025 D4 correction): the ADR proposed a common base class with
//! `static _tag` overrides. That is BROKEN on Effect 3.x — `Schema.TaggedError()`
//! bakes the INSTANCE `_tag` to the literal tag passed to the base ctor, so a
//! subclass `static _tag` never reaches the instance and `Effect.catchTag` never
//! matches. Correct idiom: N independent TaggedError leaf classes + union + guard.
//! Optional fields use `Schema.optional` (D7 correction) to keep the legacy
//! `field?: string` runtime shape and stay IPC-serialization-safe.
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
  // ADR-0025 D4: SandboxViolation gains a message field. Kept OPTIONAL so PR 1
  // requires no construction-site changes; PR 2 may populate it at throw sites.
  message: Schema.optional(Schema.String),
  path: Schema.String,
  workspaceLabel: Schema.String,
}) {}

export class Unknown extends Schema.TaggedError<Unknown>()("Unknown", {
  message: Schema.String,
}) {}

/** New Schema-based application error union (ADR-0025). Discriminate via `_tag`. */
export type AppError =
  | NotFound
  | Unauthorized
  | Network
  | InvalidConfig
  | Database
  | ToolCall
  | SandboxViolation
  | Unknown;

/**
 * Runtime type guard replacing the (impossible) `instanceof AppError` base-class
 * check. True iff `u` is one of the eight `Schema.TaggedError` variant instances.
 */
export const isAppError = (u: unknown): u is AppError =>
  u instanceof NotFound ||
  u instanceof Unauthorized ||
  u instanceof Network ||
  u instanceof InvalidConfig ||
  u instanceof Database ||
  u instanceof ToolCall ||
  u instanceof SandboxViolation ||
  u instanceof Unknown;
