export interface CompactionTriggerParams {
  enabled: boolean;
  contextWindow: number;
  reserveTokens: number;
  estimatedTokens: number;
}

/**
 * Determines whether auto-compaction should be triggered.
 * Returns false when compaction is disabled or context window is invalid.
 */
export function shouldTriggerAutoCompaction(params: CompactionTriggerParams): boolean {
  const { enabled, contextWindow, reserveTokens, estimatedTokens } = params;

  if (!enabled) return false;
  if (contextWindow <= 0) return false;

  const threshold = contextWindow - reserveTokens;
  return estimatedTokens >= threshold;
}
