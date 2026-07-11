//! qa-table-lookup — substring-match lookup against Q→A entries (dev mock LLM).

import { Either } from "effect";
import type { QaEntry } from "../../../shared/lib/types";

export type QaMiss = { readonly _tag: "QaMiss"; readonly question: string };
export type QaResult = Either.Either<string, QaMiss>;

/**
 * Resolve a user message against a Q→A table.
 *
 * Strategy:
 * 1. First-wins substring match on `entry.question` (case-sensitive).
 * 2. If no hit, scan for the first `entry.default === true` entry.
 * 3. If still nothing, return `Either.left({ _tag: "QaMiss", question })`.
 *
 * Note: substring match is case-sensitive per CONTEXT.md "Q→A Entry".
 */
export function lookupQaAnswer(table: QaEntry[], userText: string): QaResult {
  // Phase 1: substring match, first-wins
  for (const entry of table) {
    if (userText.includes(entry.question)) {
      return Either.right(entry.answer);
    }
  }
  // Phase 2: default fallback
  for (const entry of table) {
    if (entry.default === true) {
      return Either.right(entry.answer);
    }
  }
  // Phase 3: miss
  return Either.left({ _tag: "QaMiss", question: userText });
}
