//! AgentRuntime — pi-agent 0.9.0 的 Effect Stream 包装。
//!
//! T13: 使用 pi-ai 0.9.4 的 AgentTool 声明式调度模式。
//! - 工具通过 AgentTool[] 传入 agent 构造函数（pi-agent 自动调度 tool.execute）
//! - 仅订阅高级事件：token（来自 message_update）、done（来自 agent_end）、error
//! - 使用 ProviderService 读取提供商配置（不再用 V1 LLMProviderService）
//!
//! E2E fix: 我们用 **AnthropicTransport (fetch + Authorization: Bearer)**
//! 替代 pi-agent 自带的 ProviderTransport (Anthropic SDK + x-api-key)。
//! 原因：api.minimaxi.com 的 CORS preflight whitelist 没有 x-api-key /
//! anthropic-version 头,只有 Authorization;ProviderTransport 在 webview
//! fetch 必 throw "Failed to fetch"。AnthropicTransport 在
//! src/features/chat/lib/anthropic-transport.ts,纯 fetch + 流式 SSE 解析。
//! pi-ai 版本漂移:transport 类型来自 pi-ai@0.9.4,本地 import 是 pi-ai@0.73.1,
//! 两版本 AssistantMessage 字段不一致,运行时用 cast `as unknown as AgentTransport` 桥接,
//! event handler 只读 evt.message.content (与版本无关) 所以行为正确。

import { Effect, Stream, Layer, Context, Ref } from "effect";
import type { Message as PiMessage, Model } from "@mariozechner/pi-ai";
import { Agent, type AgentTransport } from "@mariozechner/pi-agent";
import type { AgentEvent } from "@mariozechner/pi-agent";
import {
  SettingsService,
  SettingsServiceLive,
  BillingServiceLive,
} from "../../../shared/lib/tauri";
import { LLMProviderService, LLMProviderServiceLive } from "../../settings/lib/llm-providers";
import { AnthropicTransport } from "./anthropic-transport";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import { getBalanceTool, getPlanQuotaTool } from "../../billing/lib/billing";

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
    ) => Stream.Stream<RuntimeEvent, AppError | RuntimeError, SettingsService | LLMProviderService>;
    readonly cancel: () => Effect.Effect<void, never, never>;
  }
>() {}

// ─── 工具注册（AgentTool[] — pi-agent 自动调度） ─────────────────

const tools: any[] = [getBalanceTool, getPlanQuotaTool];

// ─── Live Layer ─────────────────────────────────────────────────────

