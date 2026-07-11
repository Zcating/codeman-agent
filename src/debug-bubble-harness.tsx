// Debug harness — vite serves this from /public/debug-bubble.html.
// Mounts 3 representative messages + runs an automated self-check
// (data attributes expose state for Playwright to assert against).

import { render } from "solid-js/web";
import { MessageBubble } from "./features/chat/components/message-bubble";
import { setStore } from "./features/chat/stores/chat.store";
import type { Message } from "./shared/lib/types";

const convId = "dbg-conv";

const messages: Message[] = [
  // Case A: thinking only (think mock entry — empty content + thinking)
  {
    id: "caseA",
    conversation_id: convId,
    role: "assistant",
    content: "",
    thinking:
      "Case A — thinking-only payload. The user typed 'think'. " +
      "I need to verify that thinking text appears inline at the top of the bubble " +
      "after streaming completes (no collapse, no fold). " +
      "If this text is fully visible in the DOM, the V3.1 常驻 display is working correctly.",
    tool_calls: null,
    tool_results: null,
    model: "mock",
    input_tokens: null,
    output_tokens: null,
    created_at: 1,
  },
  // Case B: thinking + text + tool use + tool result (three-blocks)
  {
    id: "caseB",
    conversation_id: convId,
    role: "assistant",
    content:
      "Case B — Let me search for TypeScript files. I expect to find several `.ts` files " +
      "in the project source tree, particularly in `src/features/chat/lib/`.",
    thinking:
      "Case B — The user asked about TypeScript files. I should use the search_files tool " +
      "with a `*.ts` glob. This demonstrates thinking + text + tool use all in one bubble.",
    tool_calls: [
      {
        id: "tc-search-1",
        name: "search_files",
        args: { workspace_id: "ws-1", pattern: "*.ts" },
      },
    ],
    tool_results: [
      {
        tool_call_id: "tc-search-1",
        result: [
          { path: "src/features/chat/lib/runtime.ts", line_number: 1, line_content: "..." },
          { path: "src/features/chat/lib/anthropic-transport.ts", line_number: 1, line_content: "..." },
          { path: "src/features/chat/stores/chat.store.ts", line_number: 1, line_content: "..." },
        ],
        error: null,
      },
    ],
    model: "mock",
    input_tokens: null,
    output_tokens: null,
    created_at: 2,
  },
  // Case C: tool use with error result
  {
    id: "caseC",
    conversation_id: convId,
    role: "assistant",
    content: "Case C — Let me try reading that file.",
    thinking: null,
    tool_calls: [
      {
        id: "tc-err-1",
        name: "read_file",
        args: { workspace_id: "ws-1", path: "/nonexistent/file.ts" },
      },
    ],
    tool_results: [
      {
        tool_call_id: "tc-err-1",
        result: null,
        error: "File not found: /nonexistent/file.ts",
      },
    ],
    model: "mock",
    input_tokens: null,
    output_tokens: null,
    created_at: 3,
  },
];

// Init conversation in chat.store so message-bubble's isStreaming memo doesn't crash.
setStore("byId", convId, {
  id: convId,
  title: "debug",
  system_prompt: null,
  workspace_id: "ws-debug",
  created_at: 1,
  updated_at: 1,
  archived_at: null,
  messages,
  streamingMessageId: null,
  lastError: null,
  runtime: { run: () => ({} as never), cancel: () => {} },
});

const root = document.getElementById("root");
if (root) {
  render(
    () => (
      <div style={{ padding: "20px", "max-width": "900px", margin: "0 auto", "font-family": "sans-serif" }}>
        <h1 data-testid="page-heading">Debug Harness — Agent Bubble 常驻 Display Check</h1>
        <p data-testid="page-intro">
          3 representative messages rendered as the chat UI would after stream completion.
          Each block <strong>must be visible inline</strong> with no collapse mechanism.
        </p>

        <h2 data-testid="case-A-heading">Case A — Thinking Only</h2>
        <div data-testid="case-A-root">
          <MessageBubble message={messages[0]} />
        </div>

        <h2 data-testid="case-B-heading">Case B — Thinking + Text + Tool Use + Result</h2>
        <div data-testid="case-B-root">
          <MessageBubble message={messages[1]} />
        </div>

        <h2 data-testid="case-C-heading">Case C — Tool Use with Error Result</h2>
        <div data-testid="case-C-root">
          <MessageBubble message={messages[2]} />
        </div>
      </div>
    ),
    root,
  );

  // Expose a self-check API for Playwright to invoke. Returns a structured report.
  (window as unknown as { __bubbleCheck: () => unknown }).__bubbleCheck = () => {
    function checkCase(caseId: "A" | "B" | "C") {
      const root = document.querySelector(`[data-testid="case-${caseId}-root"]`);
      if (!root) return { case: caseId, error: "case root not found" };

      const agentBubble = root.querySelector('[data-testid="agent-bubble"]');
      const thinkingSection = root.querySelector('[data-testid="thinking-section"]');
      const inlineToolCalls = root.querySelector('[data-testid="inline-tool-calls"]');
      const agentText = root.querySelector('[data-testid="agent-text-content"]');
      const toolCallArgs = root.querySelectorAll('[data-testid="tool-call-args"]');
      const toolCallResults = root.querySelectorAll('[data-testid="tool-call-result"]');
      const detailsInside = agentBubble?.querySelectorAll("details").length ?? -1;

      function visibleText(el: Element | null) {
        if (!el) return null;
        return (el.textContent ?? "").trim();
      }

      return {
        case: caseId,
        agentBubble: !!agentBubble,
        thinkingSection: !!thinkingSection,
        thinkingTextPreview:
          visibleText(thinkingSection?.querySelector("pre") ?? null)?.slice(0, 80) ?? null,
        inlineToolCalls: !!inlineToolCalls,
        agentText: visibleText(agentText)?.slice(0, 80) ?? null,
        toolCallArgsCount: toolCallArgs.length,
        toolCallArgsText: Array.from(toolCallArgs).map((el) =>
          (el.textContent ?? "").trim().slice(0, 80),
        ),
        toolCallResultCount: toolCallResults.length,
        toolCallResultTextPreview:
          toolCallResults[0]?.textContent?.trim().slice(0, 80) ?? null,
        detailsInsideBubble: detailsInside,
      };
    }

    return {
      caseA: checkCase("A"),
      caseB: checkCase("B"),
      caseC: checkCase("C"),
    };
  };
}