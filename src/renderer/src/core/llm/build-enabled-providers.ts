export interface EnabledProvider {
  id: string;
  label: string;
  models: { id: string; label: string }[];
}

export function buildEnabledProviders(
  providers: Array<{
    id: string;
    label: string;
    llm?: { models: Array<{ id: string; label: string }> };
  }>
): EnabledProvider[] {
  return providers
    .filter((p) => p.llm != null)
    .map((p) => ({
      id: p.id,
      label: p.label,
      models: p.llm!.models.map((m) => ({
        id: m.id,
        label: m.label?.trim() || m.id,
      })),
    }));
}
