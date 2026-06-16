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

  async *run(
    messages: Message[],
    _userMessage: Message,
    config: AgentRunConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<unknown, void, unknown> {
    // pi-ai version drift: Message/AgentEvent from pi-ai@0.73.1 (local) is
    // incompatible with pi-ai@0.9.4 (peer of pi-agent). Cast to any for the
    // version-bridging shim — runtime behavior matches because runtime.ts
    // only reads .role / .content[].type / .content[].text.
    const msgs = messages as unknown as any[];
    const cfg = config as unknown as any;
    const apiKey = await this.options.getApiKey();
    if (!apiKey) {
      throw new Error("AnthropicTransport: 缺少 apiKey");
    }

    const body = buildRequestBody(cfg.model, cfg.systemPrompt, msgs, cfg.tools);

    const baseUrl = cfg.model.baseUrl ?? "https://api.minimaxi.com/anthropic";
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
      model: cfg.model.id,
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let sseDataBuf = "";
    let currentBlockType: "text" | "thinking" | "tool_use" | null = null;
    let pendingToolCallJson = "";

    yield { type: "agent_start" };
    yield { type: "message_start", message: assistantMsg };

    try {
      while (true) {
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

    yield { type: "agent_end", messages: [assistantMsg] };
  }
}
