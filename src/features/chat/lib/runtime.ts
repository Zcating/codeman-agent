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
//!
//! V1.9+ Queue-based runtime architecture (ADR-0017):
//! - 替换原 `Stream.unwrap + Effect.gen + Stream.async` 三层 pattern 为
//!   `Stream.unwrap + Effect.gen + Queue + Effect.fork + Stream.fromQueue`。
//! - Queue.unbounded 作为 event bus,agent.subscribe 在 forked fiber 里跑,
//!   事件通过 Queue.unsafeOffer 推入。
//! - Stream.fromQueue(queue) 是 leaf operator,R = never,结构上不可能触发
//!   "Service not found: SettingsService"(原 type-lie 在 ADR-0014 runtime
//!   pattern 里残留,被 1fc33e7 fix 部分缓解但未完全消除)。
//! - Fork 的 scope 自管 cleanup:addFinalizer 注册 queue.shutdown + sub release,
//!   fiber 退出时(agent.prompt 完成 / reject / abort)自动跑。
//! - Consumer cancel 走 chatAgentStore.cancel → runtime.cancel → agent.abort()
//!   → AnthropicTransport signal.aborted 命中 → fetch abort → prompt reject
//!   → fork 退出 → finalizers 跑 → queue.shutdown → stream 自动 end。

import { Effect, Stream, Layer, Context, Ref, Queue } from "effect";
import type { Model } from "@mariozechner/pi-ai";
import { Agent, type AgentTransport } from "@mariozechner/pi-agent";
import type { AgentEvent } from "@mariozechner/pi-agent";
import {
  SettingsService,
  SettingsServiceLive,
  BillingServiceLive,
  MessageService,
  MessageServiceLive,
  FileServiceLive,
  WorkspaceServiceLive,
} from "../../../shared/lib/tauri";
import { AnthropicTransport } from "./anthropic-transport";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import { getBalanceTool, getPlanQuotaTool } from "../../billing/lib/billing";
import { fileTools } from "../../file-tools/lib/file-tools";

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
    ) => Stream.Stream<RuntimeEvent, AppError | RuntimeError, never>;
    readonly cancel: (conversationId: string) => Effect.Effect<void, never, never>;
    readonly destroy: (conversationId: string) => Effect.Effect<void, never, never>;
  }
>() {}

// ─── 工具注册（AgentTool[] — pi-agent 自动调度） ─────────────────

// V2: 5 file tools alongside 2 billing tools (ADR-0013)
const tools: any[] = [getBalanceTool, getPlanQuotaTool, ...fileTools];

// ─── Live Layer ─────────────────────────────────────────────────────

