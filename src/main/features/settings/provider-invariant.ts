import type { ProviderLlm } from "./schemas.js";

// 与 src/renderer/src/shared/lib/provider-invariant.ts 的 enforceDefaultModelInvariant 是同步副本。
// 修改任一处必须同步另一处(per2: main 端避免跨层 import,故复制而非共享)。

export function enforceDefaultModelInvariant(llm: ProviderLlm): ProviderLlm {
  if (llm.models.length === 0) {
    return { ...llm, defaultModel: "" };
  }
  if (llm.defaultModel === "" || llm.models.some((m) => m.id === llm.defaultModel)) {
    return llm;
  }
  return { ...llm, defaultModel: llm.models[0].id };
}
