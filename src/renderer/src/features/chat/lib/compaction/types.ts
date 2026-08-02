// CompactionEntry re-exported from IPC mapper types (T1)
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

export interface PerformCompactionDeps {
  readonly summarize: (args: {
    previousSummary: string | null;
    messagesToSummarize: string[];
  }) => Promise<string>;
  readonly estimateTokens: (text: string) => number;
  readonly sanitize: (text: string) => string;
  readonly appendEntry: (entry: Omit<CompactionEntry, "id" | "createdAt">) => Promise<CompactionEntry>;
}

export interface PerformCompactionCtx {
  readonly conversationId: string;
  readonly model: string;
  readonly messages: string[];
  readonly previousSummary: string | null;
  readonly signal?: AbortSignal;
  readonly kind: "auto" | "manual";
  readonly firstKeptMessageId: string;
}
