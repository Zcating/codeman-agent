//! AgentRuntime — pi-agent 0.9.0 的 Effect Stream 包装 (V2 ADR-0019 重构)。
//!
//! 工厂模式,无 Context.Tag / 无 Layer DI / 无 Ref<Map<ConvId, Agent>>:
//! - `createAgentRuntime()` 返回 `AgentRuntime` 接口,closure 持有 per-run 状态
//! - `run({ context, provider })`: context 是 store messages 浅拷贝(含最新 user msg)
//! - 每次 run 新建 pi-mono Agent + Queue + Fiber
//! - `cancel()`: 调 closure 内 `AbortController.abort()` 触发 fetch abort
//!
//! 详细架构见 ADR-0019。

import { Effect, Stream } from "effect";
import type { Message } from "../../../shared/lib/types";
import { AnthropicTransport } from "./anthropic-transport";
import type { AgentTransport } from "@mariozechner/pi-agent";
import { Agent } from "@mariozechner/pi-agent";
import type { Model, Message as PiMessage } from "@mariozechner/pi-ai";
import { getBalanceTool, getPlanQuotaTool } from "../../billing/lib/billing";
import { fileTools } from "../../file-tools/lib/file-tools";

// ─── Runtime event types (5 variants,ADR-0017) ──────────────────

export type RuntimeEvent =
  | { type: "token"; content: string }
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
  let currentAbortController: AbortController | null = null;

  return {
    run({ context, provider }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
      return Stream.async<RuntimeEvent, never>((emit) => {
        const abortController = new AbortController();
        currentAbortController = abortController;

        const transport = new AnthropicTransport({
          getApiKey: async () => provider.apiKey ?? undefined,
          signal: abortController.signal,
        });

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

        const tools = [getBalanceTool, getPlanQuotaTool, ...fileTools];

        const agent = new Agent({
          transport: transport as unknown as AgentTransport,
          initialState: {
            systemPrompt: provider.systemPrompt,
            model,
            tools,
            // ADR-0019 D2 + pi-ai version drift (per chat/AGENTS.md): our DB Message
            // shape (snake_case) differs from pi-ai's Message shape (camelCase + Content).
            // Bridge via 2-hop cast; proper mapper is a follow-up.
            messages: context as unknown as PiMessage[],
          },
        });

        const sub = agent.subscribe((evt: unknown) => {
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
                if (!msg?.content || !Array.isArray(msg.content)) return;
                for (const block of msg.content) {
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
                      toolCall: { id: b.id, name: b.name ?? "", args: b.arguments ?? {} },
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
                  error: e.isError ? String(e.result) : undefined,
                });
                break;
              }
              case "agent_end": {
                const msgs = e.messages ?? [];
                if (msgs.length > 0) {
                  const lastMsg = msgs[msgs.length - 1];
                  const text = (lastMsg.content ?? [])
                    .filter((b) => b.type === "text")
                    .map((b) => b.text ?? "")
                    .join("");
                  const toolBlocks = (lastMsg.content ?? []).filter(
                    (b) => b.type === "toolCall" && b.id !== undefined,
                  );
                  emit.single({
                    type: "done",
                    message: {
                      id: crypto.randomUUID(),
                      conversation_id: "",
                      role: "assistant",
                      content: text,
                      tool_calls:
                        toolBlocks.length > 0
                          ? toolBlocks.map((b) => ({
                              id: b.id!,
                              name: b.name ?? "",
                              args: b.arguments ?? {},
                            }))
                          : null,
                      tool_results: null,
                      model: provider.defaultModel || null,
                      input_tokens: null,
                      output_tokens: null,
                      created_at: Date.now(),
                    },
                  });
                }
                emit.end();
                sub();
                if (currentAbortController === abortController) {
                  currentAbortController = null;
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
        });

        return Effect.sync(() => {
          abortController.abort();
          sub();
          if (currentAbortController === abortController) {
            currentAbortController = null;
          }
        });
      });
    },

    cancel(): void {
      currentAbortController?.abort();
      currentAbortController = null;
    },
  };
}
