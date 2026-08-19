import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateProvider(cfg: ProviderConfig): ValidationResult {
    if (!cfg.defaultModel || cfg.defaultModel.trim().length === 0) {
        return {
            ok: false,
            reason: "defaultModel is required (got empty or whitespace-only string)",
        };
    }
    return { ok: true };
}
