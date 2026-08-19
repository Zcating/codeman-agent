# — `core/llm/runtime/` sublayer: unified pi-agent orchestration

**Status**: accepted · 2026-08-12

## Context

### 1. Three callers each created pi-agent `Agent` instances independently

After moved LLM primitives (`anthropicStream`, `createProviderFromConfig`, `findDefaultModel`) into `core/llm/`, the actual `Agent` instantiation remained in three places:

| Caller                | File                                                         | Pattern                                                                                                                               |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Chat main agent       | `features/chat/lib/runtime.ts` (379 lines)                   | Full orchestrator: API resolution → tool assembly → `new Agent` → event subscription → per-conv lifecycle → `RuntimeEvent` projection |
| Multi-agent sub-agent | `plugins/multi-agents/lib/multi-agent-factory.ts` (69 lines) | `new Agent` with `allowedTools` filtering + filtered `DEFAULT_TOOL_SNIPPETS` + custom `systemPrompt`                                  |
| Automation LLM action | `plugins/automations/lib/automation-llm.ts` (159 lines)      | Reuses `createMultiAgent` → `new Agent` → `agent.prompt` → extract final text                                                         |

**Duplication**:

- `piProvider = createProviderFromConfig({...})` + `model = findDefaultModel(piProvider, ...)` repeated 3× across chat runtime and multi-agent-factory
- `new Agent({...})` configuration repeated 2× (chat runtime and multi-agent-factory); automation reuses multi-agent-factory so inherits duplication
- `getApiKey: async () => baseProvider.apiKey ?? undefined` repeated 2×

### 2. The three callers consume pi-agent events differently

| Caller      | Event need                                                                                                                                                                                                  | Final result need                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Chat        | **Full event stream** — text_delta → token, thinking_delta → thinking, tool_execution_end → tool_result, turn_end → done (Message-wrapped), agent_end → message_stop, error → error, plus compaction events | Per-conv state writes only — chat does not consume `finalText` directly |
| Multi-agent | **Filtered event stream** — agent_start → `multiAgentsStreamStore.recordStart`, message_update → `appendEvent`, agent_end → `recordComplete`/`recordError`                                                  | Final assistant text returned to chat (per)                 |
| Automation  | **No events**                                                                                                                                                                                               | Just `finalText` (and `usage` for billing telemetry)                    |

### 3. left a gap: `core/llm/` holds primitives but no orchestration

ADR-0068 established `src/renderer/src/core/` as the home for LLM runtime + tool definitions that are shared by multiple callers. It moved `anthropicStream`, `createProviderFromConfig`, `findDefaultModel`, `buildSystemPrompt`, `DEFAULT_*` constants, and three tools into `core/llm/` and `core/tools/`. But the **Agent-construction + event-streaming skeleton** that wraps these primitives was not extracted — it remained either inline in chat runtime or duplicated in multi-agent-factory.

The architectural intention of ("core owns LLM runtime shared by multiple consumers") is incomplete without this skeleton.

### 4. Three callers = real seam, not hypothetical

ADR-0068's "one adapter = hypothetical seam, two = real" principle applies here. Three real callers (chat, multi-agent, automation) creating `Agent` instances independently is a strong signal that the shared orchestration skeleton belongs in core. Without the shared skeleton, every new caller (e.g., a hypothetical background-summary cron task, a future test-only runner) would re-implement Agent instantiation + event subscription + cancel.

### 5. Tool assembly is a separate concern

Chat runtime at `runtime.ts:322-351` assembles tools: `fileTools + webfetchTool + runCommandTool + builtMcpTools + loadSkillTool + delegateTaskTool`. Multi-agent-factory filters tools via `allowedTools`. Automation's tool registry is empty (`toolRegistry = new Map()`).

The **shared "given a set of tools, return AgentTool[]" step** is small enough that caller-side composition suffices. This ADR does **not** move tool assembly into core — it stays a caller responsibility. The runtime abstraction takes a pre-assembled `tools: AgentTool[]` array.

## Decision

### D1. Create `src/renderer/src/core/llm/runtime.ts` with `createLLMRuntime`

```typescript
export interface CreateLLMRuntimeOptions {
  readonly provider: ProviderConfig;
  readonly tools: AgentTool[];
  readonly systemPrompt: string;
  readonly toolExecution?: "sequential" | "parallel"; // default: pi-agent default
  readonly eventMapper?: (coreEvent: CoreRuntimeEvent) => unknown; // caller projection
}

export interface LLMRuntime {
  readonly events: Stream.Stream<CoreRuntimeEvent, never>;
  readonly prompt: (content: string) => Effect.Effect<
    { finalText: string; usage?: { inputTokens: number; outputTokens: number }; error?: string },
    AppError,
    never
  >;
  readonly cancel: () => void;
}

export function createLLMRuntime(opts: CreateLLMRuntimeOptions): LLMRuntime { ... }
```

### D2. `CoreRuntimeEvent` is a core-owned union, not a pi-agent passthrough

