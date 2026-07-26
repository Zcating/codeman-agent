//! parseModelsApiResponse — pure parser for `GET <modelsEndpoint>` responses.
//!
//! Multiple LLM providers expose an OpenAI-style `GET /v1/models` endpoint, but
//! the per-item shape varies:
//!
//! - **OpenAI**: `{ id, object, created, owned_by, name? }`  (label: `name` or `id`)
//! - **MiniMax / Anthropic-style**: `{ id, object, created, owned_by }` (NO `name`)
//! - **DeepSeek**: `{ id, object, created, owned_by }` (NO `name`, NO `context_window`)
//!
//! The legacy parser assumed `name` and `context_window` were always present;
//! MiniMax's real API returns neither, so `label` was silently `undefined` and
//! the UI rendered empty `<Select.ItemText>` spans.
//!
//! This helper normalizes all known shapes into `ModelMeta[]` with a guaranteed
//! non-empty `label` (falls back to `id` when `name` is missing/empty/whitespace).
//!
//! Defensive: returns `[]` for any non-object / non-array / item-missing-id.

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
    // label: prefer `name` (OpenAI / Anthropic-some-providers) when non-empty
    // after trim; otherwise fall back to `id` so the UI always has something
    // to display. Whitespace-only names are treated as missing.
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