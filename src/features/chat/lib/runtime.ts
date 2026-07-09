//! AgentRuntime — pi-agent-core 0.80.3 的 Effect Stream 包装 (V2 ADR-0019 重构)。
//!
//! 工厂模式,无 Context.Tag / 无 Layer DI / 无 Ref<Map<ConvId, Agent>>:
//! - `createAgentRuntime()` 返回 `AgentRuntime` 接口,closure 持有 per-run 状态
//! - `run({ context, provider })`: context 是 store messages 浅拷贝(含最新 user msg)
//! - 每次 run 新建 pi-agent-core Agent + Stream.async fiber
//! - `cancel()`: 调 closure 内 `currentAgent.abort()` 触发 Agent 内部 signal
//!
//! 详细架构见 ADR-0019。
//!
//! 0.80.3 迁移要点 (vs 0.9.0):
//!   - `transport: AgentTransport` (旧,自己跑 agent loop) → `streamFn: anthropicStream`
//!   - `initialState.thinkingLevel` 必填,固定为 "off"
//!   - `subscribe((evt) => ...)` → `subscribe((evt, signal) => ...)`
//!   - 旧 anthropic-transport.ts 的 agent loop 全部删除(由 Agent 内部处理)

import { Effect, Stream } from "effect";
import type { Message } from "../../../shared/lib/types";
import { logger } from "../../../shared/lib/logger";
import { anthropicStream } from "./anthropic-transport";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Model, Message as PiMessage } from "@earendil-works/pi-ai";
import { createFileTools } from "../../file-tools/lib/file-tools";

// ─── Tool error extraction (T27 fix for [object Object] display) ────────────

interface AgentToolResultShape {
    content?: Array<{ type?: string; text?: unknown }>;
    details?: unknown;
}

/** Extract human-readable error text from a tool result.
 *
 *  When pi-agent-core fails a tool call (validation, sandbox, runtime error) it
 *  wraps the failure in `AgentToolResult<{content:[{type:"text", text:"..."}], details:{}}>`
 *  with `isError: true`. Calling `String(result)` on that shape yields the
 *  unhelpful `"[object Object]"` which then leaks into the UI error banner.
 *
 *  This helper pulls the actual text out of `content[0].text`, falling back to
 *  `String(result)` for unexpected shapes.
 */
export function extractToolErrorText(result: unknown): string {
    if (result && typeof result === "object" && "content" in result) {
        const r = result as AgentToolResultShape;
        const first = Array.isArray(r.content) ? r.content[0] : undefined;
        const text = first?.text;
        if (typeof text === "string" && text.length > 0) {
            return text;
        }
    }
    if (result instanceof Error) {
        return result.message;
    }
    return String(result);
}

// ─── Runtime event types (6 variants,ADR-0017 + thinking) ──────────────────

