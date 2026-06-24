//! AgentRuntime — pi-agent 0.9.0 的 Effect Stream 包装 (V2 ADR-0019 重构)。
//!
//! 工厂模式,无 Context.Tag / 无 Layer DI / 无 Ref<Map<ConvId, Agent>>:
//! - `createAgentRuntime()` 返回 `AgentRuntime` 接口,closure 持有 per-run 状态
//! - `run({ context, provider })`: context 是 store messages 浅拷贝(含最新 user msg)
//! - 每次 run 新建 pi-mono Agent + Queue + Fiber
//! - `cancel()`: 调 closure 内 `AbortController.abort()` 触发 fetch abort
//!
//! 详细架构见 ADR-0019。

import { Stream } from "effect";
import type { Message } from "../../../shared/lib/types";

// ─── Runtime event types (5 variants,ADR-0017) ──────────────────

export type RuntimeEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
  | { type: "done"; message: Message }
  | { type: "error"; error: { message: string } };

// ─── Provider config (per-run, not closure) ─────────────────────

export interface ProviderConfig {
  apiKey: string | null;
  baseUrl: string;
  defaultModel: string;
  systemPrompt: string;
  tools: unknown[];
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

// ─── Factory (closure-based, no class, no Context.Tag) ──────────

export function createAgentRuntime(): AgentRuntime {
  let currentAbortController: AbortController | null = null;

  return {
    run({
      context: _context,
      provider: _provider,
    }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
      // TODO(Task 3): assign currentAbortController = new AbortController() first,
      // then create Queue + Agent + Fiber + subscribe to events + Stream.fromQueue.
      // Until then, this is a placeholder returning Stream.empty.
      return Stream.empty;
    },

    cancel(): void {
      currentAbortController?.abort();
      currentAbortController = null;
    },
  };
}
