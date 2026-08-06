// ADR-0053 TC — main-listener.ts (Renderer 端)
// Listens for automation execution requests from main process
// and sends back results after LLM execution

import { ipcRenderer } from "electron";
import { createSubAgent, type ToolRegistry } from "@codeman-frontend/plugins/multi-agents/lib/sub-agent-factory";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// LlmAction matches AutomationAction with kind === "llm" from automation-types.ts
interface LlmAction {
  readonly kind: "llm";
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly timeoutMs: number;
}

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
// Uses createSubAgent per ADR-0049 D4 pattern (ADR-0053 SP2 fix)
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

  // Build synthetic SubAgentConfig for automation LLM execution (per ADR-0049 D4)
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

// ---------------------------------------------------------------------------
// Provider config access (reads from appStore state)
// ---------------------------------------------------------------------------

// We need to get the provider config synchronously from the renderer state
// This reads from the window global set up by preload
function getProviderConfig(providerId: string): ProviderConfig | null {
  // Access appStore via window global (set up by preload)
  const appStore = (window as any).__appStore;
  if (!appStore) return null;

  const settings = appStore.value;
  const provider = settings.providers?.find((p: any) => p.id === providerId);
  if (!provider) return null;

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
// Cleanup (for testing)
// ---------------------------------------------------------------------------

export function cleanupAutomationMainListener(): void {
  listenerSetup = false;
  ipcRenderer.removeAllListeners("automations:execute-llm");
}
