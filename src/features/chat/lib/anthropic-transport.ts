//! AnthropicTransport — 自定义 AgentTransport。
//!
//! 为什么不用 pi-agent 的 ProviderTransport:
//!   ProviderTransport 走 pi-ai 的 anthropic provider → Anthropic SDK → 发 `x-api-key` header。
//!   `x-api-key` 不在 `api.minimaxi.com` 的 CORS preflight whitelist 里,
//!   webview fetch 报 `TypeError: Failed to fetch`,LLM 不可达。
//!   Authorization header 在 whitelist 里,所以我们走这条路径。
//!
//! 这里实现一个最小 Anthropic streaming 客户端:
//!   - fetch + `Authorization: Bearer ${apiKey}` header (CORS OK)
//!   - 读 SSE 流,parse 成 pi-ai 0.9.4 格式的 AgentEvent
//!
//! pi-ai 版本漂移:transport 类型来自 pi-ai@0.9.4,本地 import 是 pi-ai@0.73.1;
//! 两版本的 AssistantMessage / AgentEvent 字段不完全一致,所以用 `any` cast 桥接。

import type { Message } from "@mariozechner/pi-ai";
import type { AgentRunConfig } from "@mariozechner/pi-agent";

// ─── SSE 行解析 ─────────────────────────────────────────────────────

function parseSseLine(line: string): { event?: string; data?: string } {
  const trimmed = line.trim();
  if (trimmed.length === 0) return {};
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx === -1) return {};
  const field = trimmed.slice(0, colonIdx);
  const value = trimmed.slice(colonIdx + 1).replace(/^ /, "");
  if (field === "event") return { event: value };
  if (field === "data") return { data: value };
  return {};
}

// ─── Anthropic request body 构造 ─────────────────────────────────────

interface AnthropicMessageParam {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        | {
            type: "tool_result";
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }
      >;
}

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  stream: true;
  system?: string;
  messages: AnthropicMessageParam[];
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}

function buildRequestBody(
  model: { id: string; maxTokens?: number },
  systemPrompt: string,
  messages: Message[],
  tools: AgentRunConfig["tools"],
): AnthropicRequestBody {
  const anthropicMessages: AnthropicMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      anthropicMessages.push({
        role: "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      });
    } else if (m.role === "assistant") {
      const blocks: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      > = [];
      const assistantMsg = m as unknown as {
        content: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          arguments?: Record<string, unknown>;
        }>;
      };
      for (const block of assistantMsg.content) {
        if (block.type === "text") {
          blocks.push({ type: "text", text: block.text ?? "" });
        } else if (block.type === "toolCall") {
          blocks.push({
            type: "tool_use",
            id: block.id ?? "",
            name: block.name ?? "",
            input: (block.arguments ?? {}) as Record<string, unknown>,
          });
        }
      }
      if (blocks.length > 0) {
        anthropicMessages.push({ role: "assistant", content: blocks });
      }
    } else if (m.role === "toolResult") {
      const trMsg = m as unknown as {
        toolCallId: string;
        isError?: boolean;
        content: Array<{ type: string; text?: string }>;
      };
      const content = trMsg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      anthropicMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: trMsg.toolCallId,
            content,
            is_error: trMsg.isError,
          },
        ],
      });
    }
  }

  const anthropicTools = tools?.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: (t.parameters ?? {}) as Record<string, unknown>,
  }));

  return {
    model: model.id,
    max_tokens: model.maxTokens ?? 8192,
    stream: true,
    system: systemPrompt,
    messages: anthropicMessages,
    ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
  };
}

// // ─── Agent loop hard limit (prevent LLM infinite loop)
const MAX_TURNS = 16;

// ─── Transport 实现 ─────────────────────────────────────────────────

export interface AnthropicTransportOptions {
  getApiKey: () => Promise<string | undefined>;
}

interface AssistantMsgLike {
  content: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
    | {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }
  >;
  stopReason: string | null;
  model: string;
}

/**
 * 适配 anthropic-messages 协议的 AgentTransport。
 * 直接用 fetch + `Authorization: Bearer` 调 LLM,避开 CORS preflight 问题。
 *
 * pi-ai 版本漂移:本类不直接 implements AgentTransport(基类要求 pi-ai@0.9.4 的
 * Message[] 而本地 import 是 pi-ai@0.73.1,版本不兼容)。
 * runtime.ts 把实例 `as unknown as AgentTransport` 后传给 pi-agent.Agent,
 * 行为正确因为 runtime.ts 的 event handler 只读 evt.message.content[] 这种
 * 与版本无关的字段。
 */
