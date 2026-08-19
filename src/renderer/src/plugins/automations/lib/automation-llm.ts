// Pure LLM execution logic for the automations pipeline. Replaces the
// structurally-broken `main-listener.ts` which imported `electron` directly
// from the renderer (browser context has no `ipcRenderer`).
//
// IPC subscription is owned by `src/preload/index.ts` and exposed via
// `window.codeman.automationsExecuteLlm(handler)` — see ADR-0060.

import { createSubAgent, type ToolRegistry } from "@codeman-frontend/features/multi-agents/lib/sub-agent-factory";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";
import type {
  LlmActionPayload,
  LlmExecuteRequest,
  LlmResultPayload,
} from "@codeman-frontend/shared/apis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// LlmActionPayload (defined in @shared/lib/automation-types) is the wire
// shape for "the llm variant of an AutomationAction". Use it directly instead
// of defining a second Extract<...> alias here.

interface LlmExecuteResult {
  readonly status: "success" | "error";
  readonly finalText?: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers — no IPC, no module-level state
// ---------------------------------------------------------------------------

/**
 * Run an LLM action inside the renderer using the user's configured provider.
 * Pure: depends only on `createSubAgent` (mocked in tests) and
 * `getProviderConfig()` (reads `window.__appStore`).
 */
export async function executeLlmInRenderer(action: LlmActionPayload): Promise<LlmExecuteResult> {
  const providerConfig = getProviderConfig(action.providerId);
  if (!providerConfig) {
    return { status: "error", error: `Provider ${action.providerId} not found` };
  }

  // Build synthetic SubAgentConfig for automation LLM execution (per)
  // Automation LLM actions are self-contained with no tools (allowedTools: [])
  const subAgentConfig: SubAgentConfig = {
    id: "automation-llm",
    name: "automation-llm",
    description: "LLM execution for automation",
    systemPrompt: action.systemPrompt,
    modelId: action.modelId,
    thinkingLevel: "off",
    allowedTools: [],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const toolRegistry: ToolRegistry = new Map();

  try {
    const subAgent = createSubAgent(subAgentConfig, providerConfig, toolRegistry);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (subAgent.prompt(action.userPrompt) as any);

    if (result.stopReason === "error") {
      return { status: "error", error: result.errorMessage ?? "sub-agent error" };
    }

    const finalText = result.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return { status: "success", finalText };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { status: "error", error: errorMessage };
  }
}

/**
 * Resolve provider config from the renderer's appStore global. The global is
 * set up by preload; in tests it is installed via `Object.defineProperty(window, ...)`.
 */
export function getProviderConfig(providerId: string): ProviderConfig | null {
  // Access appStore via window global (set up by preload)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appStore = (window as any).__appStore;
  if (!appStore) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = appStore.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = settings.providers?.find((p: any) => p.id === providerId);
  if (!provider) {
    return null;
  }

  return {
    id: provider.id,
    models: (provider.llm?.models ?? []) as ModelMeta[],
    apiKey: provider.apiKey ?? "",
    baseUrl: provider.llm?.baseUrl ?? "",
    defaultModel: provider.llm?.defaultModel ?? "",
    systemPrompt: "",
    tools: [],
  };
}

// ---------------------------------------------------------------------------
// Bridge handler — invoked by `window.codeman.automationsExecuteLlm`
// ---------------------------------------------------------------------------

/**
 * Handle a single LLM execution request from the main process. Runs the
 * provider call locally, then posts the result back via the bridge.
 * Errors are caught and reported as `status: "error"` so the main side's
 * pending map always receives a terminal payload.
 */
export async function handleAutomationLlm(request: LlmExecuteRequest): Promise<void> {
  const { executionId, action } = request;

  let payload: LlmResultPayload;
  try {
    const result = await executeLlmInRenderer(action);
    payload = {
      executionId,
      status: result.status,
      finalText: result.finalText,
      error: result.error,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    payload = { executionId, status: "error", error: errorMessage };
  }

  window.codeman.automationsSendLlmResult(payload);
}

// ---------------------------------------------------------------------------
// Idempotent subscription — exposed as `setup/cleanupAutomationMainListener`
// for parity with the original module API (kept for plugin init + tests).
// ---------------------------------------------------------------------------

let subscription: (() => void) | null = null;

export function setupAutomationMainListener(): void {
  if (subscription) {
    return;
  }
  subscription = window.codeman.automationsExecuteLlm(handleAutomationLlm);
}

export function cleanupAutomationMainListener(): void {
  if (subscription) {
    subscription();
    subscription = null;
  }
}