export { shouldTriggerAutoCompaction } from "./trigger";
export { sanitizeSummary } from "./sanitize";
export { performCompaction } from "./perform";
export { applyCompactionToContext } from "./apply";
export { CompactionFailed, CompactionCancelled } from "./errors";
export type { CompactionEntry, PerformCompactionDeps, PerformCompactionCtx } from "./types";
