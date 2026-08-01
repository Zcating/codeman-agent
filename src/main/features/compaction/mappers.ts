export interface RawCompactionEntryRow {
  id: string;
  conversation_id: string;
  summary: string;
  model: string;
  tokens_before: number;
  kind: string;
  created_at: number;
  first_kept_message_id: string;
}

export interface CompactionEntry {
  id: string;
  conversationId: string;
  summary: string;
  model: string;
  tokensBefore: number;
  kind: "auto" | "manual";
  createdAt: number;
  firstKeptMessageId: string;
}

export function toCompactionEntry(row: RawCompactionEntryRow): CompactionEntry {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    summary: row.summary,
    model: row.model,
    tokensBefore: row.tokens_before,
    kind: row.kind as "auto" | "manual",
    createdAt: row.created_at,
    firstKeptMessageId: row.first_kept_message_id,
  };
}

export function fromCompactionEntry(entry: CompactionEntry): [
  string,
  string,
  string,
  string,
  number,
  "auto" | "manual",
  number,
  string,
] {
  return [
    entry.id,
    entry.conversationId,
    entry.summary,
    entry.model,
    entry.tokensBefore,
    entry.kind,
    entry.createdAt,
    entry.firstKeptMessageId,
  ];
}
