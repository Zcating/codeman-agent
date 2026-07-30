// 替代之前的 AnthropicTransport 类。pi-agent-core 0.80.3 重构后,
// Agent 不再接受 AgentTransport (自己跑 agent loop),改为接受 streamFn
// (只负责单次 LLM 调用,agent loop / 工具执行 / abort 都由 Agent 内部处理)。
//
// 重要 CORS 行为:
//   ProviderTransport 走 pi-ai 的 anthropic provider → Anthropic SDK → 发
//   `x-api-key` header,在 `api.minimaxi.com` CORS preflight whitelist 之外,
//   webview fetch 报 TypeError。Authorization header 在 whitelist 里,
//   所以这里走 `Authorization: Bearer` 路径。

import {
    createAssistantMessageEventStream,
    type AssistantMessage,
    type AssistantMessageEvent,
    type AssistantMessageEventStream,
    type Context,
    type Message,
    type Model,
    type SimpleStreamOptions,
    type StopReason,
    type TextContent,
    type ThinkingContent,
    type Tool,
    type ToolCall,
    type Usage,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { logger } from "@codeman-frontend/shared/lib/logger";

export function parseSseLine(line: string): { event?: string; data?: string } {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return {};
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
        return {};
    }
    const field = trimmed.slice(0, colonIdx);
    const value = trimmed.slice(colonIdx + 1).replace(/^ /, "");
    if (field === "event") {
        return { event: value };
    }
    if (field === "data") {
        return { data: value };
    }
    return {};
}

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

