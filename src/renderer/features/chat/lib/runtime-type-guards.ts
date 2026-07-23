import type {
    AssistantMessage,
    TextContent,
    ThinkingContent,
    ToolCall,
} from "@earendil-works/pi-ai";

/** Strict assistant check — role === "assistant" */
export function isAssistantMessage(
    m: { role?: string } | null | undefined,
): m is AssistantMessage {
    return !!m && m.role === "assistant";
}

/** Lenient assistant check — preserves existing isAssistantLike semantics for fixtures
 *  lacking `role` field (mock test fixtures use bare objects). Acts as type guard
 *  since the lenient path only accepts messages whose content blocks are valid
 *  TextContent / ThinkingContent / ToolCall shapes. */
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

/**
 * Safely extract `.content` as an array of unknown blocks. Returns `[]` for
 * non-objects, null/undefined, missing `content`, string `content` (UserMessage
 * may carry string content), or any non-array `content`. Single source of
 * truth — replaces 3+ inline `m.content as unknown[]` casts (and the OLD
 * format fallback at runtime.ts that used `as unknown as { content?: ... }`).
 */
export function contentOf(m: unknown): unknown[] {
    if (!m || typeof m !== "object") {
        return [];
    }
    const c = (m as { content?: unknown }).content;
    return Array.isArray(c) ? c : [];
}
