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
import { match } from "ts-pattern";
import type { Message } from "../../../shared/lib/types";
import { logger } from "../../../shared/lib/logger";
import { anthropicStream } from "./anthropic-transport";
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import type {
  Message as PiMessage,
  Model,
} from "@earendil-works/pi-ai";
import { createFileTools } from "../../file-tools/lib/file-tools";
import {
  isAssistantLikeMessage,
  isTextBlock,
  isThinkingBlock,
  isToolCallBlock,
} from "./runtime-type-guards";
import { validateProvider } from "./runtime-validate-provider";
import { extractToolErrorText } from "./runtime-tool-error";

// ─── Runtime event types (6 variants,ADR-0017 + thinking) ──────────────────

export type RuntimeEvent =
  | { type: "token"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
  | { type: "done"; message: Message }
  | { type: "error"; error: { message: string } };

/** Structural subset of Effect's `Emit` we use (`single` + `end`). */
interface RuntimeEmitter {
  readonly single: (event: RuntimeEvent) => unknown;
  readonly end: () => unknown;
}

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

// ─── agent_end aggregation helper ──────────────────────────────────────────

interface AssistantAggregate {
  /** Text from the last assistant message (final answer) */
  finalText: string;
  /** All thinking blocks across assistant messages */
  allThinking: string[];
  /** All toolCall blocks across assistant messages */
  allToolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

/**
 * Aggregate text/thinking/toolCalls across all assistant messages in an agent_end
 * event. ADR-0019 V3.1 fix: multi-turn agent loop produces multiple assistant
 * messages — last assistant message's text is the final answer, but thinking
 * and toolCall blocks may live in earlier turns (turn #1).
 */
function aggregateAssistantMessages(messages: unknown[]): AssistantAggregate {
  const assistantMsgs = messages.filter(isAssistantLikeMessage);
  const finalAssistant = assistantMsgs[assistantMsgs.length - 1] ?? null;
  const finalText = finalAssistant
    ? contentOf(finalAssistant).filter(isTextBlock).map((b) => b.text).join("")
    : "";
  const allThinking = assistantMsgs
    .flatMap((m) => contentOf(m).filter(isThinkingBlock).map((b) => b.thinking));
  const allToolCalls = assistantMsgs.flatMap((m) =>
    contentOf(m).filter(isToolCallBlock),
  );
  return { finalText, allThinking, allToolCalls };
}

/** Cast AssistantMessage.content to unknown[] for downstream filter chains.
 *  Single source of truth — replaces 3 inline `m.content as unknown[]` casts. */
function contentOf(m: { content?: unknown }): unknown[] {
  return (m.content as unknown[]) ?? [];
}

// ─── Per-event handlers (file-level, closure-free) ──────────────
// Extracted from the inner subscribe callback to reduce nesting (5-6 levels
// in the closure → 1-level dispatch). Each handler takes the dispatch input
// + the emitter, plus any per-run values it needs (defaultModel, finalize).

function handleAssistantMessageEvent(
  evt: NonNullable<
    Extract<AgentEvent, { type: "message_update" }>["assistantMessageEvent"]
  >,
  emit: RuntimeEmitter,
): void {
  match(evt)
    .with({ type: "text_delta" }, ({ delta }) => {
      emit.single({ type: "token", content: delta });
    })
    .with({ type: "thinking_delta" }, ({ delta }) => {
      // pi-agent-core 的 message_update 携带的是累积内容（同 text branch），非 delta。
      emit.single({ type: "thinking", content: delta });
    })
    .with({ type: "toolcall_end" }, ({ toolCall }) => {
      emit.single({
        type: "tool_call",
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          // pi-ai's ToolCall.arguments is Record<string, any>; assignable to
          // Record<string, unknown> without an explicit cast.
          args: toolCall.arguments,
        },
      });
    })
    .otherwise(() => {
      // text_start / thinking_start / toolcall_start / toolcall_delta / start: no-op
    });
}

function handleMessageUpdate(
  evt: Extract<AgentEvent, { type: "message_update" }>,
  emit: RuntimeEmitter,
): void {
  const { assistantMessageEvent, message } = evt;
  if (assistantMessageEvent) {
    // NEW FORMAT (pi-agent-core 0.80.3): dispatch on assistantMessageEvent.type
    handleAssistantMessageEvent(assistantMessageEvent, emit);
    return;
  }

  // OLD FORMAT fallback (backward compat): infer from message.content blocks
  const msgContent = (message as unknown as { content?: unknown[] })?.content;
  if (msgContent && Array.isArray(msgContent)) {
    for (const block of msgContent) {
      if (isTextBlock(block) && block.text !== undefined) {
        emit.single({ type: "token", content: block.text });
      } else if (isThinkingBlock(block) && block.thinking !== undefined) {
        emit.single({ type: "thinking", content: block.thinking });
      } else if (isToolCallBlock(block)) {
        emit.single({
          type: "tool_call",
          toolCall: {
            id: block.id,
            name: block.name ?? "",
            args: block.arguments ?? {},
          },
        });
      }
    }
  }
}

function handleToolExecutionEnd(
  evt: Extract<AgentEvent, { type: "tool_execution_end" }>,
  emit: RuntimeEmitter,
): void {
  emit.single({
    type: "tool_result",
    toolCallId: evt.toolCallId,
    result: evt.result,
    error: evt.isError ? extractToolErrorText(evt.result) : undefined,
  });
}

function handleAgentEnd(
  evt: Extract<AgentEvent, { type: "agent_end" }>,
  emit: RuntimeEmitter,
  defaultModel: string,
  finalize: () => void,
): void {
  const { messages } = evt;
  // V2 ADR-0019 + V3.1 fix: 多轮时跨所有 assistant messages 聚合
  // thinking + tool_calls; 取最后一条 assistant 的 text 作为 final answer
  const { finalText, allThinking, allToolCalls } = aggregateAssistantMessages(messages);
  const doneThinking = allThinking.length > 0 ? allThinking.join("") : null;
  const doneToolCalls =
    allToolCalls.length > 0
      ? allToolCalls.map((b) => ({
        id: b.id,
        name: b.name,
        args: b.arguments as Record<string, unknown>,
      }))
      : null;
  logger.debug("[runtime/diag] agent_end", {
    msgs: messages.length,
    textLen: finalText.length,
    thinkingLen: doneThinking?.length ?? 0,
    toolBlocks: doneToolCalls?.length ?? 0,
    lastMsg: messages[messages.length - 1],
  });
  emit.single({
    type: "done",
    message: {
      id: crypto.randomUUID(),
      conversationId: "",
      role: "assistant",
      content: finalText,
      thinking: doneThinking,
      toolCalls: doneToolCalls,
      toolResults: null,
      model: defaultModel || null,
      inputTokens: null,
      outputTokens: null,
      createdAt: Date.now(),
    },
  });
  emit.end();
  finalize();
}

// ─── Factory (closure-based, no class, no Context.Tag) ──────────

export function createAgentRuntime(): AgentRuntime {
  // closure-shared,供 cancel() 触达 in-flight agent
  let currentAgent: Agent | null = null;

  return {
    run({ context, provider }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
      return Stream.async<RuntimeEvent, never>((emit) => {
        // ── Block A: defaultModel validation (P0-2) ──────────────────
        const validation = validateProvider(provider);
        if (!validation.ok) {
          emit.single({ type: "error", error: { message: validation.reason } });
          emit.end();
          return;
        }

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

        /** Tear down subscription + clear `currentAgent` if still ours.
         *  Shared by agent_end / prompt catch / Stream cleanup (3 sites). */
        const unsubscribeAndClear = (): void => {
          sub();
          if (currentAgent === agent) {
            currentAgent = null;
          }
        };

        const sub = agent.subscribe((evt: AgentEvent, _signal) => {
          try {
            match(evt)
              .with({ type: "message_update" }, (e) => handleMessageUpdate(e, emit))
              .with({ type: "tool_execution_end" }, (e) => handleToolExecutionEnd(e, emit))
              .with({ type: "agent_end" }, (e) =>
                handleAgentEnd(e, emit, provider.defaultModel, unsubscribeAndClear))
              .otherwise(() => {
                // agent_start / turn_start / turn_end / message_start / message_end /
                // tool_execution_start / tool_execution_update: not mapped to RuntimeEvent
              });
          } catch (err) {
            emit.single({
              type: "error",
              error: { message: err instanceof Error ? err.message : String(err) },
            });
          }
        });

        const lastUser = [...context].reverse().find((m) => m.role === "user");
        const userContent = lastUser?.content ?? "";

        agent.prompt(userContent).catch((err: unknown) => {
          emit.single({ type: "error", error: { message: String(err) } });
          emit.end();
          unsubscribeAndClear();
        });

        return Effect.sync(() => {
          agent.abort();
          unsubscribeAndClear();
        });
      });
    },

    cancel(): void {
      currentAgent?.abort();
      currentAgent = null;
    },
  };
}