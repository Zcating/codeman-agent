// AgentRuntime — 将 pi-mono 的 agent loop 包装在 Effect Stream 中。
import { Effect, Stream, Layer, Context, Ref } from "effect";
import type { Message as PiMessage, Model } from "@mariozechner/pi-ai";
import { Agent, ProviderTransport, type AgentTransport } from "@mariozechner/pi-agent";
import type { AgentEvent } from "@mariozechner/pi-agent";
import {
  SettingsService,
  SettingsServiceLive,
  BillingServiceLive,
} from "../../../shared/lib/tauri";
import type { Conversation, Message, ToolCall } from "../../../shared/lib/types";

// ─── Runtime 事件 & 错误类型 ─────────────────────────────────────────────

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

// ─── Billing 工具（从 billing feature 加载） ──────────────────────────────
import { billingTools } from "../../billing/lib/billing";

// ─── 服务定义 ─────────────────────────────────────────────────────

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
    // 持有当前 Agent 实例的引用，以便 cancel() 可以中止它。
    // 预期每个 runtime 实例同时只有一个 run() 处于活跃状态。
    const agentRef = yield* Ref.make<Agent | null>(null);

    const run = (
      conversation: Conversation,
      userMessage: Message,
    ): Stream.Stream<RuntimeEvent, never, never> => {
      // 通过 flatMap 构建 Stream，使 context 保持在内部 Effect 的局部作用域。
      // RuntimeDeps layer 通过 RuntimeLayer 在调用处提供。
      // Cast 为文档中声明的返回类型 — services 通过 RuntimeLayer 保持在作用域内。
      return Stream.flatMap(
        Stream.fromEffect(
          Effect.gen(function* () {
            const settingsSvc = yield* SettingsService;

            // 加载设置和活跃 provider
            const settings = yield* settingsSvc.getSettings();
            const activeProvider = yield* settingsSvc.getActiveLlmProvider();
            if (!activeProvider) {
              return Stream.fail(new RuntimeError("no active LLM provider"));
            }

            // 从 provider 配置解析 model
            // TODO (T35): provider key 可用后，通过 pi-ai getModel() 接入真实 Model
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

            // 构建 transport — 使用 getApiKey 通过 SettingsService IPC 获取密钥
            // 注意：ProviderTransport 发起直接 HTTP 调用；在 webview 中这需要
            // CORS 代理或 provider 必须支持直接浏览器调用。
            const transport: AgentTransport = new ProviderTransport({
              getApiKey: async (_provider: string) => {
                // API 密钥存在 Tauri store 中（非 keyring）— 通过 IPC 检索。
                // TODO: 调用专用 Tauri 命令获取 LLM API 密钥。
                // 目前这返回 undefined，transport 回退到 env 变量。
                return undefined as string | undefined;
              },
            });

            // 使用 ProviderTransport 和 billing 工具创建 agent。
            // 对 tools cast 为 `any` — pi-agent 期望 AgentTool（扩展 Tool 带
            // label+execute），但我们只有 pi-ai@0.73.1 的 Tool（该版本无 AgentTool；
            // pi-agent@0.9.0 使用 pi-ai@0.9.4，其中 AgentTool 存在）。
            const agent = new Agent({
              transport,
              initialState: {
                systemPrompt: conversation.system_prompt ?? settings.system_prompt.default,
                model,
                tools: billingTools as any,
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
                  const assistantMsg = evt.message;
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
                  finishResolve!(evt.messages as PiMessage[]);
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

// ─── 组合所有 runtime 依赖的 Layer ────────────────────────────────

export const RuntimeDeps = Layer.mergeAll(SettingsServiceLive, BillingServiceLive);

export const RuntimeLayer = Layer.provide(AgentRuntimeLive, RuntimeDeps);
