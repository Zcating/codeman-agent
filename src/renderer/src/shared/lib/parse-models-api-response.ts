
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

interface RawModelItem {
  id?: unknown;
  name?: unknown;
  context_window?: unknown;
  created?: unknown;
  object?: unknown;
  owned_by?: unknown;
}

interface RawModelsResponse {
  data?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function parseModelsApiResponse(response: unknown): ModelMeta[] {
  if (typeof response !== "object" || response === null) {
    return [];
  }
  const { data } = response as RawModelsResponse;
  if (!Array.isArray(data)) {
    return [];
  }

  const models: ModelMeta[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const item = raw as RawModelItem;
    const id = asString(item.id);
    if (id === undefined || id.length === 0) {
      continue;
    }
    const trimmedName = asString(item.name)?.trim();
    const label =
      trimmedName !== undefined && trimmedName.length > 0 ? trimmedName : id;
    const contextWindow = asNumber(item.context_window);
    models.push({
      id,
      label,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
      deprecated: false,
      thinking: false,
    });
  }
  return models;
}