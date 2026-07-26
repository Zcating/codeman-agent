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
//!   - `initialState.thinkingLevel` 必填,默认 "medium"(开 thinking,显示思考过程)
//!   - `model.reasoning: true` (跟 thinkingLevel 联动,Claude 等推理模型才能产出 thinking blocks)
//!   - `subscribe((evt) => ...)` → `subscribe((evt, signal) => ...)`
//!   - 旧 anthropic-transport.ts 的 agent loop 全部删除(由 Agent 内部处理)
//!
//! V3.1 Skills integration (ADR-0031):
//!   - ProviderConfig.enabledSkills: SkillManifest[] — caller (chat.store) 提供
//!   - systemPrompt 自动追加 `<available_skills>...</available_skills>` 段
//!   - tools[] 数组添加 `_load_skill` meta-tool (LLM 主动调用拉全文)

import { Effect, Exit, Stream } from "effect";
import { match } from "ts-pattern";
import type { Message } from "@codeman-frontend/shared/lib/types";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";
import { logger } from "@codeman-frontend/shared/lib/logger";
import { anthropicStream } from "@codeman-frontend/features/chat/lib/anthropic-transport";
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { createFileTools } from "@codeman-frontend/features/file-tools/lib/file-tools";
import { formatSkillsManifestSection } from "@codeman-frontend/plugins/skills/lib/skill-injector";
import { loadSkillTool } from "@codeman-frontend/plugins/skills/lib/skill-meta-tool";
import { mcpAllTools$ } from "@codeman-frontend/plugins/mcp/stores/store";
import type { McpToolEntry } from "@codeman-frontend/shared/lib/types";
import { McpService, McpServiceLive } from "@codeman-frontend/shared/lib/ipc";
import {
  isTextBlock,
  isThinkingBlock,
  isToolCallBlock,
  contentOf,
} from "@codeman-frontend/features/chat/lib/runtime-type-guards";
import { validateProvider } from "@codeman-frontend/features/chat/lib/runtime-validate-provider";
import { extractToolErrorText } from "@codeman-frontend/features/chat/lib/runtime-tool-error";
import { toPiMessages } from "@codeman-frontend/features/chat/lib/runtime-to-pi-messages";
import { AppError } from "@codeman-frontend/shared/lib/errors";
import type { TSchema } from "@sinclair/typebox";

// ─── MCP tools builder (ADR-0032 D4) ────────────────────────────────────────

