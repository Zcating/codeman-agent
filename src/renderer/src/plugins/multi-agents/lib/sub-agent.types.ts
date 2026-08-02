import { Schema } from "effect";

export type SubAgentId = string;

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export const ThinkingLevelSchema = Schema.Literal(
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
);

export interface SubAgentConfig {
  readonly id: SubAgentId;
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly modelId: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly allowedTools: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const SubAgentConfigSchema: Schema.Schema<SubAgentConfig> = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  systemPrompt: Schema.String,
  modelId: Schema.String,
  thinkingLevel: ThinkingLevelSchema,
  allowedTools: Schema.Array(Schema.String),
  enabled: Schema.Boolean,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});