export type RuntimeEvent =
    | { type: "token"; content: string }
    | { type: "thinking"; content: string }
    | { type: "tool_call"; toolCall: { id: string; name: string; args: Record<string, unknown> } }
    | { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
    | { type: "done"; message: Message }
    | { type: "error"; error: { message: string } };

// ─── Provider config (per-run, not closure) ─────────────────────

export interface ProviderConfig {
    apiKey: string | null;
    baseUrl: string;
    defaultModel: string;
    systemPrompt: string;
    tools: unknown[];
    /**
     * ADR-0013 / T27: per-run workspace context — 当工具 schema 接受 `workspace_id`
     * 但 LLM 没传时,`createFileTools()` 自动注入。空 = 不注入(保留 LLM 传的或让工具报错)。
     */
    workspaceId?: string;
}

// ─── Run options ────────────────────────────────────────────────

export interface RunOptions {
    /** 浅拷贝,含最新用户输入 */
    context: Message[];
    provider: ProviderConfig;
}

// ─── AgentRuntime interface ─────────────────────────────────────

export interface AgentRuntime {
    run(opts: RunOptions): Stream.Stream<RuntimeEvent, never, never>;
    cancel(): void;
}

// ─── Factory (closure-based, no class, no Context.Tag) ──────────

export function createAgentRuntime(): AgentRuntime {
    // closure-shared,供 cancel() 触达 in-flight agent
    let currentAgent: Agent | null = null;

    return {
        run({ context, provider }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
            return Stream.async<RuntimeEvent, never>((emit) => {
                const model: Model<"anthropic-messages"> = {
                    id: provider.defaultModel || "auto",
                    name: provider.systemPrompt.slice(0, 20) || "agent",
                    api: "anthropic-messages",
                    provider: "anthropic",
                    baseUrl: provider.baseUrl,
                    reasoning: false,
                    input: ["text"],
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 128000,
                    maxTokens: 8192,
                };

                const tools = createFileTools(provider.workspaceId);

                const agent = new Agent({
                    initialState: {
                        systemPrompt: provider.systemPrompt,
                        model,
                        thinkingLevel: "off",
                        tools,
                        // ADR-0019 D2 + pi-ai version drift (per chat/AGENTS.md): our DB Message
                        // shape (snake_case) differs from pi-ai's Message shape (camelCase + Content).
                        // Bridge via 2-hop cast; proper mapper is a follow-up.
                        messages: context as unknown as PiMessage[],
                    },
                    streamFn: anthropicStream,
                    getApiKey: async () => provider.apiKey ?? undefined,
                });
                currentAgent = agent;

                const sub = agent.subscribe((evt, _signal) => {
                    try {
                        const e = evt as {
                            type: string;
                            message?: { content?: unknown[] };
                            toolCallId?: string;
                            result?: unknown;
                            isError?: boolean;
                            messages?: Array<{
                                content?: Array<{
                                    type: string;
                                    text?: string;
                                    id?: string;
                                    name?: string;
                                    arguments?: Record<string, unknown>;
                                }>;
                            }>;
                        };
                        switch (e.type) {
                            case "message_update": {
                                const msg = e.message;
                                if (!msg?.content || !Array.isArray(msg.content)) {
                                    return;
                                }
                                for (const block of msg.content) {
                                    const b = block as {
                                        type: string;
                                        text?: string;
                                        thinking?: string;
                                        id?: string;
                                        name?: string;
                                        arguments?: Record<string, unknown>;
                                    };
                                    if (b.type === "text" && b.text !== undefined) {
                                        emit.single({ type: "token", content: b.text });
                                    } else if (b.type === "thinking" && b.thinking !== undefined) {
                                        // pi-agent-core 的 message_update 携带的是累积内容(同 text branch),
                                        // 非 delta。store 直接覆写 thinking 字段即可。
                                        emit.single({ type: "thinking", content: b.thinking });
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
                                break;
                            }
                            case "tool_execution_end": {
                                emit.single({
                                    type: "tool_result",
                                    toolCallId: e.toolCallId ?? "unknown",
                                    result: e.result,
                                    error: e.isError ? extractToolErrorText(e.result) : undefined,
                                });
                                break;
                            }
                            case "agent_end": {
                                // V2 ADR-0019: 必须无条件 emit done — 即使 msgs 为空 (例如 abort 在
                                // 第一个 token 到达前触发)。否则 conversations.store 的 streamingMessageId
                                // 卡在 set 状态,UI "Cancel" 按钮不消失,"Send" 按钮不恢复。
                                //   - msgs.length > 0: emit done with partial assistant text
                                //   - msgs.length === 0: emit done with empty text (UI 把 stub finalize 为空 assistant)
                                //
                                // V3.1 multi-turn 修正: agent loop 跑 N 轮 (tool use + follow-up),
                                // agent_end 的 msgs 数组 [user, asst#1 (thinking+text+toolCall),
                                // tool_result, asst#2 (text only)] — **最后的 asst#2 是 turn 2
                                // 的 final answer,只有 text,没有 thinking/toolCall**。如果只
                                // 抓 lastMsg,done.message.thinking + done.message.tool_calls
                                // 会变成 null,UI 看不到 thinking section 或 inline ToolCallCard。
                                //
                                // 修正策略:
                                //   - **content** 用最后一条 assistant message 的 text (final answer)
                                //   - **thinking** 用 **跨所有 assistant messages** 累加 (通常 in turn #1)
                                //   - **tool_calls** 用 **跨所有 assistant messages** 累加 (turn #1 的 tool_call)
                                //   - **tool_results** 用 **跨所有 assistant messages** 累加 (turn N 的 tool_result blocks 也是 agent message)
                                //
                                // 跨 message 累加是必要的,因为 agent 多轮时 lastMsg 不一定包含 thinking/toolCall。
                                const msgs = e.messages ?? [];
                                const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

                                // 判断是否 assistant-style message:
                                //   - role === "assistant" 显式
                                //   - role 缺失(测试 fixture 用裸对象) 但内容含 thinking/text/toolCall
                                //     blocks — 这种默认当 assistant 处理。
                                //   - role === "user" / "toolResult" 严格排除。
                                // 这样多轮场景也能聚合跨 message 的 thinking + toolCalls。
                                type AnyMsg = { role?: string; content?: unknown };
                                function isAssistantLike(m: AnyMsg | null | undefined): boolean {
                                    if (!m) return false;
                                    if (m.role === "assistant") return true;
                                    if (m.role === "user" || m.role === "toolResult") return false;
                                    // No role → look at content blocks
                                    if (!Array.isArray(m.content)) return false;
                                    return m.content.some((b: unknown) => {
                                        const block = b as { type?: string };
                                        return (
                                            block?.type === "thinking" ||
                                            block?.type === "toolCall" ||
                                            block?.type === "text"
                                        );
                                    });
                                }

                                // 取最后一条 assistant message 的 text — final answer
                                const finalAssistantMsg = [...msgs]
                                    .reverse()
                                    .find((m: AnyMsg) => isAssistantLike(m)) ?? null;
                                const text = finalAssistantMsg
                                    ? ((finalAssistantMsg.content as unknown[]) ?? [])
                                          .filter(
                                              (b: unknown) =>
                                                  (b as { type?: string })?.type === "text",
                                          )
                                          .map((b: unknown) =>
                                              (b as { text?: string })?.text ?? "",
                                          )
                                          .join("")
                                    : lastMsg
                                      ? ((lastMsg.content as unknown[]) ?? [])
                                            .filter(
                                                (b: unknown) =>
                                                    (b as { type?: string })?.type === "text",
                                            )
                                            .map((b: unknown) =>
                                                (b as { text?: string })?.text ?? "",
                                            )
                                            .join("")
                                      : "";

                                // 跨所有 assistant-like messages 累加 thinking + tool_calls
                                const allThinking = msgs
                                    .filter((m: AnyMsg) => isAssistantLike(m))
                                    .flatMap((m: AnyMsg) =>
                                        ((m.content as unknown[]) ?? []).filter(
                                            (b: unknown) =>
                                                (b as { type?: string })?.type === "thinking",
                                        ),
                                    ) as Array<{ type: string; thinking?: string }>;
                                const thinkingText = allThinking
                                    .map((b) => b.thinking ?? "")
                                    .join("");
                                const allToolCallBlocks = msgs
                                    .filter((m: AnyMsg) => isAssistantLike(m))
                                    .flatMap((m: AnyMsg) =>
                                        ((m.content as unknown[]) ?? []).filter(
                                            (b: unknown) =>
                                                (b as { type?: string; id?: string })?.type ===
                                                    "toolCall" &&
                                                (b as { id?: string })?.id !== undefined,
                                        ),
                                    ) as Array<{
                                        id?: string;
                                        name?: string;
                                        arguments?: Record<string, unknown>;
                                    }>;
                                const doneContent = text;
                                const doneThinking = thinkingText || null;
                                const doneToolCalls =
                                    allToolCallBlocks.length > 0
                                        ? allToolCallBlocks.map((b) => ({
                                              id: b.id!,
                                              name: b.name ?? "",
                                              args: b.arguments ?? {},
                                          }))
                                        : null;
                                logger.debug(
                                    "[runtime/diag] agent_end: msgs.length=" +
                                        msgs.length +
                                        " text.length=" +
                                        doneContent.length +
                                        " text_preview=" +
                                        doneContent.slice(0, 100) +
                                        " thinking.length=" +
                                        thinkingText.length +
                                        " toolBlocks=" +
                                        allToolCallBlocks.length +
                                        " lastMsg.role=" +
                                        (lastMsg as { role?: string } | null)?.role +
                                        " lastMsg.content=" +
                                        JSON.stringify(lastMsg?.content),
                                );
                                emit.single({
                                    type: "done",
                                    message: {
                                        id: crypto.randomUUID(),
                                        conversation_id: "",
                                        role: "assistant",
                                        content: doneContent,
                                        thinking: doneThinking,
                                        tool_calls: doneToolCalls,
                                        tool_results: null,
                                        model: provider.defaultModel || null,
                                        input_tokens: null,
                                        output_tokens: null,
                                        created_at: Date.now(),
                                    },
                                });
                                emit.end();
                                sub();
                                if (currentAgent === agent) {
                                    currentAgent = null;
                                }
                                break;
                            }
                        }
                    } catch (err) {
                        emit.single({ type: "error", error: { message: String(err) } });
                    }
                });

                const lastUser = [...context].reverse().find((m) => m.role === "user");
                const userContent = lastUser?.content ?? "";

                agent.prompt(userContent).catch((err: unknown) => {
                    emit.single({ type: "error", error: { message: String(err) } });
                    emit.end();
                    sub();
                    if (currentAgent === agent) {
                        currentAgent = null;
                    }
                });

                return Effect.sync(() => {
                    agent.abort();
                    sub();
                    if (currentAgent === agent) {
                        currentAgent = null;
                    }
                });
            });
        },

        cancel(): void {
            currentAgent?.abort();
            currentAgent = null;
        },
    };
}
