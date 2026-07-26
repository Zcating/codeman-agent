//! Extract human-readable error text from a tool result.
//!
//! pi-agent-core's tool failure wraps the error in `AgentToolResult<{content:[{type:"text",text:"..."}],details:{}}>`
//! with `isError: true`. Calling `String(result)` on that shape yields the unhelpful `"[object Object]"`
//! which leaks into the UI error banner. This helper pulls the actual text out of `content[0].text`.
//!
//! Backward compat:
//!   - If result is an Error instance, returns its message
//!   - If result is an AgentToolResult with at least one TextContent block, concatenates their text
//!   - Otherwise falls back to String(result)

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { isTextBlock } from "@codeman-frontend/features/chat/lib/runtime-type-guards";

/**
 * Extract human-readable error text from a tool result.
 *
 * pi-agent-core's tool failure wraps the error in `AgentToolResult<{content:[{type:"text",text:"..."}],details:{}}>`
 * with `isError: true`. Calling `String(result)` on that shape yields the unhelpful `"[object Object]"`
 * which then leaks into the UI error banner.
 *
 * This helper pulls the actual text out of `content[0].text`, falling back to
 * `String(result)` for unexpected shapes.
 */
export function extractToolErrorText(result: unknown): string {
    if (result instanceof Error) {
        return result.message;
    }

    if (result && typeof result === "object" && "content" in result) {
        // AgentToolResult<unknown> is the boundary type between unknown and the Agent's actual return type.
        // The cast is intentional — it tells TypeScript this is the Agent's typed result shape.
        const r = result as AgentToolResult<unknown>;
        if (Array.isArray(r.content)) {
            const texts = r.content.filter(isTextBlock).map((b) => b.text);
            if (texts.length > 0) {
                return texts.join("");
            }
        }
    }

    return String(result);
}
