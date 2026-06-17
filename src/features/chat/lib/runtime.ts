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
//!
//! V1.6+ per-conversation Agent (ADR-0014):
//! - `agentRef` 从 `Ref<Agent | null>` 改为 `Ref<Map<ConvId, Agent>>`。
//! - 每个 Conversation 对应一个 pi-mono `Agent` 实例,生命周期跟随 conversation。
//! - 切换 conversation 时 in-flight Agent 不被 cancel(切走 partial 状态保留)。
//! - `cancel(convId)` 按 conversation 路由;`destroy(convId)` 移除。
//! - D4 history feed:首次 run() 创建 Agent 时从 `MessageService.list(convId)` 拉历史
//!   一次性回填,后续 run() 复用 Agent + appendMessage,Messages 累积。

import { Effect, Stream, Layer, Context, Ref } from "effect";
import type { Model } from "@mariozechner/pi-ai";
import { Agent, type AgentTransport } from "@mariozechner/pi-agent";
import type { AgentEvent } from "@mariozechner/pi-agent";
import {
  SettingsService,
  SettingsServiceLive,
  BillingServiceLive,
  MessageService,
  MessageServiceLive,
} from "../../../shared/lib/tauri";
import { LLMProviderService, LLMProviderServiceLive } from "../../settings/lib/llm-providers";
import { AnthropicTransport } from "./anthropic-transport";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import { getBalanceTool, getPlanQuotaTool } from "../../billing/lib/billing";

/** Conversation ID — 字符串,镜像 src-tauri/src/types.rs Conversation.id。 */
type ConversationId = string;

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
    ) => Stream.Stream<
      RuntimeEvent,
      AppError | RuntimeError,
      SettingsService | LLMProviderService | MessageService
    >;
    readonly cancel: (conversationId: string) => Effect.Effect<void, never, never>;
    readonly destroy: (conversationId: string) => Effect.Effect<void, never, never>;
  }
>() {}

// ─── 工具注册（AgentTool[] — pi-agent 自动调度） ─────────────────

const tools: any[] = [getBalanceTool, getPlanQuotaTool];

// ─── Live Layer ─────────────────────────────────────────────────────

