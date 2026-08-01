import { Schema } from "effect";

export class CompactionFailed extends Schema.TaggedError<CompactionFailed>()(
  "CompactionFailed",
  {
    reason: Schema.String,
  },
) {}

export class CompactionCancelled extends Schema.TaggedError<CompactionCancelled>()(
  "CompactionCancelled",
  {},
) {}