export function buildAnthropicRequestBody(
    model: { id: string; maxTokens?: number },
    systemPrompt: string,
    messages: Message[],
    tools: Tool[] | undefined,
): AnthropicRequestBody {
    const anthropicMessages: AnthropicMessageParam[] = [];
    for (const m of messages) {
        if (m.role === "user") {
            const content = m.content;
            if (typeof content === "string") {
                anthropicMessages.push({ role: "user", content });
            } else {
                // 把 TextContent[] 拼回纯文本(Anthropic API 也接受 array
                // 形式,但 codeman-agent 的 user message 通常是纯文本)
                const text = content
                    .filter((b): b is TextContent => b.type === "text")
                    .map((b) => b.text)
                    .join("");
                anthropicMessages.push({ role: "user", content: text });
            }
        } else if (m.role === "assistant") {
            const blocks: Array<
                | { type: "text"; text: string }
                | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
            > = [];
            for (const block of m.content) {
                if (block.type === "text") {
                    blocks.push({ type: "text", text: block.text });
                } else if (block.type === "toolCall") {
                    blocks.push({
                        type: "tool_use",
                        id: block.id,
                        name: block.name,
                        input: block.arguments as Record<string, unknown>,
                    });
                }
                // thinking blocks 不回传给 Anthropic(provider 自身不消费)
            }
            if (blocks.length > 0) {
                anthropicMessages.push({ role: "assistant", content: blocks });
            }
        } else if (m.role === "toolResult") {
            const trMsg = m;
            const textContent = trMsg.content
                .filter((b): b is TextContent => b.type === "text")
                .map((b) => b.text)
                .join("");
            const toolResultBlock = {
                type: "tool_result" as const,
                tool_use_id: trMsg.toolCallId,
                content: textContent,
                is_error: trMsg.isError,
            };

            // G33 fix: Anthropic API 协议要求 assistant(tool_use A, B, ...) 的
            // 所有 tool_result 必须 batch 进紧跟的**同一个** user message。如果拆成
            // 多个 user message,第二个 tool_result 的 tool_use 不在 immediate
            // preceding assistant,API 400 "tool call result does not follow tool
            // call (2013)"。
            // 触发: 1 turn N 个并行 tool_use (e.g. read_file + search_files 并行)
            // → handleTurnEnd 聚合到 assistant.toolResults → toPiMessages 拆 N 个
            // ToolResultMessage → 这里必须 batch。
            const lastMsg = anthropicMessages[anthropicMessages.length - 1];
            if (
                lastMsg &&
                lastMsg.role === "user" &&
                Array.isArray(lastMsg.content) &&
                lastMsg.content.length > 0 &&
                lastMsg.content.every((b) => typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_result")
            ) {
                (lastMsg.content as Array<typeof toolResultBlock>).push(toolResultBlock);
            } else {
                anthropicMessages.push({
                    role: "user",
                    content: [toolResultBlock],
                });
            }
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

/**
 * pi-agent-core 0.80.3 的 streamFn:把 pi-ai Context 转成 Anthropic SSE,
 * emit AssistantMessageEvent。Agent 内部处理 abort / agent loop /
 * 工具执行。
 */
export const anthropicStream: StreamFn = (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    void runAnthropicStream(model, context, options ?? {}, stream);
    return stream;
};

async function runAnthropicStream(
    model: Model<string>,
    context: Context,
    options: SimpleStreamOptions,
    stream: AssistantMessageEventStream,
): Promise<void> {
    const signal = options.signal;
    const apiKey = options.apiKey;
    if (!apiKey) {
        logger.error("[anthropicStream] ! 缺 apiKey", { providerModel: model.id });
        stream.push(makeErrorEvent(model, "anthropicStream: 缺 apiKey"));
        return;
    }

    const body = buildAnthropicRequestBody(
        { id: model.id, maxTokens: model.maxTokens },
        context.systemPrompt ?? "",
        context.messages,
        context.tools,
    );

    // dump the actual Anthropic-format messages array on every request.
    // 帮助 debug "tool call result does not follow tool call (2013)" — 直接看到
    // 发到 API 的 messages 序列。Api key 不在这条 log (Authorization 在 header,
    // 不在 body 里),只是 messages JSON。失败时 dump 出来给 Anthropic support
    // ticket 也能用。
    logger.info("[anthropicStream]   body_messages", {
        msgCount: body.messages.length,
        messages: body.messages.map((m) => {
            if (m.role === "assistant") {
                const c = m.content;
                if (Array.isArray(c)) {
                    return {
                        role: "assistant",
                        blockTypes: c.map((b) => (b as { type?: string }).type ?? "?"),
                        blockIds: c
                            .filter((b) => (b as { type?: string }).type === "tool_use")
                            .map((b) => (b as { id?: string }).id),
                    };
                }
                return { role: "assistant", contentShape: typeof c };
            }
            if (m.role === "user") {
                const c = m.content;
                if (Array.isArray(c)) {
                    return {
                        role: "user",
                        blockTypes: c.map((b) => (b as { type?: string }).type ?? "?"),
                        toolUseIds: c
                            .filter((b) => (b as { type?: string }).type === "tool_result")
                            .map((b) => (b as { tool_use_id?: string }).tool_use_id),
                    };
                }
                return { role: "user", contentShape: typeof c };
            }
            return { role: m.role };
        }),
    });

    const baseUrl =
        (model.baseUrl ?? "").replace(/\/$/, "") || "https://api.minimaxi.com/anthropic";
    const url = `${baseUrl}/v1/messages`;

    logger.info("[anthropicStream] >> POST", {
        url,
        model: model.id,
        msgCount: context.messages.length,
        toolCount: context.tools?.length ?? 0,
        maxTokens: body.max_tokens,
    });

    let response: Response;
    try {
        response = await fetch(url, {
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
    } catch (e) {
        handleFetchError(e, model, stream);
        return;
    }

    if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => "<no body>");
        logger.error("[anthropicStream] ! HTTP error", {
            url,
            status: response.status,
            body: errText.slice(0, 500),
        });
        stream.push(
            makeErrorEvent(model, `Anthropic API ${response.status}: ${errText.slice(0, 500)}`),
        );
        return;
    }

    logger.info("[anthropicStream] << response", {
        status: response.status,
        contentType: response.headers?.get("content-type") ?? undefined,
    });

    try {
        const finalMessage = await parseSseStream(response.body, model, signal, stream);
        // success — push done event to terminate stream
        const reason: Extract<StopReason, "stop" | "length" | "toolUse"> =
            finalMessage.stopReason === "length"
                ? "length"
                : finalMessage.stopReason === "toolUse"
                  ? "toolUse"
                  : "stop";
        stream.push({ type: "done", reason, message: finalMessage });
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
            logger.warn("[anthropicStream] aborted");
            stream.push({ type: "error", reason: "aborted", error: makeAbortedMessage(model) });
        } else {
            logger.error("[anthropicStream] ! stream parse failed", { err: String(e) });
            stream.push(makeErrorEvent(model, e instanceof Error ? e.message : String(e)));
        }
    }
}

function handleFetchError(
    e: unknown,
    model: Model<string>,
    stream: AssistantMessageEventStream,
): void {
    if (e instanceof DOMException && e.name === "AbortError") {
        logger.warn("[anthropicStream] fetch aborted");
        stream.push({ type: "error", reason: "aborted", error: makeAbortedMessage(model) });
        return;
    }
    logger.error("[anthropicStream] ! fetch failed", { err: String(e) });
    stream.push(makeErrorEvent(model, e instanceof Error ? e.message : String(e)));
}

function emptyUsage(): Usage {
    return {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
}

function makeErrorMessage(model: Model<string>, message: string): AssistantMessage {
    return {
        role: "assistant",
        content: [{ type: "text", text: message }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: emptyUsage(),
        stopReason: "error",
        errorMessage: message,
        timestamp: Date.now(),
    };
}

function makeAbortedMessage(model: Model<string>): AssistantMessage {
    return {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: emptyUsage(),
        stopReason: "aborted",
        errorMessage: "Aborted",
        timestamp: Date.now(),
    };
}

function makeErrorEvent(model: Model<string>, message: string): AssistantMessageEvent {
    return { type: "error", reason: "error", error: makeErrorMessage(model, message) };
}

function mapStopReason(anthropicReason: string | undefined): StopReason {
    switch (anthropicReason) {
        case "end_turn":
        case "stop_sequence":
            return "stop";
        case "max_tokens":
            return "length";
        case "tool_use":
            return "toolUse";
        case "refusal":
            return "error";
        default:
            return "stop";
    }
}

export async function parseSseStream(
    body: ReadableStream<Uint8Array>,
    model: Model<string>,
    signal: AbortSignal | undefined,
    stream: AssistantMessageEventStream,
): Promise<AssistantMessage> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");

    // Mutable partial state for the assistant message being built.
    const content: Array<TextContent | ThinkingContent | ToolCall> = [];
    let stopReason: StopReason = "stop";
    let accUsage: Usage = emptyUsage();

    let buffer = "";
    let sseDataBuf = "";
    let sseRawBody = ""; // accumulated across all reader.read() chunks — dump target
    let currentBlockType: "text" | "thinking" | "tool_use" | null = null;
    let pendingToolCallJson = "";
    let pendingToolCallId = "";
    let pendingToolCallName = "";

    function snapshot(): AssistantMessage {
        return {
            role: "assistant",
            content: content.map((b) => ({ ...b })),
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: { ...accUsage },
            stopReason,
            timestamp: Date.now(),
        };
    }

    stream.push({ type: "start", partial: snapshot() });

    try {
        while (true) {
            // 显式检查 abort signal — 在 reader.read() 之前快速退出,避免无用的
            // chunk 解析;Agent 的 abort() 会触发这里的 signal。
            if (signal?.aborted) {
                logger.warn("[anthropicStream] parseSseStream aborted", {
                    currentBlockType,
                    pendingToolBytes: pendingToolCallJson.length,
                });
                throw new DOMException("Aborted", "AbortError");
            }
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            sseRawBody += chunk; // capture raw wire bytes
            logger.info("[anthropicStream]   sse_chunk_in", {
                bytes: value.length,
                textPreview: buffer.slice(-500),
            });
            let lineEnd: number;
            while ((lineEnd = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, lineEnd);
                buffer = buffer.slice(lineEnd + 1);
                if (line.trim() === "") {
                    if (!sseDataBuf) {
                        continue;
                    }
                    let data: Record<string, unknown>;
                    try {
                        data = JSON.parse(sseDataBuf) as Record<string, unknown>;
                    } catch {
                        sseDataBuf = "";
                        continue;
                    }
                    sseDataBuf = "";
                    const type = data.type as string;
                    logger.info("[anthropicStream]   sse_event", {
                        type,
                        payload: JSON.stringify(data).slice(0, 600),
                    });

                    if (type === "content_block_start") {
                        const idx = data.index as number;
                        const block = data.content_block as {
                            type: string;
                            id?: string;
                            name?: string;
                        };
                        if (block.type === "text") {
                            currentBlockType = "text";
                            content[idx] = { type: "text", text: "" };
                            stream.push({
                                type: "text_start",
                                contentIndex: idx,
                                partial: snapshot(),
                            });
                        } else if (block.type === "thinking") {
                            currentBlockType = "thinking";
                            content[idx] = { type: "thinking", thinking: "" };
                            stream.push({
                                type: "thinking_start",
                                contentIndex: idx,
                                partial: snapshot(),
                            });
                        } else if (block.type === "tool_use") {
                            currentBlockType = "tool_use";
                            pendingToolCallJson = "";
                            pendingToolCallId = block.id ?? "";
                            pendingToolCallName = block.name ?? "";
                            content[idx] = {
                                type: "toolCall",
                                id: pendingToolCallId,
                                name: pendingToolCallName,
                                arguments: {},
                            };
                            stream.push({
                                type: "toolcall_start",
                                contentIndex: idx,
                                partial: snapshot(),
                            });
                        }
                    } else if (type === "content_block_delta") {
                        const idx = data.index as number;
                        const delta = data.delta as {
                            type: string;
                            text?: string;
                            thinking?: string;
                            partial_json?: string;
                        };
                        if (delta.type === "text_delta" && delta.text) {
                            // LENIENT: real Anthropic emits content_block_start before the first
                            // delta, but mock-server + some test fixtures skip it. Auto-init the
                            // block so we do not TypeError on undefined access.
                            if (!content[idx]) {
                                content[idx] = { type: "text", text: "" };
                                currentBlockType = "text";
                                logger.info("[anthropicStream] lenient init text block", { idx });
                            }
                            const block = content[idx] as { type: "text"; text: string };
                            block.text += delta.text;
                            stream.push({
                                type: "text_delta",
                                contentIndex: idx,
                                delta: delta.text,
                                partial: snapshot(),
                            });
                        } else if (delta.type === "thinking_delta" && delta.thinking) {
                            // LENIENT (mirror text branch).
                            if (!content[idx]) {
                                content[idx] = { type: "thinking", thinking: "" };
                                currentBlockType = "thinking";
                            }
                            const block = content[idx] as {
                                type: "thinking";
                                thinking: string;
                            };
                            block.thinking += delta.thinking;
                            stream.push({
                                type: "thinking_delta",
                                contentIndex: idx,
                                delta: delta.thinking,
                                partial: snapshot(),
                            });
                        } else if (delta.type === "input_json_delta" && delta.partial_json) {
                            pendingToolCallJson += delta.partial_json;
                        }
                    } else if (type === "content_block_stop") {
                        const idx = data.index as number;
                        if (currentBlockType === "tool_use") {
                            let parsedArgs: Record<string, unknown> = {};
                            try {
                                parsedArgs = JSON.parse(pendingToolCallJson) as Record<
                                    string,
                                    unknown
                                >;
                            } catch {
                                parsedArgs = {};
                            }
                            const toolCall: ToolCall = {
                                type: "toolCall",
                                id: pendingToolCallId,
                                name: pendingToolCallName,
                                arguments: parsedArgs,
                            };
                            content[idx] = toolCall;
                            stream.push({
                                type: "toolcall_end",
                                contentIndex: idx,
                                toolCall,
                                partial: snapshot(),
                            });
                        } else if (currentBlockType === "text") {
                            const block = content[idx] as
                                | { type: "text"; text: string }
                                | undefined;
                            if (block) {
                                stream.push({
                                    type: "text_end",
                                    contentIndex: idx,
                                    content: block.text,
                                    partial: snapshot(),
                                });
                            }
                        } else if (currentBlockType === "thinking") {
                            const block = content[idx] as
                                | { type: "thinking"; thinking: string }
                                | undefined;
                            if (block) {
                                stream.push({
                                    type: "thinking_end",
                                    contentIndex: idx,
                                    content: block.thinking,
                                    partial: snapshot(),
                                });
                            }
                        }
                        currentBlockType = null;
                    } else if (type === "message_delta") {
                        const delta = data.delta as { stop_reason?: string };
                        if (delta.stop_reason) {
                            stopReason = mapStopReason(delta.stop_reason);
                        }
                        const rawUsage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
                        if (rawUsage) {
                            accUsage = {
                                input: rawUsage.input_tokens ?? 0,
                                output: rawUsage.output_tokens ?? 0,
                                cacheRead: 0,
                                cacheWrite: 0,
                                totalTokens: (rawUsage.input_tokens ?? 0) + (rawUsage.output_tokens ?? 0),
                                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                            };
                        }
                    }
                    // message_start and message_stop 不需要额外处理
                    // (initial partial 已在 start 事件发过,final end 由调用方 push done)
                } else {
                    const parsed = parseSseLine(line);
                    if (parsed.event !== undefined || parsed.data !== undefined) {
                        logger.info("[anthropicStream]   sse_line", {
                            event: parsed.event,
                            data: parsed.data !== undefined ? parsed.data.slice(0, 2000) : undefined,
                        });
                    }
                    if (parsed.data !== undefined) {
                        sseDataBuf += parsed.data;
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    logger.info("[anthropicStream]   sse_complete_body", {
        totalChars: sseRawBody.length,
        raw: sseRawBody.slice(0, 5000),
        rawTruncated: sseRawBody.length > 5000,
    });

    // Aborted 优先于 stopReason — reader loop 退出时若 signal 已被 abort,
    // 返回 aborted message 而非不完整的 stop
    // BUG FIX: 如果已经有累积的 content（已经从 SSE 流完全读取），即使 signal
    // 已 abort 也应该返回这些 content，而不是 makeAbortedMessage(content: [])。
    // 只有在 content 为空时才返回 makeAbortedMessage（真正没有任何内容可返回）。
    if (signal?.aborted && content.length === 0) {
        return makeAbortedMessage(model);
    }
    return {
        role: "assistant",
        content: content.map((b) => ({ ...b })),
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: { ...accUsage },
        stopReason,
        timestamp: Date.now(),
    };
}