export class AnthropicTransport {
  constructor(private readonly options: AnthropicTransportOptions) {}
  private async *streamTurn(
    apiKey: string,
    baseUrl: string,
    model: { id: string; maxTokens?: number },
    systemPrompt: string,
    messages: Message[],
    tools: AgentRunConfig[`tools`],
    signal: AbortSignal | undefined,
  ): AsyncGenerator<unknown, AssistantMsgLike, unknown> {
    const body = buildRequestBody(model, systemPrompt, messages, tools);
    const url = `${baseUrl.replace(/\/$/, "")}/v1/messages`;

    const response = await fetch(url, {
      method: "POST",
      // 不发送 `anthropic-version` header — 不在 api.minimaxi.com 的 CORS
      // preflight whitelist 里,会导致浏览器直接 block 请求。Anthropic SDK
      // 默认带这个 header(2.x 版本要求),但 MiniMax 兼容端点不强校验,
      // 省略反而能 work。`accept` 也不带(streaming SSE 一样能读)。
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "<no body>");
      throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 500)}`);
    }

    const assistantMsg: AssistantMsgLike = {
      content: [],
      stopReason: null,
      model: model.id,
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let sseDataBuf = "";
    let currentBlockType: "text" | "thinking" | "tool_use" | null = null;
    let pendingToolCallJson = "";

    yield { type: "message_start", message: assistantMsg };

    try {
      while (true) {
        // 显式检查 abort signal — pi-agent 0.9.0 的 `agent.abort()` 不能可靠地
        // 终止 SSE 循环(在 AnthropicTransport 的 fetch signal + reader.read()
        // 链路上),这里强制检查让 cancel 路径在 ~1 reader.read() 周期内退出,
        // stream 终止后 chat-view run() 的 finally 块 setRunning(false) 才跑。
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let lineEnd: number;
        while ((lineEnd = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 1);
          if (line.trim() === "") {
            if (!sseDataBuf) continue;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(sseDataBuf) as Record<string, unknown>;
            } catch {
              sseDataBuf = "";
              continue;
            }
            sseDataBuf = "";
            const type = data.type as string;

            if (type === "content_block_start") {
              const idx = data.index as number;
              const block = data.content_block as {
                type: string;
                id?: string;
                name?: string;
              };
              if (block.type === "text") {
                currentBlockType = "text";
                assistantMsg.content[idx] = { type: "text", text: "" };
              } else if (block.type === "thinking") {
                currentBlockType = "thinking";
                assistantMsg.content[idx] = {
                  type: "thinking",
                  thinking: "",
                };
              } else if (block.type === "tool_use") {
                currentBlockType = "tool_use";
                pendingToolCallJson = "";
                assistantMsg.content[idx] = {
                  type: "toolCall",
                  id: block.id ?? "",
                  name: block.name ?? "",
                  arguments: {},
                };
              }
              yield { type: "message_update", message: assistantMsg };
            } else if (type === "content_block_delta") {
              const idx = data.index as number;
              const delta = data.delta as {
                type: string;
                text?: string;
                thinking?: string;
                partial_json?: string;
              };
              if (delta.type === "text_delta" && delta.text) {
                const block = assistantMsg.content[idx] as { type: "text"; text: string };
                block.text += delta.text;
                yield { type: "message_update", message: assistantMsg };
              } else if (delta.type === "thinking_delta" && delta.thinking) {
                const block = assistantMsg.content[idx] as {
                  type: "thinking";
                  thinking: string;
                };
                block.thinking += delta.thinking;
                yield { type: "message_update", message: assistantMsg };
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                pendingToolCallJson += delta.partial_json;
              }
            } else if (type === "content_block_stop") {
              const idx = data.index as number;
              if (currentBlockType === "tool_use") {
                let parsedArgs: Record<string, unknown> = {};
                try {
                  parsedArgs = JSON.parse(pendingToolCallJson) as Record<string, unknown>;
                } catch {
                  parsedArgs = {};
                }
                (
                  assistantMsg.content[idx] as {
                    arguments: Record<string, unknown>;
                  }
                ).arguments = parsedArgs;
              }
              currentBlockType = null;
              yield { type: "message_update", message: assistantMsg };
            } else if (type === "message_delta") {
              const delta = data.delta as { stop_reason?: string };
              assistantMsg.stopReason = (delta.stop_reason ?? null) as string | null;
            } else if (type === "message_stop") {
              yield { type: "message_end", message: assistantMsg };
            }
          } else {
            const parsed = parseSseLine(line);
            if (parsed.data !== undefined) sseDataBuf += parsed.data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return assistantMsg;
  } /**
   * Mock stream turn — for e2e tests only.
   *
   * Reads canned responses from globalThis.__MOCK_LLM_QUEUE__ (a queue).
   * Each turn is either text, toolCalls, or both. The mock simulates
   * SSE streaming by yielding content_block_start / delta / stop events
   * with optional delays between chunks.
   *
   * Activated when baseUrl starts with `mock://`. The transport
   * dispatches to this method instead of making a real HTTP call.
   *
   * Queue shape:
   *   globalThis.__MOCK_LLM_QUEUE__ = [
   *     { text: `Hello!` },
   *     { toolCalls: [{ name: `read_file`, input: {...} }] },
   *     { text: `Done.` },
   *   ]
   *
   * If the queue is empty, returns a default `no mock configured`
   * text response and warns the developer.
   */
  private async *mockStreamTurn(
    model: { id: string; maxTokens?: number },
    _systemPrompt: string,
    _messages: Message[],
    _tools: AgentRunConfig[`tools`],
    signal: AbortSignal | undefined,
  ): AsyncGenerator<unknown, AssistantMsgLike, unknown> {
    const assistantMsg: AssistantMsgLike = {
      content: [],
      stopReason: null,
      model: model.id,
    };

    const w = globalThis as unknown as {
      __MOCK_LLM_QUEUE__?: Array<{
        text?: string;
        toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
        delayMs?: number;
      }>;
    };
    const queue = w.__MOCK_LLM_QUEUE__ ?? [];
    const turn = queue.shift();

    yield { type: `message_start`, message: assistantMsg };

    if (!turn) {
      console.warn(
        `[AnthropicTransport mock] queue empty; use __MOCK_LLM_ENQUEUE__ before sending.`,
      );
      assistantMsg.content.push({ type: `text`, text: `[mock] no canned response queued` });
      yield { type: `message_update`, message: assistantMsg };
      assistantMsg.stopReason = `end_turn`;
      yield { type: `message_end`, message: assistantMsg };
      return assistantMsg;
    }

    if (turn.text) {
      const textBlock = { type: `text` as const, text: `` };
      assistantMsg.content.push(textBlock);
      yield { type: `message_update`, message: assistantMsg };
      const chunkSize = 4;
      for (let i = 0; i < turn.text.length; i += chunkSize) {
        if (signal?.aborted) {
          throw new DOMException(`Aborted`, `AbortError`);
        }
        textBlock.text += turn.text.slice(i, i + chunkSize);
        yield { type: `message_update`, message: assistantMsg };
        await this.simulateChunkDelay(signal, turn.delayMs ?? 5);
      }
    }

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const tc of turn.toolCalls) {
        if (signal?.aborted) {
          throw new DOMException(`Aborted`, `AbortError`);
        }
        const id = `mock_tool_` + Math.random().toString(36).slice(2, 10);
        const toolBlock = {
          type: `toolCall` as const,
          id,
          name: tc.name,
          arguments: tc.input as Record<string, unknown>,
        };
        assistantMsg.content.push(toolBlock);
        yield { type: `message_update`, message: assistantMsg };
        await this.simulateChunkDelay(signal, turn.delayMs ?? 5);
      }
    }

    assistantMsg.stopReason = `end_turn`;
    yield { type: `message_end`, message: assistantMsg };
    return assistantMsg;
  }

  /** Small async delay to simulate network/streaming latency. */
  private async simulateChunkDelay(signal: AbortSignal | undefined, ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener(`abort`, onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException(`Aborted`, `AbortError`));
      };
      signal?.addEventListener(`abort`, onAbort, { once: true });
    });
  }
  /**
   * Public entry — implements pi-agent 的 AgentTransport contract。
   * 负责 complete agent loop:yield agent_start → loop turn (LLM call + tool exec)
   * → yield agent_end。
   *
   * Agent loop (V1.5+ tool calling fix):
   *   旧 implementation only sent one LLM call then emit agent_end. tool_use was
   *   never executed, LLM kept requesting the same tool, UI saw a 131-iteration
   *   loop. New implementation: after each turn, if assistant content has
   *   tool_use blocks, execute them (emit tool_execution_start/end events),
   *   append the tool_result messages to currentMessages, then call LLM again.
   *   Termination: no more tool calls / MAX_TURNS / abort signal.
   *
   * Mock mode: when baseUrl starts with `mock://`, the transport
   * uses mockStreamTurn instead of real HTTP. The mock reads from a
   * global queue (globalThis.__MOCK_LLM_QUEUE__) that the test sets up.
   */
  async *run(
    messages: Message[],
    _userMessage: Message,
    config: AgentRunConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<unknown, void, unknown> {
    const msgs = messages as unknown as any[];
    const cfg = config as unknown as any;
    const apiKey = await this.options.getApiKey();
    if (!apiKey) {
      throw new Error(`AnthropicTransport: 缺 apiKey`);
    }

    const baseUrl = cfg.model.baseUrl ?? `https://api.minimaxi.com/anthropic`;
    const systemPrompt = cfg.systemPrompt ?? ``;
    const tools = cfg.tools;
    const isMockMode = baseUrl.startsWith(`mock://`);

    // Maintain growing messages list. Start with input; after each turn, append
    // assistant + tool results. Next LLM call sees the full history.
    const currentMessages: any[] = msgs.map((m) => ({ ...m }));

    // Collect all messages generated during this prompt cycle (assistant + toolResult).
    const generatedMessages: any[] = [];

    yield { type: `agent_start` };

    let turnIndex = 0;
    try {
      while (turnIndex < MAX_TURNS) {
        if (signal?.aborted) {
          throw new DOMException(`Aborted`, `AbortError`);
        }

        yield { type: `turn_start` };

        // Single turn — either real HTTP or mock, based on baseUrl.
        const turnGen = isMockMode
          ? this.mockStreamTurn(cfg.model, systemPrompt, currentMessages, tools, signal)
          : this.streamTurn(
              apiKey,
              baseUrl,
              cfg.model,
              systemPrompt,
              currentMessages,
              tools,
              signal,
            );
        let assistantMsg: AssistantMsgLike | undefined;
        while (true) {
          const { value, done } = (await turnGen.next()) as IteratorResult<
            unknown,
            AssistantMsgLike
          >;
          if (done) {
            assistantMsg = value;
            break;
          }
          if (value !== undefined) {
            yield value;
          }
        }
        if (!assistantMsg) {
          throw new Error(`AnthropicTransport: streamTurn ended without value`);
        }

        const toolCalls = assistantMsg.content.filter(
          (
            b,
          ): b is {
            type: `toolCall`;
            id: string;
            name: string;
            arguments: Record<string, unknown>;
          } => b.type === `toolCall` && (b as any).id !== undefined,
        );

        currentMessages.push({ role: `assistant`, content: assistantMsg.content });
        generatedMessages.push({
          role: `assistant`,
          content: assistantMsg.content,
          stopReason: assistantMsg.stopReason,
          model: assistantMsg.model,
        });

        if (toolCalls.length === 0) {
          yield {
            type: `turn_end`,
            message: generatedMessages[generatedMessages.length - 1],
            toolResults: [],
          };
          break;
        }

        const toolResultMessages: any[] = [];
        for (const tc of toolCalls) {
          const tool = tools?.find((t: any) => t.name === tc.name) as
            | {
                name: string;
                execute: (id: string, args: unknown, signal?: AbortSignal) => Promise<any>;
              }
            | undefined;

          yield {
            type: `tool_execution_start`,
            toolCallId: tc.id,
            toolName: tc.name,
            args: tc.arguments,
          };

          let resultOrError: any;
          let isError = false;
          try {
            if (!tool) {
              throw new Error(`Tool ${tc.name} not found`);
            }
            resultOrError = await tool.execute(tc.id, tc.arguments, signal);
          } catch (e) {
            resultOrError = e instanceof Error ? e.message : String(e);
            isError = true;
          }

          yield {
            type: `tool_execution_end`,
            toolCallId: tc.id,
            toolName: tc.name,
            result: resultOrError,
            isError,
          };

          const resultContent: Array<{ type: `text`; text: string }> =
            typeof resultOrError === `string`
              ? [{ type: `text`, text: resultOrError }]
              : Array.isArray(resultOrError?.content)
                ? resultOrError.content
                : [{ type: `text`, text: String(resultOrError) }];

          const toolResultMessage = {
            role: `toolResult`,
            toolCallId: tc.id,
            toolName: tc.name,
            content: resultContent,
            details: typeof resultOrError === `string` ? {} : (resultOrError?.details ?? {}),
            isError,
            timestamp: Date.now(),
          };

          yield { type: `message_start`, message: toolResultMessage };
          yield { type: `message_end`, message: toolResultMessage };

          currentMessages.push(toolResultMessage);
          toolResultMessages.push(toolResultMessage);
        }

        yield {
          type: `turn_end`,
          message: generatedMessages[generatedMessages.length - 1],
          toolResults: toolResultMessages,
        };

        turnIndex++;
      }

      if (turnIndex >= MAX_TURNS) {
        console.warn(`[AnthropicTransport] reached MAX_TURNS=${MAX_TURNS}, terminating agent loop`);
      }
    } finally {
      yield { type: `agent_end`, messages: generatedMessages };
    }
  }
}
