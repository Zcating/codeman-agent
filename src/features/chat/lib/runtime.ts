//! AgentRuntime — pi-agent 0.9.0 的 Effect Stream 包装。
//!
//! T13: 使用 pi-ai 0.9.4 的 AgentTool 声明式调度模式。
//! - 工具通过 AgentTool[] 传入 agent 构造函数（pi-agent 自动调度 tool.execute）
//! - 仅订阅高级事件：token（来自 message_update）、done（来自 agent_end）、error
//! - 使用 ProviderService 读取提供商配置（不再用 V1 LLMProviderService）

import { Effect, Stream, Layer, Context, Ref } from "effect";
import { Agent, ProviderTransport, type AgentTransport } from "@mariozechner/pi-agent";
import type { AgentEvent } from "@mariozechner/pi-agent";
import type { Model } from "@mariozechner/pi-ai";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { ProviderService, ProviderServiceLive } from "../../../shared/lib/tauri";
import { getBalanceTool, getPlanQuotaTool } from "../../billing/lib/billing";
import type { Conversation, Message } from "../../../shared/lib/types";

// ─── Runtime 事件类型 ─────────────────────────────────────────────

export type RuntimeEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
  | { type: "done"; message: Message }
  | { type: "error"; error: { message: string } };

export class RuntimeError extends Error {
  constructor(public readonly message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

// ─── AgentRuntime 服务定义 ────────────────────────────────────────

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

// ─── 工具注册（AgentTool[] — pi-agent 自动调度） ─────────────────

const tools = [getBalanceTool, getPlanQuotaTool];

// ─── Live Layer ─────────────────────────────────────────────────────

export const AgentRuntimeLive = Layer.effect(
  AgentRuntime,
  Effect.gen(function* () {
    const agentRef = yield* Ref.make<Agent | null>(null);

    const run = (
      conversation: Conversation,
      userMessage: Message,
    ): Stream.Stream<RuntimeEvent, never, never> => {
      return Stream.flatMap(
        Stream.fromEffect(
          Effect.gen(function* () {
            // 1. 获取提供商列表
            const providerSvc = yield* ProviderService;
            const providers = yield* providerSvc.list();

            if (providers.length === 0) {
              return Stream.fail(new RuntimeError("No providers configured. Add one in Settings."));
            }

            // 2. 选取默认提供商（或第一个）
            const settings = yield* Effect.tryPromise({
              try: () => tauriInvoke<{ default_llm_provider_id?: string }>("get_settings"),
              catch: (e) => new RuntimeError(`Failed to get settings: ${e}`),
            });

            let provider = providers[0];
            if (settings.default_llm_provider_id) {
              const defaultProvider = providers.find(
                (p) => p.id === settings.default_llm_provider_id,
              );
              if (defaultProvider) provider = defaultProvider;
            }

            // 3. 获取 LLM 配置
            const { base_url, default_model } = provider.llm;

            // 4. 获取 API key（Tauri store）
            const apiKey = yield* Effect.tryPromise({
              try: () =>
                tauriInvoke<string | null>("get_llm_key", {
                  providerId: provider.id,
                }).then((k) => k ?? ""),
              catch: (e) => new RuntimeError(`Failed to get API key: ${e}`),
            });

            // 5. 构建 Model（inline buildModel 逻辑）
            const model: Model<any> = {
              id: default_model,
              name: provider.label,
              api: provider.llm.api_type,
              provider: provider.id,
              baseUrl: base_url ?? "",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128000,
              maxTokens: 8192,
            };

            // 6. 创建 Transport 和 Agent
            const transport: AgentTransport = new ProviderTransport({
              getApiKey: async () => apiKey,
            });

            const agent = new Agent({
              transport,
              initialState: {
                systemPrompt: conversation.system_prompt ?? "You are a helpful assistant.",
                model,
                tools,
                messages: [],
              },
            });

            // 存储 agent ref 以便 cancel() 可以中止
            yield* Ref.set(agentRef, agent);

            // 7. 订阅高级事件并映射到 RuntimeEvent
            const eventQueue: RuntimeEvent[] = [];
            let finishResolve: (messages: unknown[]) => void;
            const finishPromise = new Promise<unknown[]>((resolve) => {
              finishResolve = resolve;
            });

            const unsub = agent.subscribe((evt: AgentEvent) => {
              switch (evt.type) {
                case "message_update": {
                  // 提取文本块作为 token 事件
                  for (const block of evt.message.content) {
                    if (
                      typeof block === "object" &&
                      block !== null &&
                      block.type === "text" &&
                      "text" in block
                    ) {
                      eventQueue.push({ type: "token", content: block.text });
                    }
                  }
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
                  finishResolve!(evt.messages);
                  break;
                }
              }
            });

            // 8. 发送用户消息并触发 agent prompt
            agent.appendMessage({
              role: "user",
              content: userMessage.content,
              timestamp: userMessage.created_at,
            });

            agent.prompt(userMessage.content).catch((e: unknown) => {
              eventQueue.push({
                type: "error",
                error: { message: String(e) },
              });
              finishResolve!([]);
            });

            // 9. 等待 agent_end，构造 done 事件
            const finalMessages = yield* Effect.promise(() => finishPromise);
            unsub();

            if (finalMessages.length > 0) {
              const lastMsg = finalMessages[finalMessages.length - 1] as {
                content: Array<{
                  type: string;
                  text?: string;
                  id?: string;
                  name?: string;
                  arguments?: Record<string, unknown>;
                }>;
                model?: string;
              };

              const textBlocks =
                lastMsg.content?.filter((b) => b.type === "text" && b.text !== undefined) ?? [];
              const toolBlocks =
                lastMsg.content?.filter((b) => b.type === "toolCall" && b.id !== undefined) ?? [];

              const doneMessage: Message = {
                id: crypto.randomUUID(),
                conversation_id: conversation.id,
                role: "assistant",
                content: textBlocks.map((b) => b.text ?? "").join(""),
                tool_calls:
                  toolBlocks.length > 0
                    ? toolBlocks.map((b) => ({
                        id: b.id!,
                        name: b.name ?? "",
                        args: b.arguments ?? {},
                      }))
                    : null,
                tool_results: null,
                model: provider.llm.default_model ?? null,
                input_tokens: null,
                output_tokens: null,
                created_at: Date.now(),
              };

              eventQueue.push({ type: "done", message: doneMessage });
            }

            // 10. 清除 agent ref
            yield* Ref.set(agentRef, null);

            return Stream.fromIterable(eventQueue);
          }),
        ),
        (s) => s,
      ) as Stream.Stream<RuntimeEvent, never, never>;
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

// ─── Layer（依赖 ProviderService） ────────────────────────────────

export const RuntimeLayer = Layer.provide(AgentRuntimeLive, ProviderServiceLive);
