import { Effect, Schema } from "effect";

// ---------------------------------------------------------------------------
// Branded Schema — AutomationId
// ---------------------------------------------------------------------------
export const AutomationIdSchema = Schema.String.pipe(Schema.brand("AutomationId"));

export type AutomationId = Schema.Schema.Type<typeof AutomationIdSchema>;

// ---------------------------------------------------------------------------
// AutomationSchedule — 三种形态
// ---------------------------------------------------------------------------
const IntervalScheduleSchema = Schema.Struct({
  kind: Schema.Literal("interval"),
  everyMs: Schema.Number,
});

const DailyScheduleSchema = Schema.Struct({
  kind: Schema.Literal("daily"),
  hour: Schema.Number,
  minute: Schema.Number,
});

const WeeklyScheduleSchema = Schema.Struct({
  kind: Schema.Literal("weekly"),
  weekday: Schema.Union(
    Schema.Literal(0),
    Schema.Literal(1),
    Schema.Literal(2),
    Schema.Literal(3),
    Schema.Literal(4),
    Schema.Literal(5),
    Schema.Literal(6),
  ),
  hour: Schema.Number,
  minute: Schema.Number,
});

export const AutomationScheduleSchema = Schema.Union(
  IntervalScheduleSchema,
  DailyScheduleSchema,
  WeeklyScheduleSchema,
);

// ---------------------------------------------------------------------------
// AutomationAction — llm | script
// ---------------------------------------------------------------------------
const LlmActionSchema = Schema.Struct({
  kind: Schema.Literal("llm"),
  systemPrompt: Schema.String,
  userPrompt: Schema.String,
  providerId: Schema.String,
  modelId: Schema.String,
  timeoutMs: Schema.Number.pipe(Schema.between(30_000, 1_800_000)),
});

const ScriptActionSchema = Schema.Struct({
  kind: Schema.Literal("script"),
  language: Schema.Union(Schema.Literal("shell"), Schema.Literal("javascript")),
  source: Schema.String,
  workspaceId: Schema.String,
  timeoutMs: Schema.Number.pipe(Schema.between(5_000, 1_800_000)),
});

export const AutomationActionSchema = Schema.Union(
  LlmActionSchema,
  ScriptActionSchema,
);

// ---------------------------------------------------------------------------
// AutomationRule — 完整结构
// ---------------------------------------------------------------------------
export const AutomationRuleSchema = Schema.Struct({
  id: Schema.String, // AutomationId = string per
  name: Schema.String,
  enabled: Schema.Boolean,
  schedule: AutomationScheduleSchema,
  action: AutomationActionSchema,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});

// ---------------------------------------------------------------------------
// parseAutomationRule — 暴露的解析入口
// ---------------------------------------------------------------------------
export const parseAutomationRule = (input: unknown) =>
  Effect.either(Schema.decodeUnknownEither(AutomationRuleSchema)(input));
