//! buildEnabledProviders — pure filter helper for ProviderSelect.

export interface EnabledProvider {
  id: string;
  label: string;
  models: { id: string; label: string }[];
}

/**
 * Filters providers to those where `enabled === true` AND `llm` is defined.
 * Maps to a flat `{ id, label, models }` shape for the UI layer.
 */
export function buildEnabledProviders(
  providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    llm?: { models: Array<{ id: string; label: string }> };
  }>
): EnabledProvider[] {
  return providers
    .filter((p) => p.enabled && p.llm != null)
    .map((p) => ({
      id: p.id,
      label: p.label,
      models: p.llm!.models.map((m) => ({
        id: m.id,
        // Fallback to id when label is missing / empty / whitespace-only.
        // Otherwise <Select.ItemText> renders an empty span in the dropdown.
        label: m.label?.trim() || m.id,
      })),
    }));
}
