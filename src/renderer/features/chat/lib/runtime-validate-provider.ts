import type { ProviderConfig } from "./runtime";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates ProviderConfig.defaultModel — non-empty after trim.
 *
 * Out of scope (this wave): apiKey, baseUrl, systemPrompt validation.
 */
export function validateProvider(cfg: ProviderConfig): ValidationResult {
    if (!cfg.defaultModel || cfg.defaultModel.trim().length === 0) {
        return {
            ok: false,
            reason: "defaultModel is required (got empty or whitespace-only string)",
        };
    }
    return { ok: true };
}
