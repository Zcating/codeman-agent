import { Schema } from "effect";
import { ThinkingLevelSchema } from "@codeman-frontend/shared/lib/sub-agent-schema";

export const SubAgentFormSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  systemPrompt: Schema.String,
  modelId: Schema.String,
  thinkingLevel: ThinkingLevelSchema,
  allowedTools: Schema.mutable(Schema.Array(Schema.String)),
  enabled: Schema.Boolean,
});

export type SubAgentFormValues = Schema.Schema.Type<typeof SubAgentFormSchema>;
