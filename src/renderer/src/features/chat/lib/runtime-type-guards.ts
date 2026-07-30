import type {
    AssistantMessage,
    TextContent,
    ThinkingContent,
    ToolCall,
} from "@earendil-works/pi-ai";


export function isAssistantMessage(
    m: { role?: string } | null | undefined,
): m is AssistantMessage {
    return !!m && m.role === "assistant";
}


export function isAssistantLikeMessage(m: unknown): m is AssistantMessage {
    if (!m || typeof m !== "object") {
        return false;
    }
    const obj = m as { role?: string; content?: unknown };
    if (obj.role === "assistant") {
        return true;
    }
    if (obj.role === "user" || obj.role === "toolResult") {
        return false;
    }
    if (!Array.isArray(obj.content)) {
        return false;
    }
    return obj.content.some((b: unknown) => {
        const block = b as { type?: string };
        return block?.type === "thinking" || block?.type === "toolCall" || block?.type === "text";
    });
}

export function isTextBlock(b: unknown): b is TextContent {
    return !!b && typeof b === "object" && (b as { type?: unknown }).type === "text";
}

export function isThinkingBlock(b: unknown): b is ThinkingContent {
    return !!b && typeof b === "object" && (b as { type?: unknown }).type === "thinking";
}

export function isToolCallBlock(b: unknown): b is ToolCall {
    if (!b || typeof b !== "object") {
        return false;
    }
    const block = b as { type?: unknown; id?: unknown };
    return block.type === "toolCall" && typeof block.id === "string";
}


export function contentOf(m: unknown): unknown[] {
    if (!m || typeof m !== "object") {
        return [];
    }
    const c = (m as { content?: unknown }).content;
    return Array.isArray(c) ? c : [];
}
