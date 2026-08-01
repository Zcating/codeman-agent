export interface RawConvRow {
  id: string;
  title: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  workspace_id: string | undefined;
}

export interface RawMsgRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  thinking: string | null;
  tool_calls: string | null;
  tool_results: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

export interface Conversation {
  id: string;
  title: string;
  systemPrompt: string | null;
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  thinking: string | null;
  toolCalls: unknown;
  toolResults: unknown;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
}

export function toConversation(row: RawConvRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    systemPrompt: row.system_prompt ?? null,
    workspaceId: row.workspace_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
  };
}

export function toMessage(row: RawMsgRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    thinking: row.thinking ?? null,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
    toolResults: row.tool_results ? JSON.parse(row.tool_results) : null,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
  };
}