export const AgentRuntimeLive = Layer.effect(
  AgentRuntime,
  Effect.gen(function* () {
    // V1.6+ per-conversation Agent (ADR-0014 D1): Ref<Agent | null> → Ref<Map<ConvId, Agent>>。
    // 每个 conversation 一个 pi-mono Agent 实例,生命周期跟随 conversation;
    // 仅 delete/archive 时通过 `destroy(convId)` 移除 (D2 + D7)。
    const agentRef = yield* Ref.make<Map<ConversationId, Agent>>(new Map());
    // 在 layer 内部 yield SettingsService + LLMProviderService + MessageService
    // — 它们的 context 来自 layer 的 R,call site 提供这些 services 后 layer 才会
    // 成功 build。得到的 services 通过闭包传给 run(),inner Stream effect 不需要
    // yield* 任何 service — 这避免了 "Service not found" 的 issue (之前 yield*
    // SettingsService 在 inner Stream effect 里找不到,因为 Stream.create 的 context
    // 不从 outer Effect 继承)。
    const settingsSvc = yield* SettingsService;
    const llmSvc = yield* LLMProviderService;
    const messageSvc = yield* MessageService;

    const run = (
      conversation: Conversation,
      userMessage: Message,
    ): Stream.Stream<RuntimeEvent, AppError | RuntimeError, never> => {
      // Stream.unwrap + Stream.async 实现真正的增量流式输出：
      //   - 旧实现把 events 推到数组里,等 agent.prompt() 完成后
      //     才构造 Stream.fromIterable(eventQueue),stream 创建时所有事件
      //     已攒齐,consumer 同步排空 → UI 看不到增量渲染,只能看到最终文本。
      //   - 新实现用 Stream.async 把 events 通过 emit.single 推到 stream 内部
      //     queue,每个 SSE delta 触发立即 emit,consumer 在事件到达时即拉取。
      //   - chat-view.tsx 在 Stream.runForEach 回调里加 Effect.sleep(Duration.zero)
      //     让 Solid signal 有 microtask 边界 flush DOM,实现真正的打字机效果。
      return Stream.unwrap(
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

          // V1.6+ per-conversation (ADR-0014 D1+D4):仅在 lazy create 新 Agent 时
          // 构建 transport;已存在的 Agent 复用其原 transport,API key 也在
          // Agent 构造时闭包捕获(后续 API key rotation 不影响 in-flight stream)。
          const convId = conversation.id;
          let agent: Agent | undefined = (yield* Ref.get(agentRef)).get(convId);

          if (!agent) {
            // 首次 run() 该 conv:创建 Agent + 从 DB 拉历史消息一次性回填 (D4)。
            // 后续 run() 复用同一个 Agent,Messages 累积。
            const apiKey = yield* llmSvc.getApiKey(activeProvider.id);
            const transport: AgentTransport = new AnthropicTransport({
              getApiKey: async () => apiKey ?? undefined,
            }) as unknown as AgentTransport;

            agent = new Agent({
              transport,
              initialState: {
                systemPrompt: conversation.system_prompt ?? settings.system_prompt.default,
                model,
                tools,
                messages: [],
              },
            });

            // D4: 一次性回填历史消息 — 让多轮对话 LLM 看到跨轮 context。
            // ts-rs / specta codegen 未上线,类型差异在 pi-mono (TS) 与 Message (serde snake_case)
            // 之间用 `as any` 桥接,等升级 pi-ai 后清理。
            const history = yield* messageSvc.list(convId);
            for (const msg of history) {
              agent.appendMessage({
                role: msg.role,
                content: msg.content,
                timestamp: msg.created_at,
              } as any);
            }

            // 存入 Map:D1 — Map<ConvId, Agent>,Agent 生命周期 = conversation 生命周期。
            yield* Ref.update(agentRef, (m) => {
              const next = new Map(m);
              next.set(convId, agent!);
              return next;
            });
          }

          // 向 agent 追加用户消息并触发 prompt — 在 history feed 之后,保证
          // user msg 是 messages 数组最后一条,LLM 看到正确顺序。
          // 通过 `any` cast 桥接 pi-ai@0.73.1 与 pi-ai@0.9.4 版本不匹配
          // （AssistantMessage.api 字段类型在不同版本间不同）。
          agent.appendMessage({
            role: "user",
            content: userMessage.content,
            timestamp: userMessage.created_at,
          } as any);

          // Stream.async(来自 feature/chat-streams):把 agent.subscribe 回调的
          // events 实时推到 stream 内部 queue,每个 SSE delta 触发立即
          // emit.single。consumer (chat-view 的 Stream.runForEach) 拉取时即时
          // 拿到,无需等 agent.prompt() 结束。旧的 Stream.flatMap +
          // Stream.fromIterable(eventQueue) 模式让所有事件先攒到数组,
          // agent.prompt() 完成才构 stream,UI 看不到增量渲染只看到最终文本。
          const stream = Stream.async<RuntimeEvent, RuntimeError>((emit) => {
            // finished 哨兵:防御 agent_end 与 prompt().catch 双触发,
            // 以及 emit.end() 之后的 stray emit 调用。
            let finished = false;

            const finishStream = (finalEvent?: RuntimeEvent): void => {
              if (finished) return;
              finished = true;
              if (finalEvent) {
                emit.single(finalEvent);
              }
              emit.end();
            };

            const unsub = agent!.subscribe((evt: AgentEvent) => {
              if (finished) return;
              try {
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
                          emit.single({ type: "token", content: b.text });
                        } else if (b.type === "toolCall" && b.id !== undefined) {
                          emit.single({
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
                    emit.single({
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
                    const finalPiMsgs = (msgs ?? []) as Array<{
                      content: Array<{
                        type: string;
                        text?: string;
                        id?: string;
                        name?: string;
                        arguments?: Record<string, unknown>;
                      }>;
                    }>;
                    if (finalPiMsgs.length > 0) {
                      const lastPiMsg = finalPiMsgs[finalPiMsgs.length - 1];
                      const textBlocks = lastPiMsg.content.filter(
                        (b) => b.type === "text" && b.text !== undefined,
                      );
                      const toolBlocks = lastPiMsg.content.filter(
                        (b) => b.type === "toolCall" && b.id !== undefined,
                      );
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
                      finishStream({ type: "done", message: doneMessage });
                    } else {
                      finishStream();
                    }
                    break;
                  }
                }
              } catch (e) {
                finishStream({ type: "error", error: { message: String(e) } });
              }
            });

            // 启动 prompt — 若 reject 则 emit error event 后 end stream。
            // 此时 unsub 已绑定,即便 emit 失败也会在 cleanup 阶段释放订阅。
            agent!.prompt(userMessage.content).catch((e: unknown) => {
              finishStream({ type: "error", error: { message: String(e) } });
            });

            // Cleanup:stream 终止时(stream.end() / consumer cancel / error)
            // 释放 pi-agent 订阅。ADR-0014:Map 条目不删,Agent 生命周期跟随
            // conversation;destroy(convId) 才会从 Map 移除(in-flight 时先
            // cancel 后 destroy 保证 SSE 连接显式释放,避免 JS GC 不可预测)。
            return Effect.sync(() => {
              unsub();
            });
          });
          return stream;
        }),
      );
    };

    // V1.6+ per-conversation cancel (ADR-0014 D6):按 convId 路由到对应 Agent。
    // 不存在的 convId 静默 no-op (Map.get → undefined → 跳过 abort)。
    const cancel = (conversationId: string): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const map = yield* Ref.get(agentRef);
        const agent = map.get(conversationId);
        if (agent) {
          agent.abort();
        }
      });

    // V1.6+ per-conversation destroy (ADR-0014 D2+D7):从 Map 移除 Agent 实例。
    // 调用方:archiveConversation / deleteConversation store 入口在 DB 删除之前。
    // 移除前 cancel(convId) 是 caller 责任,本方法只清 Map (不强依赖 cancel)。
    // 不存在的 convId 静默 no-op。
    const destroy = (conversationId: string): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        yield* Ref.update(agentRef, (m) => {
          if (!m.has(conversationId)) return m;
          const next = new Map(m);
          next.delete(conversationId);
          return next;
        });
      });

    return AgentRuntime.of({ run, cancel, destroy });
  }),
);

// ─── 组合所有 runtime 依赖的 Layer ────────────────────────────────

// V1.6+ per-conversation Agent (ADR-0014 D4):首次 run() 从 MessageService.list(convId)
// 拉历史消息一次性回填。MessageServiceLive 加入 RuntimeDeps 让 layer build 满足
// AgentRuntimeLive 内部 yield* MessageService 的 requirement。
export const RuntimeDeps = Layer.mergeAll(
  SettingsServiceLive,
  BillingServiceLive,
  LLMProviderServiceLive,
  MessageServiceLive,
);

// AgentRuntimeLive 在 yield* Ref.make 时无外部 requirements,SettingsService 等
// 是 AgentRuntime.run() 内部需要的 — 所以先用 Layer.provide 把 RuntimeDeps
// 喂给 AgentRuntimeLive,然后 Layer.merge 把 deps 也对外暴露,这样
// call site `Effect.provide(RuntimeLayer)` 才能满足 Stream.runForEach 内部
// Effect 的 SettingsService | LLMProviderService requirements。
export const RuntimeLayer = Layer.merge(Layer.provide(AgentRuntimeLive, RuntimeDeps), RuntimeDeps);
