import { Schema } from "effect";

export const ConversationIdSchema = Schema.String.pipe(Schema.brand("ConversationId"));
export type ConversationId = Schema.Schema.Type<typeof ConversationIdSchema>;

export const ToolCallIdSchema = Schema.String.pipe(Schema.brand("ToolCallId"));
export type ToolCallId = Schema.Schema.Type<typeof ToolCallIdSchema>;

const NonEmptyString = Schema.String.pipe(
  Schema.minLength(1, { message: () => "请输入消息内容" }),
);

export const DraftFieldSchema = NonEmptyString;

export const ModelIdFieldSchema = Schema.String;

export const WorkspaceIdFieldSchema = NonEmptyString;

export const HomeFormSchema = Schema.Struct({
  draft: NonEmptyString,
  modelId: Schema.String,
  workspaceId: NonEmptyString,
});

export const ChatViewFormSchema = Schema.Struct({
  draft: NonEmptyString,
  modelId: Schema.String,
});

export type HomeFormValue = Schema.Schema.Type<typeof HomeFormSchema>;

export type ChatViewFormValue = Schema.Schema.Type<typeof ChatViewFormSchema>;
