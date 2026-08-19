# — `deriveToolSnippets` replaces `DEFAULT_TOOL_SNIPPETS` static array

**Status**: accepted · 2026-08-12

## Context

### 1. `DEFAULT_TOOL_SNIPPETS` is a hand-maintained mirror of the tool registry

`src/renderer/src/core/llm/build-system-prompt.ts:23-32` hardcodes 8 tool snippets:

```typescript
export const DEFAULT_TOOL_SNIPPETS = [
  { name: 'read_file', summary: 'Read a file from a workspace (UTF-8, ≤10MB)' },
  { name: 'write_file', summary: 'Write content to a file in a workspace (≤10MB)' },
  {
    name: 'edit_file',
    summary: 'Replace text in a file (unique match required unless replaceAll=true)',
  },
  {
    name: 'search_files',
    summary: 'Find files in workspace by glob pattern or content substring (≤100 results)',
  },
  { name: 'delete_file', summary: 'Move a file to the recycle bin (recoverable)' },
  { name: 'webfetch', summary: 'Fetch HTTP/HTTPS URL content as text/markdown/HTML' },
  {
    name: 'run_command',
    summary: 'Execute shell commands (build/test/git), returns status/exitCode/stdout/stderr',
  },
  { name: '_load_skill', summary: "Load a skill's full instructions by skill name" },
] as const satisfies readonly ToolSnippet[];
```

These 8 strings are passed to `buildSystemPrompt({ staticToolSnippets: DEFAULT_TOOL_SNIPPETS })` by 2 callers:

- `chat.store.ts:421` (main chat runtime system prompt)
- `multi-agent-factory.ts:51` (after filtering out `_load_skill`)

The actual tools (`read_file`, `write_file`, `edit_file`, `search_files`, `delete_file`, `webfetch`, `run_command`, `_load_skill`) live in:

- `core/tools/file-ops/file-ops.ts` (5 file tools)
- `core/tools/webfetch/webfetch.ts`
- `core/tools/run-command/run-command.ts`
- `plugins/skills/lib/skill-meta-tool.ts` (will become `core/tools/load-skill/` per)

The static array is a **mirror** of those tool implementations. Adding a tool, renaming a tool, or deleting a tool requires manual update of `DEFAULT_TOOL_SNIPPETS` in lockstep. Forgetting to update causes:

- LLM sees a tool name in its system prompt that does not exist (calls fail)
- LLM does not see a tool name that does exist (never calls it)

### 2. The drift has happened before — `delegate_task` is missing from snippets

`delegate_task` (per) is a registered `AgentTool` that the main chat agent can call when multi-agents are configured. It lives in `plugins/multi-agents/lib/delegate-task-tool.ts` (will become `core/tools/delegate-task/` per). It is NOT in `DEFAULT_TOOL_SNIPPETS` — currently the chat agent's system prompt never mentions `delegate_task`, so the LLM has no signal that it can delegate to multi-agents.

This is itself a drift symptom: `delegate_task` exists in the runtime but is silently absent from the prompt mirror.

### 3. The same pattern works elsewhere — derive, don't mirror

`buildSystemPrompt` already supports `dynamicToolSnippets: readonly string[]` for runtime-discovered snippets (e.g., MCP tools registered after runtime start). Those snippets are passed by callers at runtime and not hardcoded. The dynamic path is the canonical "register tool → describe in prompt" pattern. The static path (`DEFAULT_TOOL_SNIPPETS`) is the legacy exception.

The fix is to apply the same "derive" principle to the static path: pass `AgentTool[]` and derive snippets from each tool's `description` field.

## Decision

### D1. Add `deriveToolSnippets(tools)` to `core/llm/build-system-prompt.ts`

```typescript
import type { AgentTool } from '@earendil-works/pi-agent-core';

export function deriveToolSnippets(tools: ReadonlyArray<AgentTool>): readonly ToolSnippet[] {
  return tools.map((tool) => ({
    name: tool.name,
    summary: tool.description,
  }));
}
```