export const AgentRuntimeLive = Layer.effect(
  AgentRuntime,
  Effect.gen(function* () {
    const agentRef = yield* Ref.make<Agent | null>(null);
    // 在 layer 内部 yield SettingsService + LLMProviderService — 它们的 context
    // 来自 layer 的 R (SettingsService | LLMProviderService),call site 提供这些
    // services 后 layer 才会成功 build。得到的 settingsSvc / llmSvc 通过闭包
    // 传给 run(),inner Stream effect 不需要 yield* 任何 service — 这避免了
    // "Service not found" 的 issue(之前 yield* SettingsService 在 inner Stream
    // effect 里找不到,因为 Stream.create 的 context 不从 outer Effect 继承)。
    const settingsSvc = yield* SettingsService;
    const llmSvc = yield* LLMProviderService;

    const run = (
      conversation: Conversation,
      userMessage: Message,
    ): Stream.Stream<RuntimeEvent, AppError | RuntimeError, never> => {
      // 通过 flatMap 构建 Stream，使 context 保持在内部 Effect 的局部作用域。
      // RuntimeDeps layer 通过 RuntimeLayer 在调用处提供。
      // 内层 Effect 真实需求 SettingsService + LLMProviderService,调用方
      // chat-view.tsx 通过 Effect.provide(RuntimeLayer) 提供这俩 —
      // 因此这里保留 inferred 的 Stream 类型(让 call site 知道有 requirements)
      // 而不是 cast 成 `never`。原 cast 隐藏了 requirement,导致运行时
      // "Service not found: SettingsService" 错误,chat runtime 死锁,
      // running signal 卡在 true,后续 submit 全早 return。
      return Stream.flatMap(
        Stream.fromEffect(
          Effect.gen(function* () {
            // settingsSvc + llmSvc 通过闭包从外层 layer scope 进来 — 不需要 yield。
            // 加载设置和活跃 provider。
            // E2E fix: 兼容 V1 (SettingsService.getActiveLlmProvider 返回 LLMProvider)
            //          跟 V1.5 (settings.providers[] 是 source of truth)。
            //          V1 的 llm_providers 经常是空数组,所以 fallback 到 V1.5 providers[]。
            const settings = yield* settingsSvc.getSettings();
            let activeProvider = yield* settingsSvc.getActiveLlmProvider();
            if (!activeProvider && settings.providers && settings.providers.length > 0) {
              // V1.5 fallback: 从 default_llm_provider_id 找 active provider,缺则用第一个 enabled
              const defaultId = settings.default_llm_provider_id;
              const found =
                settings.providers.find((p) => p.id === defaultId && p.enabled && p.llm) ??
                settings.providers.find((p) => p.enabled && p.llm);
              if (found && found.llm) {
                activeProvider = {
                  id: found.id,
                  label: found.label,
                  enabled: found.enabled,
                  default_model: found.llm.default_model,
                  base_url: found.llm.base_url,
                  api_type: found.llm.api_type,
                  api_key_ref: found.llm.llm_api_key_ref,
                } as any;
              }
            }
            if (!activeProvider) {
              return Stream.fail(new RuntimeError("no active LLM provider"));
            }

            // 构造 Model 对象 — inline 替代 buildModel helper (V1.5 buildModel 签名需
            // Provider + modelId,我们从 LLMProvider + settings.providers 拼数据)。
            // ADR-0011: api_type 固定为 "anthropic-messages"。
            const v15Provider = settings.providers?.find((p) => p.id === activeProvider.id);
            const modelId = activeProvider.default_model ?? "auto";
            const model: Model<any> = {
              id: modelId,
              name: v15Provider?.label ?? activeProvider.label,
              api: "anthropic-messages",
              provider: activeProvider.id,
              baseUrl: activeProvider.base_url ?? "",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128000,
              maxTokens: 8192,
            };

            // 构建 transport — 通过 LLMProviderService.getApiKey 获取密钥
            // 注意：我们用 AnthropicTransport (fetch + Authorization: Bearer)
            // 替代 ProviderTransport (Anthropic SDK + x-api-key)。
            // 原因：api.minimaxi.com 的 CORS preflight whitelist 没有 x-api-key,
            // 只有 Authorization,所以 ProviderTransport 在 webview 里 fetch 必失败。
            const apiKey = yield* llmSvc.getApiKey(activeProvider.id);
            const transport: AgentTransport = new AnthropicTransport({
              getApiKey: async () => apiKey ?? undefined,
            }) as unknown as AgentTransport;

            const agent = new Agent({
              transport,
              initialState: {
                systemPrompt: conversation.system_prompt ?? settings.system_prompt.default,
                model,
                tools,
                messages: [],
              },
            });

            // 存储 agent ref 以便 cancel() 可以中止此次运行
            yield* Ref.set(agentRef, agent);

            // 订阅 pi-agent 事件并映射到 RuntimeEvent
            const eventQueue: RuntimeEvent[] = [];
            let finishResolve: (msgs: PiMessage[]) => void;
            const finishPromise = new Promise<PiMessage[]>((resolve) => {
              finishResolve = resolve;
            });

            const unsub = agent.subscribe((evt: AgentEvent) => {
              switch (evt.type) {
                case "message_update": {
                  // 防御性 check:自定义 transport 的 message_update event 必须有
                  // message 字段 + message.content 数组。如果 undefined 直接跳过,
                  // 避免 [ChatView] 运行错误: Cannot read properties of undefined
                  // (reading 'content')。
                  const assistantMsg = (evt as { message?: { content?: unknown[] } }).message;
                  if (!assistantMsg || !Array.isArray(assistantMsg.content)) {
                    return;
                  }
                  for (const block of assistantMsg.content) {
                    if (typeof block === "object" && block !== null && "type" in block) {
                      const b = block as {
                        type: string;
                        text?: string;
                        id?: string;
                        name?: string;
                        arguments?: Record<string, unknown>;
                      };
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
                  // 防御性 check:agent_end.events 必须有 messages 数组。
                  const msgs = (evt as { messages?: unknown[] }).messages;
                  finishResolve!((msgs ?? []) as PiMessage[]);
                  break;
                }
              }
            });

            // 向 agent 追加用户消息并运行 prompt。
            // 通过 `any` cast 桥接 pi-ai@0.73.1 与 pi-ai@0.9.4 版本不匹配
            //（AssistantMessage.api 字段类型在不同版本间不同）。
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

            // 等待 agent_end，然后发送 done 事件
            const finalPiMessages = yield* Effect.promise(() => finishPromise);
            unsub();

            if (finalPiMessages.length > 0) {
              const lastPiMsg = finalPiMessages[finalPiMessages.length - 1];
              const textBlocks = (
                lastPiMsg.content as Array<{ type: string; text?: string }>
              ).filter((b) => b.type === "text" && b.text !== undefined);
              const toolBlocks = (
                lastPiMsg.content as Array<{
                  type: string;
                  id?: string;
                  name?: string;
                  arguments?: Record<string, unknown>;
                }>
              ).filter((b) => b.type === "toolCall" && b.id !== undefined);
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
                model: activeProvider.default_model ?? null,
                input_tokens: null,
                output_tokens: null,
                created_at: Date.now(),
              };
              eventQueue.push({ type: "done", message: doneMessage });
            }

            // 清除 agent ref
            yield* Ref.set(agentRef, null);

            return Stream.fromIterable(eventQueue);
          }),
        ),
        (s) => s,
      );
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

// ─── 组合所有 runtime 依赖的 Layer ────────────────────────────────

export const RuntimeDeps = Layer.mergeAll(
  SettingsServiceLive,
  BillingServiceLive,
  LLMProviderServiceLive,
);

// AgentRuntimeLive 在 yield* Ref.make 时无外部 requirements,SettingsService 等
// 是 AgentRuntime.run() 内部需要的 — 所以先用 Layer.provide 把 RuntimeDeps
// 喂给 AgentRuntimeLive,然后 Layer.merge 把 deps 也对外暴露,这样
// call site `Effect.provide(RuntimeLayer)` 才能满足 Stream.runForEach 内部
// Effect 的 SettingsService | LLMProviderService requirements。
export const RuntimeLayer = Layer.merge(Layer.provide(AgentRuntimeLive, RuntimeDeps), RuntimeDeps);
