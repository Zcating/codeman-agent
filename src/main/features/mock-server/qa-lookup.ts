import type { QaEntry } from "./qa-loader";

export interface QaMiss { readonly _tag: "QaMiss"; readonly question: string }
export type QaResult = { readonly _tag: "Right"; readonly right: QaEntry } | { readonly _tag: "Left"; readonly left: QaMiss };

export function lookupQaAnswer(table: QaEntry[], userText: string): QaResult {
  for (const entry of table) {
    if (userText.includes(entry.question)) {
      return { _tag: "Right", right: entry };
    }
  }
  for (const entry of table) {
    if (entry.default === true) {
      return { _tag: "Right", right: entry };
    }
  }
  return { _tag: "Left", left: { _tag: "QaMiss", question: userText } };
}