The snippet's `summary` is the tool's full `description`. No truncation, no transformation — pass-through.

### D2. `LLMRuntime` gains a `snippets` field

`LLMRuntime` (defined in / `core/llm/runtime.ts`) becomes:

```typescript
export interface LLMRuntime {
  readonly events: Stream.Stream<CoreRuntimeEvent, never>;
  readonly prompt: (
    content: string,
  ) => Effect.Effect<
    { finalText: string; usage?: { inputTokens: number; outputTokens: number }; error?: string },
    AppError,
    never
  >;
  readonly cancel: () => void;
  readonly snippets: readonly ToolSnippet[];
}
```

`createLLMRuntime` synchronously derives snippets from `toolTypes.flatMap(createTool)`:

```typescript
const agentTools = opts.toolTypes.flatMap(createTool);
const snippets = deriveToolSnippets(agentTools);

return {
  events: Stream.async<CoreRuntimeEvent, never>(...),
  prompt: (content) => Effect.gen(...),
  cancel: () => currentAgent?.abort(),
  snippets,
};
```

### D3. Callers consume `snippets` for system prompt construction

```typescript
// chat.store.ts
const runtime = createLLMRuntime({ provider, toolTypes, ... });
const systemPrompt = buildSystemPrompt({
  identity: DEFAULT_IDENTITY,
  staticToolSnippets: runtime.snippets,
  guidelines: DEFAULT_GUIDELINES,
  skills: ...,
  userDefault: ...,
});

// multi-agent-factory.ts
const multiAgentRuntime = createLLMRuntime({ provider, toolTypes, ... });
const systemPrompt = buildSystemPrompt({
  identity: DEFAULT_IDENTITY,
  staticToolSnippets: multiAgentRuntime.snippets,
  ...
});
```

No more `DEFAULT_TOOL_SNIPPETS` reference. The static array is deleted.

### D4. `delegate_task` is auto-included in chat snippets (behavioral change)

After this ADR:

- Chat runtime's `toolTypes` includes `{ type: "delegate-task", deps: ... }` when `multiAgents.length > 0`. Therefore `runtime.snippets` includes `{ name: "delegate_task", summary: <delegate_task description> }`. The chat agent's system prompt now mentions `delegate_task` so the LLM learns it can delegate.
- Multi-agent runtime's `toolTypes` does NOT include `delegate_task` (per D5/D6, `delegate_task` is filtered from sub-agent tools to prevent recursion). Therefore multi-agent snippets do not include `delegate_task`.

This is a **behavioral improvement**: the chat agent's LLM now knows about `delegate_task`. Previously the LLM could only learn about it through runtime observation (i.e., trial-and-error). Per, `delegate_task` lives in `core/tools/delegate-task/` after C3 lands — its `description` field will become its snippet summary.

### D5. `DEFAULT_TOOL_SNIPPETS` is deleted

`core/llm/build-system-prompt.ts:23-32` removes `DEFAULT_TOOL_SNIPPETS` entirely. Re-export from `core/index.ts:8` is removed. Imports from `chat.store.ts`, `multi-agent-factory.ts`, and any tests are removed.

The file `core/llm/build-system-prompt.test.ts` updates its existing 24+ tests that passed custom snippets directly to `buildSystemPrompt` (not via `DEFAULT_TOOL_SNIPPETS`) — those tests are unaffected. No test currently tests `DEFAULT_TOOL_SNIPPETS` directly.

### D6. No truncation (deferred)

The architectural choice: pass full `description` text. Token cost rises from ~50 chars/snippet (hardcoded) to ~100 chars/snippet (description). With 6–8 tools per agent, system prompt size grows by ~400 chars.

Truncation is explicitly **deferred** per the user's grill. If token cost becomes a concern (e.g., when many MCP tools inflate the snippet list), truncation can be added later in a separate ADR. deliberately does not pre-optimize.

### D7. Single atomic commit, after and have landed

This ADR assumes:

