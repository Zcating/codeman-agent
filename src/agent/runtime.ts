// AgentRuntime — wraps pi-mono's agent loop in an Effect Stream.
import { Effect, Stream, Layer, Context, Ref } from "effect";
import { Type } from "@mariozechner/pi-ai";
import type { Tool, Message as PiMessage, Model } from "@mariozechner/pi-ai";
import { Agent, ProviderTransport, type AgentTransport } from "@mariozechner/pi-agent";
import type { AgentEvent } from "@mariozechner/pi-agent";
import {
  SettingsService,
  SettingsServiceLive,
  BillingServiceLive,
} from "../lib/tauri";
import type { Conversation, Message, ToolCall } from "../lib/types";

// ─── Runtime Event & Error types ─────────────────────────────────────────────

export type RuntimeEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
  | { type: "done"; message: Message }
  | { type: "error"; error: { message: string } };

export class RuntimeError extends Error {
  constructor(public readonly message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

// ─── Tool definitions ───────────────────────────────────────────────────────
// Billing tools — registered with the agent at startup.
// The actual handler execution is dispatched via ToolCall events below.

const getBalanceTool: Tool = {
  name: "get_balance",
  description: "Get the current balance for DeepSeek provider",
  parameters: Type.Object({}),
};

const getPlanQuotaTool: Tool = {
  name: "get_plan_quota",
  description: "Get the current token plan quota for MiniMax provider",
  parameters: Type.Object({}),
};

export const billingTools: Tool[] = [getBalanceTool, getPlanQuotaTool];

// ─── Service definition ─────────────────────────────────────────────────────

export class AgentRuntime extends Context.Tag("AgentRuntime")<
  AgentRuntime,
  {
    readonly run: (
      conversation: Conversation,
      userMessage: Message,
    ) => Stream.Stream<RuntimeEvent, never, never>;
    readonly cancel: () => Effect.Effect<void, never, never>;
  }
>() {}

// ─── Live layer ─────────────────────────────────────────────────────────────

export const AgentRuntimeLive = Layer.effect(
  AgentRuntime,
  Effect.gen(function* () {
    // Ref to the current Agent instance so cancel() can abort it.
    // Only one run() is expected active per runtime instance at a time.
    const agentRef = yield* Ref.make<Agent | null>(null);

    const run = (
      conversation: Conversation,
      userMessage: Message,
    ): Stream.Stream<RuntimeEvent, never, never> => {
      // Build the Stream via flatMap so context stays local to the inner Effect.
      // The RuntimeDeps layer is provided via RuntimeLayer at the call site.
      // Cast to the documented return type — services are in scope via RuntimeLayer.
      return (Stream.flatMap(
        Stream.fromEffect(
          Effect.gen(function* () {
            const settingsSvc = yield* SettingsService;

            // Load settings and active provider
            const settings = yield* settingsSvc.getSettings();
            const activeProvider = yield* settingsSvc.getActiveLlmProvider();
            if (!activeProvider) {
              return Stream.fail(new RuntimeError("no active LLM provider"));
            }

            // Resolve model from provider config
            // TODO (T35): wire real Model from pi-ai getModel() once provider key is available
            const model: Model<any> = {
              id: activeProvider.default_model ?? "auto",
              name: activeProvider.label,
              api: "openai-completions",
              provider: activeProvider.id as any,
              baseUrl: activeProvider.base_url ?? "",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128000,
              maxTokens: 8192,
            };

            // Build transport — uses getApiKey to fetch key via SettingsService IPC
            // NOTE: ProviderTransport makes direct HTTP calls; in webview this requires
            // a CORS proxy or the provider must support direct browser calls.
            const transport: AgentTransport = new ProviderTransport({
              getApiKey: async (_provider: string) => {
                // API key lives in Tauri store (not keyring) — retrieved via IPC.
                // TODO: call a dedicated Tauri command to fetch the LLM API key.
                // For now this returns undefined and the transport falls back to env vars.
                return undefined as string | undefined;
              },
            });

            // Create agent with ProviderTransport and billing tools.
            // Cast tools to `any` — pi-agent expects AgentTool (extends Tool with
            // label+execute) but we only have Tool from pi-ai@0.73.1 (no AgentTool in
            // that version; pi-agent@0.9.0 uses pi-ai@0.9.4 where AgentTool exists).
            const agent = new Agent({
              transport,
              initialState: {
                systemPrompt: conversation.system_prompt ?? settings.system_prompt.default,
                model,
                tools: billingTools as any,
                messages: [],
              },
            });

            // Store agent ref so cancel() can abort this run
            yield* Ref.set(agentRef, agent);

            // Subscribe to pi-agent events and map them to RuntimeEvent
            const eventQueue: RuntimeEvent[] = [];
            let finishResolve: (msgs: PiMessage[]) => void;
            const finishPromise = new Promise<PiMessage[]>((resolve) => {
              finishResolve = resolve;
            });

            const unsub = agent.subscribe((evt: AgentEvent) => {
              switch (evt.type) {
                case "message_update": {
                  const assistantMsg = evt.message;
                  for (const block of assistantMsg.content) {
                    if (typeof block === "object" && block !== null && "type" in block) {
                      const b = block as { type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> };
                      if (b.type === "text" && b.text !== undefined) {
                        eventQueue.push({ type: "token", content: b.text });
                      } else if (b.type === "toolCall" && b.id !== undefined) {
                        eventQueue.push({
                          type: "tool_call",
                          toolCall: {
                            id: b.id,
                            name: b.name ?? "",
                            args: b.arguments ?? {},
                          },
                        });
                      }
                    }
                  }
                  break;
                }
                case "tool_execution_start": {
                  break;
                }
                case "tool_execution_end": {
                  eventQueue.push({
                    type: "tool_result",
                    toolCallId: evt.toolCallId,
                    result: evt.result,
                    error: evt.isError ? String(evt.result) : undefined,
                  });
                  break;
                }
                case "agent_end": {
                  finishResolve!(evt.messages as PiMessage[]);
                  break;
                }
              }
            });

            // Append user message to agent and run prompt.
            // Cast through `any` to bridge pi-ai@0.73.1 vs pi-ai@0.9.4 version mismatch
            // (AssistantMessage.api field type differs between versions).
            agent.appendMessage({
              role: "user",
              content: userMessage.content,
              timestamp: userMessage.created_at,
            } as any);

            agent.prompt(userMessage.content).catch((e: unknown) => {
              eventQueue.push({
                type: "error",
                error: { message: String(e) },
              });
              finishResolve!([]);
            });

            // Wait for agent_end, then emit done event
            const finalPiMessages = yield* Effect.promise(() => finishPromise);
            unsub();

            if (finalPiMessages.length > 0) {
              const lastPiMsg = finalPiMessages[finalPiMessages.length - 1];
              const textBlocks = (lastPiMsg.content as Array<{ type: string; text?: string }>)
                .filter((b) => b.type === "text" && b.text !== undefined);
              const toolBlocks = (lastPiMsg.content as Array<{ type: string; id?: string; name?: string; arguments?: Record<string, unknown> }>)
                .filter((b) => b.type === "toolCall" && b.id !== undefined);
              const doneMessage: Message = {
                id: crypto.randomUUID(),
                conversation_id: conversation.id,
                role: "assistant",
                content: textBlocks.map((b) => b.text ?? "").join(""),
                tool_calls: toolBlocks.length > 0
                  ? toolBlocks.map((b) => ({
                      id: b.id!,
                      name: b.name ?? "",
                      args: b.arguments ?? {},
                    }))
                  : null,
                tool_results: null,
                model: activeProvider.default_model ?? null,
                input_tokens: null,
                output_tokens: null,
                created_at: Date.now(),
              };
              eventQueue.push({ type: "done", message: doneMessage });
            }

            // Clear agent ref
            yield* Ref.set(agentRef, null);

            return Stream.fromIterable(eventQueue);
          }),
        ),
        (s) => s,
      )) as Stream.Stream<RuntimeEvent, never, never>;
    };

    const cancel = (): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const agent = yield* Ref.get(agentRef);
        if (agent) {
          agent.abort();
        }
      });

    return AgentRuntime.of({ run, cancel });
  }),
);

// ─── Layer composing all runtime dependencies ────────────────────────────────

export const RuntimeDeps = Layer.mergeAll(
  SettingsServiceLive,
  BillingServiceLive,
);

export const RuntimeLayer = Layer.provide(AgentRuntimeLive, RuntimeDeps);