
import { Effect, Exit, Stream } from "effect";
import { match } from "ts-pattern";
import type { Message, ModelMeta } from "@codeman-frontend/shared/lib/types";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";
import { logger } from "@codeman-frontend/shared/lib/logger";
import { anthropicStream } from "./anthropic-stream-fn";
import { createProviderFromConfig, findDefaultModel } from "./pi-provider-adapter";
import type { ThinkingLevel } from "@codeman-frontend/shared/lib/sub-agent-schema";
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createFileTools } from "@codeman-frontend/tools/file-ops";
import { webfetchTool } from "@codeman-frontend/tools/webfetch";
import { runCommandTool } from "@codeman-frontend/tools/run-command";
import { loadSkillTool } from "@codeman-frontend/plugins/skills/lib/skill-meta-tool";
import { mcpAllTools$ } from "@codeman-frontend/plugins/mcp/stores/store";
import type { McpToolEntry } from "@codeman-frontend/shared/lib/types";
import { McpApi, McpApiLive } from "@codeman-frontend/shared/apis";
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
import { subAgentsStore } from "@codeman-frontend/plugins/multi-agents/stores/sub-agents.store";
import { buildDelegateTaskTool } from "@codeman-frontend/plugins/multi-agents/lib/delegate-task-tool";
import { subAgentsStreamStore } from "@codeman-frontend/plugins/multi-agents/stores/sub-agents-stream.store";


function buildMcpTools(entries: readonly McpToolEntry[]): AgentTool<TSchema, unknown>[] {
  return entries.map((entry) => ({
    label: entry.agentName,
    name: entry.agentName,
    description: entry.description,
    parameters: entry.inputSchema as TSchema,
    execute: async (_toolCallId: string, args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> => {
      const callToolEffect = Effect.gen(function* () {
        const svc = yield* McpApi;
        return yield* svc.callTool(entry.serverName, entry.toolName, args as Record<string, unknown>);
      }).pipe(Effect.provide(McpApiLive));

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
      const result = exit.value as { content: Array<{ type: string; text?: string;[k: string]: unknown }> };
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


export type RuntimeEvent =
| { type: "token"; content: string }
| { type: "thinking"; content: string }
| { type: "tool_call"; toolCall: { id: string; name: string; args: Record<string, unknown> } }
| { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
| { type: "done"; message: Message }
| { type: "message_stop" }
| { type: "error"; error: { message: string } };

interface RuntimeEmitter {
  readonly single: (event: RuntimeEvent) => unknown;
  readonly end: () => unknown;
}


export interface ProviderConfig {
  id: string;
  models: ModelMeta[];
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  systemPrompt: string;
  tools: unknown[];
  workspaceId?: string;
  enabledSkills?: readonly SkillManifest[];
}


export interface RunOptions {
  context: Message[];
  provider: ProviderConfig;
  thinkingLevel?: ThinkingLevel;
}

export interface CreateAgentRuntimeOptions {}

export interface AgentRuntime {
  run(opts: RunOptions): Stream.Stream<RuntimeEvent, never, never>;
  cancel(): void;
}


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
      emit.single({ type: "thinking", content: delta });
    })
    .with({ type: "toolcall_end" }, ({ toolCall }) => {
      emit.single({
        type: "tool_call",
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          args: toolCall.arguments,
        },
      });
    })
    .otherwise(() => {
    });
}

function handleMessageUpdate(
  evt: Extract<AgentEvent, { type: "message_update" }>,
  emit: RuntimeEmitter,
): void {
  const { assistantMessageEvent, message } = evt;
  if (assistantMessageEvent) {
    handleAssistantMessageEvent(assistantMessageEvent, emit);
    return;
  }

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

function extractResultContent(content: unknown): unknown {
  if (!Array.isArray(content)) { return content; }
  const textBlocks = content.filter(
    (b): b is { type: "text"; text: string } =>
      !!b && typeof b === "object" && (b as { type?: unknown }).type === "text",
  );
  if (textBlocks.length === content.length) {
    return textBlocks.map((b) => b.text).join("");
  }
  return JSON.stringify(content);
}

function extractResultText(content: unknown): string {
  const extracted = extractResultContent(content);
  return typeof extracted === "string" ? extracted : JSON.stringify(extracted);
}

function handleAgentEnd(
  _evt: Extract<AgentEvent, { type: "agent_end" }>,
  emit: RuntimeEmitter,
  finalize: () => void,
): void {
  logger.info("[runtime/diag] agent_end → message_stop + cleanup");
  emit.single({ type: "message_stop" });
  emit.end();
  finalize();
}


export function createAgentRuntime(_options: CreateAgentRuntimeOptions = {}): AgentRuntime {
  let currentAgent: Agent | null = null;

  return {
    run({ context, provider, thinkingLevel }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
      return Stream.async<RuntimeEvent, never>((emit) => {
        const validation = validateProvider(provider);
        if (!validation.ok) {
          emit.single({ type: "error", error: { message: validation.reason } });
          emit.end();
          return;
        }

        const piProvider = createProviderFromConfig({
          id: provider.id,
          name: provider.id,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey ?? "",
          models: provider.models,
        });
        const model = findDefaultModel(piProvider, provider.defaultModel);

        const fileTools = createFileTools(provider.workspaceId);
        const mcpTools = buildMcpTools(mcpAllTools$());
        const baseTools = [...fileTools, webfetchTool, runCommandTool, ...mcpTools, loadSkillTool];

        // Build tool registry Map for delegate_task tool (sub-agents can use run_command per)
        const toolRegistry = new Map<string, AgentTool>(
          baseTools.map((t) => [t.name, t]),
        );

        // Conditionally add delegate_task tool if there are enabled sub-agents
        const enabledSubAgents = Object.values(subAgentsStore.state.byId).filter((s) => s.enabled);
        const onStreamEvent = (event: AgentEvent, toolCallId: string, subAgentId: string): void => {
          if (event.type === "agent_start") {
            const config = enabledSubAgents.find((c) => c.id === subAgentId);
            subAgentsStreamStore.actions.recordStart(toolCallId, subAgentId, config?.name ?? "Unknown");
          } else if (event.type === "message_update") {
            subAgentsStreamStore.actions.appendEvent(toolCallId, event);
          } else if (event.type === "agent_end") {
            const endEvent = event as { type: "agent_end"; finalText?: string; usage?: { inputTokens: number; outputTokens: number }; isError?: boolean; error?: string };
            if (endEvent.isError || endEvent.error) {
              subAgentsStreamStore.actions.recordError(toolCallId, endEvent.error ?? "sub-agent error");
            } else {
              const finalText = endEvent.finalText ?? "";
              subAgentsStreamStore.actions.recordComplete(toolCallId, finalText, endEvent.usage);
            }
          }
        };
        const delegateTaskTool = enabledSubAgents.length > 0
          ? buildDelegateTaskTool(enabledSubAgents, provider, toolRegistry, onStreamEvent)
          : null;
        const tools = delegateTaskTool ? [...baseTools, delegateTaskTool] : baseTools;

        const agent = new Agent({
          initialState: {
            systemPrompt: provider.systemPrompt,
            model,
            thinkingLevel: thinkingLevel ?? "medium",
            tools,
            messages: toPiMessages(context, model),
          },
          streamFn: anthropicStream,
          getApiKey: async () => provider.apiKey ?? undefined,
        });
        currentAgent = agent;

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
                handleTurnEnd(e, emit, provider.defaultModel))
              .with({ type: "agent_end" }, (e) =>
                handleAgentEnd(e, emit, unsubscribeAndClear))
              .otherwise(() => {
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