- (`createLLMRuntime` skeleton) is in place
- (`ToolType` union + `createTool` ts-pattern dispatch) is in place
- `core/tools/load-skill/` and `core/tools/delegate-task/` exist (per)

The C5 commit lands as the third in the sequence:

1. **C2 commit** : `createLLMRuntime` skeleton + 3 callers switch
2. **C3 commit** : `createTool` + `ToolType` + `core/tools/{load-skill,mcp,delegate-task}/`
3. **C5 commit** (ADR-0073, this ADR): `deriveToolSnippets` + `LLMRuntime.snippets` + `DEFAULT_TOOL_SNIPPETS` delete + 2 callers consume `runtime.snippets`

### D8. Tests

`core/llm/build-system-prompt.test.ts` adds tests for `deriveToolSnippets`:

- `deriveToolSnippets([])` → `[]`
- `deriveToolSnippets([{name:"x", description:"y", ...}])` → `[{name:"x", summary:"y"}]`
- Multiple tools preserve order
- Tools with empty description → `summary: ""` (no special handling)

`core/llm/runtime.test.ts` (per) extends to verify `runtime.snippets` matches `deriveToolSnippets(createTool(toolTypes))` for each tool type combination.

## Consequences

### Positive

- **Drift eliminated.** Adding/renaming/deleting a tool automatically updates its snippet. The LLM's prompt mirrors the runtime registry exactly.
- **LLM sees `delegate_task` in chat.** Behavior change is a strict improvement — the chat agent now knows it can delegate. Multi-agent remains unchanged (still excludes `delegate_task`).
- **One source of truth for tool descriptions.** Each tool's `description` is the runtime's parameter description (sent to LLM as the tool schema's `description` field) AND the prompt's snippet summary. Single edit, two surfaces stay in sync.
- **Future tool types free.** When `MCP` tools are added to the runtime (per `core/tools/mcp/`), their snippets are derived automatically. No separate snippet list maintenance.

### Negative

- **Token cost rises.** Each snippet is now ~100 chars (full description) instead of ~50 chars (hand-tuned). 6–8 tools × 50 extra chars = ~300–400 extra chars per system prompt. With Claude Sonnet at 200K context, this is negligible. If token cost becomes a concern (e.g., very long-running automations with many MCP tools), truncation can be added later.
- **`description` field is now load-bearing.** Tool authors must write descriptions that double as: (a) LLM-facing tool schema description (parameters section), (b) prompt snippet summary. Conciseness pressure rises.
- **LLM behavior changes for `delegate_task`.** Previously the LLM could only learn about delegation through runtime trial-and-error. Now it sees the tool in the prompt. If this causes unexpected delegation patterns (e.g., LLM delegates when it shouldn't), the fix is to refine the `delegate_task` description — but this is a content tweak, not an architecture change.

### Neutral

- **`ToolSnippet` type unchanged.** `{ name: string; summary: string }` stays. Only its population strategy changes.
- **`buildSystemPrompt` API unchanged.** `staticToolSnippets: readonly ToolSnippet[]` parameter still accepts caller-provided snippets. `deriveToolSnippets` is the canonical way to populate it.
- **`dynamicToolSnippets` path unchanged.** MCP-runtime-discovered tools still go through the dynamic path (lines 91-96 of `build-system-prompt.ts`).

## Alternatives considered

### Alt-1: Truncate descriptions to ~80 chars in `deriveToolSnippets`

- Rejected per user's grill: truncation is a premature optimization. Token cost is negligible at current scale. Defer until measurement shows it's needed.
- If adopted later: `summary: tool.description.length > 80 ? tool.description.slice(0, 77) + "..." : tool.description`.

### Alt-2: Add `summary` field to `AgentTool` (optional override)

- Rejected: requires changing pi-agent-core's `AgentTool` shape (or wrapping it). All 6 tools in `core/tools/` would need to define both `description` and `summary`. Doubles the maintenance burden for marginal benefit (only "tokens saved" is achieved).
- If adopted later: define a local `ToolWithSummary` wrapper type, not modify pi-agent-core.

### Alt-3: Filter `delegate_task` from chat snippets (keep original behavior)

- Rejected: this perpetuates the drift problem (LLM doesn't know about a real tool). The behavioral change is an improvement, not a regression.
- If LLM behavior regresses (over-delegates), fix the description, not the snippet filtering.

### Alt-4: Keep `DEFAULT_TOOL_SNIPPETS` as a parallel source (some tools hardcoded, others derived)

- Rejected: parallel sources is exactly the drift problem we are fixing. Single derivation strategy.

## References

- (multi-agent delegation): `delegate_task` tool + multi-agent isolation rules
- (system prompt builder): `buildSystemPrompt` API surface
- (core/llm/runtime sublayer): `LLMRuntime` interface; amended by D2 above
- (ToolType + ts-pattern dispatch): prerequisite for this ADR
- CONTEXT.md `Tool (工具)`, `Tool Call (工具调用)`: vocabulary for runtime tools

## Implementation note

This ADR is the **decision record**. Implementation happens in one commit (after and have landed):

1. Add `deriveToolSnippets` function to `core/llm/build-system-prompt.ts`
2. Add `snippets: readonly ToolSnippet[]` to `LLMRuntime` interface in `core/llm/runtime.ts`
3. Update `createLLMRuntime` to compute `agentTools = toolTypes.flatMap(createTool)` and `snippets = deriveToolSnippets(agentTools)`; return both
4. Delete `DEFAULT_TOOL_SNIPPETS` constant from `core/llm/build-system-prompt.ts`
5. Update `core/index.ts` to remove `DEFAULT_TOOL_SNIPPETS` re-export
6. Update `chat.store.ts` to use `runtime.snippets` instead of `DEFAULT_TOOL_SNIPPETS`
7. Update `multi-agent-factory.ts` to use `multiAgentRuntime.snippets` instead of `MULTI_AGENT_TOOL_SNIPPETS` (filter logic for `_load_skill` becomes unnecessary — multi-agent doesn't include `_load_skill` in its `toolTypes`)
8. Add `deriveToolSnippets` tests to `core/llm/build-system-prompt.test.ts`
9. Extend `core/llm/runtime.test.ts` to verify `runtime.snippets` correctness

Commit message: `refactor(core): deriveToolSnippets replaces DEFAULT_TOOL_SNIPPETS (候选 5)`.

## Amendment

**2026-08-13 · amended to reflect actual implementation state**

### snippets field: provided but not universally consumed

D2 added `snippets: readonly ToolSnippet[]` to `LLMRuntime`; D3 specified that callers should consume `runtime.snippets` for system prompt construction. In the current implementation:

- **`core/llm/runtime.ts`** provides `snippets` via `createLLMRuntime` (derived from `toolTypes.flatMap(createTool)`)
- **`chat.store.ts`** and **`multi-agent-factory.ts`** derive snippets via `deriveToolSnippets` directly rather than reading `runtime.snippets`

The intended pattern per D3 ("callers consume `runtime.snippets`") is the correct architectural direction. Any future review should flag if this deviation persists after ADR-0070's `createLLMRuntime` migration is complete.

### eventMapper: defined but not currently activated

`createLLMRuntime` accepts an optional `eventMapper` parameter for transforming runtime events before they reach the event stream. In the current implementation:

- **Chat runtime** does not use `createLLMRuntime`; it constructs its runtime directly without the `eventMapper` parameter
- **`eventMapper` is wired in `createLLMRuntime`** but has no active consumers in the chat or multi-agent paths

If subsequent commits fully migrate chat + multi-agent-factory to `createLLMRuntime`, the `eventMapper` parameter would become an active consumer. Until then, it is a dormant capability.

### Action items for future reviews

1. When chat runtime is migrated to `createLLMRuntime`, verify that `runtime.snippets` is consumed directly (not re-derived via `deriveToolSnippets`)
2. When multi-agent-factory is migrated to `createLLMRuntime`, verify the same
3. If `eventMapper` remains unused after both migrations, re-evaluate whether it should be removed or promoted