export const AgentRuntimeLive = Layer.effect(
  AgentRuntime,
  Effect.gen(function* () {
    // V1.6+ per-conversation Agent (ADR-0014 D1): Ref<Agent | null> → Ref<Map<ConvId, Agent>>。
    // 每个 conversation 一个 pi-mono Agent 实例,生命周期跟随 conversation;
    // 仅 delete/archive 时通过 `destroy(convId)` 移除 (D2 + D7)。
    const agentRef = yield* Ref.make<Map<ConversationId, Agent>>(new Map());
    // 在 layer 内部 yield SettingsService + MessageService — 它们的 context 来自
    // layer 的 R,call site 提供这些 services 后 layer 才会成功 build。得到的
    // services 通过闭包传给 run(),inner Stream effect 不需要 yield* 任何 service
    // — 这避免了 "Service not found" 的 issue (旧版本 yield* SettingsService 在
    // inner Stream effect 里找不到)。
    const settingsSvc = yield* SettingsService;
    const messageSvc = yield* MessageService;

    const run = (
      conversation: Conversation,
      userMessage: Message,
    ): Stream.Stream<RuntimeEvent, AppError | RuntimeError, never> => {
      return Stream.unwrapScoped(
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<RuntimeEvent>();

          // ─── Provider / model / agent setup ───

          // 加载设置和活跃 provider。
          // E2E fix: 兼容 V1 (SettingsService.getActiveLlmProvider 返回 LLMProvider)
          //          跟 V1.5 (settings.providers[] 是 source of truth)。
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
                api_key: found.api_key,
              } as any;
            }
          }
          if (!activeProvider) {
            // Stream.fail 的默认 A=never,跟下面 Stream.fromQueue(queue) 的
            // A=RuntimeEvent 不能 unify。显式 cast 让 TypeScript 把两者都
            // 看成 Stream<RuntimeEvent, RuntimeError, never>。
            return Stream.fail(new RuntimeError("no active LLM provider")) as Stream.Stream<
              RuntimeEvent,
              RuntimeError,
              never
            >;
          }

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
            // ADR-0015: API key 从 v15Provider.api_key 直接读取。
            const apiKey = v15Provider?.api_key ?? null;
            const transport: AgentTransport = new AnthropicTransport({
              getApiKey: async () => apiKey ?? undefined,
            }) as unknown as AgentTransport;

            agent = new Agent({
              transport,
              initialState: {
                // 用 `||` 不是 `??`:V1.5 后端 `Default for SystemPromptSettings` 是
                // 空串,只有 `Default for Settings` 才填长 prompt。如果 DB 存的
                // settings.system_prompt.default 是空串(fallback 或用户清空),
                // `??` 不触发,LLM 收到 0 字符 system field,无法遵循工具使用指引。
                // `||` 触发空串 fallback,确保 LLM 总有非空系统提示。
                systemPrompt: conversation.system_prompt || settings.system_prompt.default,
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

          // ─── Fork agent execution ───
          // Fork scope 自管 cleanup:queue.shutdown + sub release 在 fiber 退出时
          // 自动跑(normal / abort / interrupt 任何路径)。
          // Consumer cancel 走 chatAgentStore.cancel → runtime.cancel →
          // agent.abort() → fetch abort → prompt reject → fork 退出 →
          // finalizers 跑 → queue.shutdown → Stream.fromQueue 自动 end。
          yield* Effect.fork(
            Effect.scoped(
              Effect.gen(function* () {
                // Finalizer 1:fiber 退出时关闭 queue → Stream.fromQueue 自动 end。
                yield* Effect.addFinalizer(() => Effect.sync(() => Queue.shutdown(queue)));

                const handleAgentEvent = (evt: AgentEvent): void => {
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
                              Queue.unsafeOffer(queue, { type: "token", content: b.text });
                            } else if (b.type === "toolCall" && b.id !== undefined) {
                              Queue.unsafeOffer(queue, {
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
                        Queue.unsafeOffer(queue, {
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
                          Queue.unsafeOffer(queue, { type: "done", message: doneMessage });
                        }
                        break;
                      }
                    }
                  } catch (e) {
                    Queue.unsafeOffer(queue, {
                      type: "error",
                      error: { message: String(e) },
                    });
                  }
                };

                const sub = agent!.subscribe(handleAgentEvent);

                // Finalizer 2:fiber 退出时释放 subscription(prompt reject 或
                // consumer cancel 都会触发,保证不泄漏)。
                yield* Effect.addFinalizer(() => Effect.sync(() => sub()));

                yield* Effect.tryPromise({
                  try: () => agent!.prompt(userMessage.content),
                  catch: (e) => {
                    Queue.unsafeOffer(queue, {
                      type: "error",
                      error: { message: String(e) },
                    });
                  },
                }).pipe(Effect.ignore);
              }),
            ),
          );

          return Stream.fromQueue(queue);
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
          if (!m.has(conversationId)) {
            return m;
          }
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
  MessageServiceLive,
  FileServiceLive,
  WorkspaceServiceLive,
);

// AgentRuntimeLive 在 yield* Ref.make 时无外部 requirements,SettingsService 等
// 是 AgentRuntime.run() 内部需要的 — 所以先用 Layer.provide 把 RuntimeDeps
// 喂给 AgentRuntimeLive,然后 Layer.merge 把 deps 也对外暴露,这样
// call site `Effect.provide(RuntimeLayer)` 才能满足 chat-view 内部
// Effect 对 SettingsService 等的 requirement。
// ADR-0018: use Layer.provideMerge to preserve RuntimeDeps in the output type.
// RuntimeDeps includes SettingsServiceLive, BillingServiceLive, MessageServiceLive, etc.
// Layer.merge would lose the deps in the output type (TypeScript inference limitation);
// provideMerge correctly preserves them.
export const RuntimeLayer = Layer.provideMerge(
  Layer.provide(AgentRuntimeLive, RuntimeDeps),
  RuntimeDeps,
);