Core defines its own event union (subset of pi-agent's `AgentEvent`):

```typescript
export type CoreRuntimeEvent =
  | { type: 'token'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | { type: 'tool_result'; toolCallId: string; result: unknown; error?: string }
  | {
      type: 'turn_end';
      message: {
        text: string;
        thinking: string | null;
        toolCalls: unknown[] | null;
        toolResults: unknown[] | null;
      };
    }
  | { type: 'agent_end' }
  | { type: 'error'; error: { message: string } };
```

Rationale: core should own its boundary types. Callers (chat, multi-agent, automation) never import `@earendil-works/pi-agent-core` for event types — they only import from `core/llm/runtime`.

### D3. `eventMapper` projects generic events into caller-domain shapes

Each caller passes its own `eventMapper`:

- **Chat**: maps `CoreRuntimeEvent` → `RuntimeEvent` (token/thinking/done/compaction\*/error). The mapper is a closure over `transformContext` + `compactionEntries` for the active conversation.
- **Multi-agent** (via `delegate_task` tool): maps `CoreRuntimeEvent` → `multiAgentsStreamStore.actions.{recordStart, appendEvent, recordComplete, recordError}` calls.
- **Automation**: passes no mapper (subscribes to `events` stream but does nothing with them; only consumes `prompt()` result).

### D4. Tool assembly stays in caller code

`createLLMRuntime` accepts a pre-built `tools: AgentTool[]`. The composition logic (`[...fileTools, webfetchTool, runCommandTool, ...mcpTools, loadSkillTool, ...delegateTaskTool]` for chat; `allowedTools.filter(...)` for multi-agent; `[]` for automation) lives in each caller. Rationale: tool assembly is small and caller-specific; introducing a `ToolAssembler` would be premature.

### D5. is amended

ADR-0068 (renderer `core/` layer) is amended to include `core/llm/runtime.ts` as the orchestration sublayer. ADR-0068's enumeration of `core/llm/` contents grows from:

```
core/llm/
├── anthropic-stream-fn.ts
├── pi-provider-adapter.ts
├── build-system-prompt.ts
└── provider-config.ts
```

to:

```
core/llm/
├── anthropic-stream-fn.ts
├── pi-provider-adapter.ts
├── build-system-prompt.ts
├── provider-config.ts
└── runtime.ts            ← NEW (this ADR)
```

### D6. Migration is one atomic commit

Three callers switch simultaneously:

1. `features/chat/lib/runtime.ts` — keeps chat-specific wrapper (per-conv state, compaction hook, `RuntimeEvent` shape), but the `new Agent(...)` + `subscribe` + `agent.prompt` skeleton delegates to `createLLMRuntime` internally. Chat's wrapper owns the `RuntimeEmitter` and `transformContext` callback; calls `runtime.events` to subscribe.
2. `plugins/multi-agents/lib/multi-agent-factory.ts` — replaces `new Agent(...)` with `createLLMRuntime(...)`. Filters tools via `allowedTools` first (caller-side composition per D4). The returned `LLMRuntime` is used by `delegate_task` tool to consume `events` + call `prompt`.
3. `plugins/automations/lib/automation-llm.ts` — calls `createLLMRuntime({ provider, tools: [], systemPrompt: action.systemPrompt })` directly, ignores `events`, awaits `prompt(action.userPrompt)`. **Automation no longer needs multi-agent-factory** for LLM actions; the previous reuse was incidental, not essential.

### D7. Tests split between core/runtime/ (new) and existing callers

- New: `core/llm/runtime.test.ts` — verifies `createLLMRuntime` builds Agent, pipes events through mapper, returns finalText, respects cancel()
- Existing tests stay: `features/chat/lib/runtime.test.ts` (1424 lines), `runtime.compaction.test.ts`, `multi-agent-factory` tests, `automation-llm` tests
- Total new test budget: ~150-200 lines for `core/llm/runtime.test.ts`

### D8. Backward compat within the commit

The commit is internally consistent — all three callers switch at once, typecheck and tests pass post-commit. No intermediate state where chat imports from old `runtime.ts` AND new `core/llm/runtime.ts`.

## Consequences

### Positive

- **Single Agent-construction site.** `createProviderFromConfig` + `findDefaultModel` + `new Agent` calls reduce from 3 to 1 (chat wrapper still has one for its specific setup, but the skeleton is shared)
- **Automation decoupled from multi-agent-factory.** Automation's LLM path no longer depends on `createMultiAgent` being callable — automation has its own direct path through core
- **Multi-agent tooling.** `delegate_task` tool can subscribe to events via `events: Stream` instead of the current `onStreamEvent` callback dance
- **Future extensions.** A background-summary cron, a debug "dry-run" caller, a test-only runner — all gain a one-liner path to LLM execution via `createLLMRuntime`
- **Test surface.** `core/llm/runtime.test.ts` becomes the canonical test for the LLM execution skeleton; chat runtime tests focus on chat-shape mapping; multi-agent factory tests focus on `allowedTools` filtering

### Negative

- **Indirection cost.** Three callers must now understand `createLLMRuntime` surface (events Stream, prompt Effect, cancel) instead of just `agent.prompt(...)`
- **Mapper closures.** Each caller writes a closure over its domain state (compaction entries, multiAgentId, etc.). Slightly more boilerplate than inline `subscribe` blocks
- **CORE knows nothing about chat shape.** D3's `eventMapper` is typed `unknown` — chat's `RuntimeEvent` shape lives in `features/chat/lib/`, not core. This is the right boundary but means a developer reading core alone won't see the chat projection

### Neutral

- **Tool assembly unchanged.** Per D4, callers still assemble tools themselves
- **No new package dependency.** `@earendil-works/pi-agent-core` was already a dependency of all three callers
- **ADR-0068 amendment is small.** Just adds one file (`runtime.ts`) and one paragraph (D5) to the existing scope. No structural change to `core/` directory layout

## Alternatives considered

### Alt-1: Keep status quo (no core runtime)

- Rejected: ADR-0068's spirit violated. Three callers remain parallel. Future new callers re-implement.
- If is wrong about core owning cross-consumer primitives, this is the consistent choice — but was accepted.

### Alt-2: Move chat.runtime.ts into core/ entirely (without splitting)

- Rejected: chat's `RuntimeEvent` shape includes chat-specific concepts (`done` with `Message`, `compaction*`). Putting chat-shape types in core violates the principle of core being domain-neutral.
- The user's earlier suggestion "能否把 runtime 移到 core 中" was reframed by D6 — chat keeps its wrapper in features/chat/lib/, but uses core's skeleton.

### Alt-3: Make `multi-agent-factory` itself the runtime

- Rejected: multi-agent-factory has `allowedTools` filtering + multi-agent-specific systemPrompt composition. Those are multi-agent-domain concerns, not generic runtime concerns. Keeping the factory as a thin caller of `createLLMRuntime` is the right layering.

### Alt-4: Migration in 3 separate commits (one per caller)

- Rejected: per the user's grill answer, the abstraction is "verified" only when all three callers switch — partial migration leaves the abstraction untested by its intended consumers. Atomic commit forces all three to compile against the new core API, surfacing any boundary errors immediately.

## References

- (multi-agent delegation): `delegate_task` tool + multi-agent isolation
- (automations): `llm` action path runs in renderer
- (renderer bridge wrapper contract): all IPC access via typed wrappers
- (renderer `core/` layer): amended by D5
- (cancel Provider.billing): independent of this ADR

## Implementation note

This ADR is the **decision record**. Implementation happens in one commit that:

1. Creates `src/renderer/src/core/llm/runtime.ts`
2. Refactors `features/chat/lib/runtime.ts` to use core skeleton
3. Refactors `plugins/multi-agents/lib/multi-agent-factory.ts` to use core skeleton
4. Refactors `plugins/automations/lib/automation-llm.ts` to use core directly (drops multi-agent-factory dependency for LLM action)
5. Adds `core/llm/runtime.test.ts`
6. Updates to mention runtime sublayer

Commit message: `refactor(core): extract pi-agent runtime skeleton into core/llm/runtime.ts (候选 3)`.

## Amendment (2026-08-13) — chat 迁移落地 + prompt() 结果获取修复

architecture review 2026-08-13 候选 1 配套(与 / 同批):

- **D6 第 1 条落地 — chat wrapper 迁移到 `createLLMRuntime`**:`features/chat/lib/runtime.ts` 的 `createAgentRuntime` 删除了手写 `new Agent` + `agent.subscribe` 投影块(约 80 行),改为订阅 `runtime.events` + 文件级 `mapCoreToRuntimeEvent()` 投影(core 事件 → chat RuntimeEvent,turn_end → done(message),agent_end → message_stop)。此前该文件构建 `toolTypes` 但从未消费(ADR-0070 迁移残留的死代码),现由 `createLLMRuntime` 消费。
- **prompt() 修复 — 结果从 agent_end 事件收集**:pi-agent `Agent.prompt()` 类型与运行时均返回 `Promise<void>`,原 `as unknown as Promise<AgentPromptResult>` cast 在真实运行时拿不到结果(返回 `{ finalText: "", error }`)。`prompt()` 改为在内部订阅回调里从 `agent_end` 事件的 `finalText` / `usage` / `isError` 收集结果,`Effect.tryPromise` 包 `agent.prompt` 并映射失败为 `Unknown`。automation 的 LLM action 是此修复的直接受益者。
- **LLMRuntime 新增 `subscribed: Promise<void>`**:effect `Stream` 的订阅注册是异步的(register 在微任务中调用),chat 先订阅 events 再触发 prompt 时存在竞态(事件丢失 → UI 挂起)。`events` stream 注册完成时 resolve 该 Promise;调用方在 prompt 前 `yield* Effect.promise(() => runtime.subscribed)` 保证事件不丢。只增字段,不破坏 接口。
- **mapAgentEventToCore 补齐 chat 原投影能力**:`toolcall_end` assistantMessageEvent → `tool_call` 事件、`toolCall`(大写 C)content block 识别 —— 从 chat 原 subscribe 块补入 core,保证迁移行为等价。
- **chat prompt 失败语义**:`runtime.prompt` 的 `Effect.catchAll` 里 emit `error` 事件 + `emit.end()`(原代码 `agent.prompt().catch` 的等价行为,缺失会导致消费端挂起)。
