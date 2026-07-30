




import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { isTextBlock } from "@codeman-frontend/features/chat/lib/runtime-type-guards";


export function extractToolErrorText(result: unknown): string {
    if (result instanceof Error) {
        return result.message;
    }

    if (result && typeof result === "object" && "content" in result) {
        
        
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
