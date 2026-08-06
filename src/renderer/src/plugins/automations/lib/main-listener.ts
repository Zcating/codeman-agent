// ADR-0053 TC — main-listener.ts (Renderer 端)
// Listens for automation execution requests from main process
// and sends back results after LLM execution

import { ipcRenderer } from "electron";

// Local type alias since LlmAction is defined inline in automation-types.ts
interface LlmAction {
  readonly kind: "llm";
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LlmResultPayload {
  executionId: string;
  status: "success" | "failure" | "timeout" | "error";
  finalText?: string;
  error?: string;
}

interface ExecuteLlmPayload {
  executionId: string;
  action: LlmAction;
}

// ---------------------------------------------------------------------------
// Main listener setup
// ---------------------------------------------------------------------------

let listenerSetup = false;

export function setupAutomationMainListener(): void {
  if (listenerSetup) return;
  listenerSetup = true;

  // Listen for LLM execution requests from main process
  ipcRenderer.on(
    "automations:execute-llm",
    async (_event, payload: ExecuteLlmPayload) => {
      const { executionId, action } = payload;

      try {
        const result = await executeLlmInRenderer(action);
        const responsePayload: LlmResultPayload = {
          executionId,
          status: result.status,
          finalText: result.finalText,
          error: result.error,
        };
        ipcRenderer.send("automations:execute-llm-result", responsePayload);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        const responsePayload: LlmResultPayload = {
          executionId,
          status: "error",
          error: errorMessage,
        };
        ipcRenderer.send("automations:execute-llm-result", responsePayload);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// LLM execution in renderer
// Uses direct fetch to call LLM API (simplified V1 per ADR-0053)
// ---------------------------------------------------------------------------

interface LlmExecuteResult {
  status: "success" | "failure" | "error";
  finalText?: string;
  error?: string;
}

async function executeLlmInRenderer(action: LlmAction): Promise<LlmExecuteResult> {
  // Get provider config from appStore
  const providerConfig = getProviderConfig(action.providerId);
  if (!providerConfig) {
    return { status: "error", error: `Provider ${action.providerId} not found` };
  }

  // Build the messages
  const messages = [
    { role: "system" as const, content: action.systemPrompt },
    { role: "user" as const, content: action.userPrompt },
  ];

  try {
    const response = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": providerConfig.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: action.modelId,
        max_tokens: 4096,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { status: "error", error: `API error ${response.status}: ${errorText}` };
    }

    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.[0]?.text ?? "";

    return { status: "success", finalText: text };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { status: "error", error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Provider config access (simplified - reads from appStore state)
// ---------------------------------------------------------------------------

interface ProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
}

// We need to get the provider config synchronously from the renderer state
// This is a simplified approach - in V1 we read from the window global
function getProviderConfig(providerId: string): ProviderConfig | null {
  // Access appStore via window global (set up by preload)
  const appStore = (window as any).__appStore;
  if (!appStore) return null;

  const settings = appStore.value;
  const provider = settings.providers?.find((p: any) => p.id === providerId);
  if (!provider) return null;

  return {
    id: provider.id,
    baseUrl: provider.llm?.baseUrl ?? "",
    apiKey: provider.apiKey ?? "",
  };
}

// ---------------------------------------------------------------------------
// Cleanup (for testing)
// ---------------------------------------------------------------------------

export function cleanupAutomationMainListener(): void {
  listenerSetup = false;
  ipcRenderer.removeAllListeners("automations:execute-llm");
}