/** Convert MCP tool entries to pi-agent AgentTool definitions. */
function buildMcpTools(entries: readonly McpToolEntry[]): AgentTool<TSchema, unknown>[] {
  return entries.map((entry) => ({
    label: entry.agentName,
    name: entry.agentName,
    description: entry.description,
    parameters: entry.inputSchema as TSchema,
    execute: async (_toolCallId: string, args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> => {
      const callToolEffect = Effect.gen(function* () {
        const svc = yield* McpService;
        return yield* svc.callTool(entry.serverName, entry.toolName, args as Record<string, unknown>);
      }).pipe(Effect.provide(McpServiceLive));

      const exit = await Effect.runPromiseExit(callToolEffect);
      if (Exit.isFailure(exit)) {
        const cause = exit.cause;
        const err: AppError =
          cause._tag === "Fail"
            ? (cause.error as AppError)
            : ({ _tag: "Unknown", message: String(cause) } as AppError);
        return {
          content: [
            {
              type: "text" as const,
              text: `MCP tool error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}`,
            },
          ],
          details: err,
        };
      }
      const result = exit.value as { content: Array<{ type: string; text?: string; [k: string]: unknown }> };
      return {
        content: result.content.map((block) => {
          if (block.type === "text" && block.text !== undefined) {
            return { type: "text" as const, text: block.text };
          }
          return { type: "text" as const, text: JSON.stringify(block) };
        }),
        details: result,
      };
    },
  }));
}

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
  /**
   * Per-run API key for the LLM provider. Optional — omit when the caller
   * hasn't configured auth yet; `Agent.getApiKey` falls through to `undefined`
   * and the Anthropic SDK then resolves via env / no-auth path.
   */
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  systemPrompt: string;
  tools: unknown[];
  /**
   * ADR-0013 / T27: per-run workspace context — 当工具 schema 接受 `workspace_id`
   * 但 LLM 没传时,`createFileTools()` 自动注入。空 = 不注入(保留 LLM 传的或让工具报错)。
   */
  workspaceId?: string;
  /**
   * V3.1 ADR-0031: 已启用的 skill manifest 列表。Runtime 在每次 run() 入口自动
   * 拼成 `<available_skills>...</available_skills>` 段追加到 system prompt。
   * 空 / undefined = 不注入该段。
   */
  enabledSkills?: readonly SkillManifest[];
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

// ─── Bubble Boundary helpers (ADR-0028) ───────────────────────────────────────
//
// V3.1 cross-turn aggregation REMOVED. Runtime now emits one `done` event per
// turn (at `turn_end`), not one aggregated `done` at `agent_end`. Each turn's
// done.message owns ONLY that turn's thinking / tool_calls / tool_results —
// no cross-turn move of any content type.
//
// Old contract (V3.1, removed): agent_end.messages[] aggregated across all
// turns → 1 final done with cross-turn thinking + tool_calls.
// New contract (ADR-0028): turn_end.message (per turn) → 1 done per turn.
// agent_end is now cleanup-only (emit.end() + unsubscribe).

/** contentOf moved to runtime-type-guards.ts (typed signature, runtime-safe). */

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
      // pi-agent-core 0.80.3 message_update.text_delta.delta 是单 chunk（新片段）,
      // 不是累积全文。anthropic-transport.ts line 491 emit 时也只 emit
      // delta.text (新片段),snapshot.partial 才是累积态但这里没用。
      // chat.store.ts token handler 用 `(m.content ?? "") + evt.content` APPEND
      // 来累积 (G31 fix),所以这里不需要替消费方做"预累积"。
      emit.single({ type: "token", content: delta });
    })
    .with({ type: "thinking_delta" }, ({ delta }) => {
      // 同 text_delta:delta 是单 chunk,chat.store thinking handler APPEND 累积。
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

  // OLD FORMAT fallback (backward compat): infer from message.content blocks.
  // contentOf returns [] for missing/non-array content — no cast needed.
  const msgContent = contentOf(message);
  if (msgContent.length > 0) {
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

/**
 * turn_end handler (ADR-0028 Bubble Boundary): emits ONE `done` event for the
 * turn that just ended. The done.message owns ONLY this turn's content blocks:
 * text / thinking / toolCalls extracted from `evt.message`; toolResults from
 * `evt.toolResults` (NOT cross-turn aggregated).
 *
 * Replaces V3.1's handleAgentEnd which aggregated across all turns at agent_end.
 */
function handleTurnEnd(
  evt: Extract<AgentEvent, { type: "turn_end" }>,
  emit: RuntimeEmitter,
  defaultModel: string,
): void {
  const { message: turnMessage, toolResults: turnToolResults } = evt;
  const blocks = contentOf(turnMessage);

  const text = blocks
    .filter(isTextBlock)
    .map((b) => b.text)
    .join("");
  const thinkingJoined = blocks
    .filter(isThinkingBlock)
    .map((b) => b.thinking)
    .join("");
  const thinking = thinkingJoined.length > 0 ? thinkingJoined : null;
  const toolCallBlocks = blocks.filter(isToolCallBlock);
  const toolCalls =
    toolCallBlocks.length > 0
      ? toolCallBlocks.map((b) => ({
        id: b.id,
        name: b.name ?? "",
        args: b.arguments as Record<string, unknown>,
      }))
      : null;

  // turn_end.toolResults is pi-ai's ToolResultMessage[]; we project to chat.store's
  // ToolResult[] (toolCallId + result + error|null). content[] flattened for the
  // single-text-result case (typical for file tools).
  const toolResults =
    turnToolResults && turnToolResults.length > 0
      ? turnToolResults.map((tr) => ({
        toolCallId: tr.toolCallId,
        result: extractResultContent(tr.content),
        error: tr.isError ? extractResultText(tr.content) : null,
      }))
      : null;

  logger.debug("[runtime/diag] turn_end → done", {
    textLen: text.length,
    thinkingLen: thinking?.length ?? 0,
    toolBlocks: toolCalls?.length ?? 0,
    toolResultsCount: toolResults?.length ?? 0,
  });

  emit.single({
    type: "done",
    message: {
      id: crypto.randomUUID(),
      conversationId: "",
      role: "assistant",
      content: text,
      thinking,
      toolCalls,
      toolResults,
      model: defaultModel || null,
      inputTokens: null,
      outputTokens: null,
      createdAt: Date.now(),
    },
  });
}

/** Flatten pi-ai ToolResultMessage.content (Content[]) to chat.store ToolResult.result.
 *  Text-only results stay as string; mixed results JSON-stringify. */
function extractResultContent(content: unknown): unknown {
  if (!Array.isArray(content)) {return content;}
  const textBlocks = content.filter(
    (b): b is { type: "text"; text: string } =>
      !!b && typeof b === "object" && (b as { type?: unknown }).type === "text",
  );
  if (textBlocks.length === content.length) {
    return textBlocks.map((b) => b.text).join("");
  }
  return JSON.stringify(content);
}

/** Extract plain text from pi-ai Content[] for error message. */
function extractResultText(content: unknown): string {
  const extracted = extractResultContent(content);
  return typeof extracted === "string" ? extracted : JSON.stringify(extracted);
}

/**
 * agent_end handler (ADR-0028): CLEANUP-ONLY. Per-turn `done` events already
 * fired via handleTurnEnd. agent_end only:
 *   1. emit.end() the runtime EventStream
 *   2. call finalize() (unsubscribe + clear currentAgent)
 *
 * Does NOT emit `done` (per ADR-0028: bubble boundary is per turn).
 */
function handleAgentEnd(
  _evt: Extract<AgentEvent, { type: "agent_end" }>,
  emit: RuntimeEmitter,
  finalize: () => void,
): void {
  logger.info("[runtime/diag] agent_end cleanup (per-turn done events already emitted)");
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
          // 配合 initialState.thinkingLevel="medium",让 Claude 等推理模型产出 thinking blocks。
          // 非推理模型 silently 忽略(per pi-ai 文档),所以默认全开对所有 provider 安全。
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
        };

        const fileTools = createFileTools(provider.workspaceId);
        const mcpTools = buildMcpTools(mcpAllTools$());
        // 顺序: file tools 先, MCP tools 中, skills meta-tool 末 (便于 LLM 先看到主要工具)
        const tools = [...fileTools, ...mcpTools, loadSkillTool];

        // V3.1 ADR-0031 D3: 拼接 enabled skills manifest 到 system prompt。
        // 空数组 → formatSkillsManifestSection 返回 "" → 原 systemPrompt 不变。
        const skillsSection = formatSkillsManifestSection(provider.enabledSkills ?? []);
        const finalSystemPrompt = skillsSection
          ? `${provider.systemPrompt}\n\n${skillsSection}`
          : provider.systemPrompt;

        const agent = new Agent({
          initialState: {
            systemPrompt: finalSystemPrompt,
            model,
            // 默认 medium:显示完整思考过程。reasoning:true 的模型产出 thinking_delta
            // → chat.store 累积到 stub.thinking → done 时合并到 final message.thinking
            // → MessageBubble ThinkingPanel 在 bubble 顶部渲染(streaming 时 open)。
            // 用户后续可在 settings 里加 provider-level thinkingLevel 配置来覆盖默认值。
            thinkingLevel: "medium",
            tools,
            // ADR-0019 D2 + bridge: our DB Message (snake_case, flat) → pi-ai Message
            // (camelCase, content[] blocks). See runtime-to-pi-messages.ts for the
            // mapping rules + edge cases (Usage synthesis, toolName lookup, etc.).
            messages: toPiMessages(context, model),
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
              .with({ type: "turn_end" }, (e) =>
                // ADR-0028 Bubble Boundary: per-turn done (1 turn = 1 bubble)
                handleTurnEnd(e, emit, provider.defaultModel))
              .with({ type: "agent_end" }, (e) =>
                // ADR-0028: cleanup-only (per-turn done already fired via turn_end)
                handleAgentEnd(e, emit, unsubscribeAndClear))
              .otherwise(() => {
                // agent_start / turn_start / message_start / message_end /
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