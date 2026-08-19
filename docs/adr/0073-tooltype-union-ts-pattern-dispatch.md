# — `core/llm/llm-tools-factory.ts`: ToolType union + ts-pattern dispatch

**Status**: accepted · 2026-08-12

## Context

### 1. After, `createLLMRuntime` accepts `tools: AgentTool[]`

ADR-0070 (this session) extracted `core/llm/runtime.ts` exposing `createLLMRuntime({ provider, tools: AgentTool[], systemPrompt, ... })`. Callers (chat, multi-agent, automation) compose `AgentTool[]` by importing concrete tools from `core/tools/{file-ops,run-command,webfetch}/` (per), `plugins/skills/lib/skill-meta-tool.ts`, `plugins/multi-agents/lib/delegate-task-tool.ts`, and inline `buildMcpTools` (currently defined in `runtime.ts:38-79`).

The current "build tool array" code at `features/chat/lib/runtime.ts:322-351` (post-ADR-0070):

```typescript
const fileTools = createFileTools(provider.workspaceId);
const builtMcpTools = buildMcpTools(mcpTools);
const baseTools = [...fileTools, webfetchTool, runCommandTool, ...builtMcpTools, loadSkillTool];

const toolRegistry = new Map<string, AgentTool>(baseTools.map((t) => [t.name, t]));

const delegateTaskTool =
  multiAgents.length > 0
    ? buildDelegateTaskTool(multiAgents, provider, toolRegistry, onStreamEvent)
    : null;
const tools = delegateTaskTool ? [...baseTools, delegateTaskTool] : baseTools;
```

This means: every caller of `createLLMRuntime` must know how to assemble tools, including imports from 5 different locations.

### 2. Tool assembly knowledge leaks across plugin boundaries

Per the C3 architecture review, plugins currently reach into `core/llm/` and `core/tools/` to assemble tool arrays:

- `plugins/multi-agents/lib/multi-agent-factory.ts` imports `createProviderFromConfig`, `findDefaultModel`, `anthropicStream`, `buildSystemPrompt`, `DEFAULT_*`, `ProviderConfig` from `core/llm/`
- After, multi-agent-factory still needs `buildDelegateTaskTool` from `plugins/multi-agents/lib/delegate-task-tool.ts` — a plugin-internal tool exposed to chat runtime
- `plugins/automations/lib/automation-llm.ts` (per) directly calls `createLLMRuntime` with `tools: []` (empty)
- `plugins/skills/lib/skill-meta-tool.ts` (loadSkillTool) is imported by chat runtime but lives in a plugin

The architectural truth: `loadSkillTool`, `delegateTaskTool`, `buildMcpTools` are LLM runtime tools, not plugin-specific tools. They are the agent's toolbox, regardless of who calls them.

### 3. ADR-0068's "core owns shared LLM runtime + tools" boundary is incomplete

ADR-0068 moved `file-ops`, `run-command`, `webfetch` into `core/tools/`. But it left `loadSkillTool` in `plugins/skills/`, `delegateTaskTool` in `plugins/multi-agents/`, and `buildMcpTools` inline in chat runtime. added `core/llm/runtime.ts` as the orchestration sublayer. completes the picture by moving all tool implementations into `core/tools/` and exposing them through a single dispatch function.

### 4. "Three adapters = hypothetical seam, two = real" — six = unambiguous

Six tool types currently exist (`file-ops`, `command`, `web-fetch`, `mcp`, `load-skill`, `delegate-task`). Each has its own creation logic and config. A single `createTool` dispatcher with ts-pattern exhaustive matching is the canonical way to handle six variants without dynamic dispatch and without `switch` chains.

## Decision

### D1. Create `src/renderer/src/core/llm/llm-tools-factory.ts` with a single `createTool` dispatch function

```typescript
import { match } from 'ts-pattern';
import { createFileOpsTools } from '@codeman-frontend/core/tools/file-ops';
import { commandTool } from '@codeman-frontend/core/tools/run-command';
import { webFetchTool } from '@codeman-frontend/core/tools/webfetch';
import { loadSkillTool } from '@codeman-frontend/core/tools/load-skill';
import { buildMcpTools } from '@codeman-frontend/core/tools/mcp';
import {
  buildDelegateTaskTool,
  type DelegateTaskToolDeps,
} from '@codeman-frontend/core/tools/delegate-task';
import type { AgentTool } from '@earendil-works/pi-agent-core';

export type ToolType =
  | { readonly type: 'file-ops'; readonly workspaceId: string }
  | { readonly type: 'command' }
  | { readonly type: 'web-fetch' }
  | { readonly type: 'mcp'; readonly entries: ReadonlyArray<McpToolEntry> }
  | { readonly type: 'load-skill' }
  | { readonly type: 'delegate-task'; readonly deps: DelegateTaskToolDeps };

export function createTool(toolType: ToolType): AgentTool[] {
  return match(toolType)
    .with({ type: 'file-ops' }, ({ workspaceId }) => createFileOpsTools(workspaceId))
    .with({ type: 'command' }, () => [commandTool])
    .with({ type: 'web-fetch' }, () => [webFetchTool])
    .with({ type: 'mcp' }, ({ entries }) => buildMcpTools(entries))
    .with({ type: 'load-skill' }, () => [loadSkillTool])
    .with({ type: 'delegate-task' }, ({ deps }) => [buildDelegateTaskTool(deps)])
    .exhaustive();
}
```

`createTool` returns `AgentTool[]` (not `AgentTool`) because `file-ops` returns 5 tools and `mcp` returns N tools. The dispatcher is uniform — all branches return `AgentTool[]`.

### D2. `ToolType` is the public tool contract

Plugins and features do not import concrete tool implementations from `core/tools/`. They declare their tool needs via `ToolType[]` and pass it to `createLLMRuntime` (which internally calls `createTool` for each).

```typescript
// Before this ADR (per):
const fileTools = createFileTools(provider.workspaceId);
const baseTools = [...fileTools, webfetchTool, runCommandTool, ...];
const runtime = createLLMRuntime({ provider, tools: baseTools, ... });

// After this ADR:
const runtime = createLLMRuntime({
  provider,
  toolTypes: [
    { type: "file-ops", workspaceId: provider.workspaceId ?? "" },
    { type: "command" },
    { type: "web-fetch" },
    { type: "mcp", entries: mcpToolEntries },
    { type: "load-skill" },
    ...(multiAgents.length > 0 ? [{ type: "delegate-task", deps: { ... } } as const] : []),
  ],
  systemPrompt,
});
```

`createLLMRuntime` internally calls `toolTypes.flatMap(createTool)` to build the `AgentTool[]`.

### D3. Move three tool implementations into `core/tools/`

| Old location                                     | New location                | What moves                                                    |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------- |
| `plugins/skills/lib/skill-meta-tool.ts`          | `core/tools/load-skill/`    | `loadSkillTool` factory + schemas + tests + AGENTS.md         |
| `plugins/multi-agents/lib/delegate-task-tool.ts` | `core/tools/delegate-task/` | `buildDelegateTaskTool` factory + schemas + tests + AGENTS.md |
| inline in `features/chat/lib/runtime.ts:38-79`   | `core/tools/mcp/`           | `buildMcpTools` factory + tests                               |

The `plugins/skills/` and `plugins/multi-agents/` directories retain their plugin-specific UI components, settings tabs, IPC adapters, and stores. They no longer export tool-creation functions. They only export config (e.g., `multiAgents: MultiAgentConfig[]`) that gets fed into `ToolType` configs.

### D4. `core/tools/` becomes the canonical agent-toolbox

After this ADR:

```
core/tools/
├── file-ops/
├── run-command/
├── webfetch/
├── load-skill/      (NEW — moved from plugins/skills)
├── mcp/             (NEW — moved from runtime.ts)
└── delegate-task/   (NEW — moved from plugins/multi-agents)
```

Six tools total. `core/tools/` is the "LLM agent toolbox" — every tool the agent can ever call lives here.

### D5. Plugin-tool migration is not a behavioral change

`loadSkillTool`'s implementation does not change when moved — only its location and import path. Same for `buildDelegateTaskTool`. Same for `buildMcpTools`. Their semantics, schemas, and tests move with them. The behavior of `/load_skill`, `delegate_task`, MCP `tools/call` is preserved.

### D6. Update to take `toolTypes: ToolType[]` instead of `tools: AgentTool[]`

ADR-0070 D4 said: "createLLMRuntime accepts a pre-built `tools: AgentTool[]`." This ADR supersedes that decision: `createLLMRuntime` accepts `toolTypes: ToolType[]` and internally calls `createTool` for each. ADR-0070's D6 (migration list) and D7 (test list) are also updated.

### D7. Migration is one atomic commit (after has landed)

ADR-0070 lands first (per user's sequencing). Then this ADR lands as commit 2:

1. Create `core/llm/llm-tools-factory.ts` with `ToolType` + `createTool`
2. Create `core/tools/{load-skill,mcp,delegate-task}/` with moved impls + tests + AGENTS.md
3. Delete `plugins/skills/lib/skill-meta-tool.ts` (replaced by `core/tools/load-skill/`)
4. Delete `plugins/multi-agents/lib/delegate-task-tool.ts` (replaced by `core/tools/delegate-task/`)
5. Remove inline `buildMcpTools` from `runtime.ts` (replaced by `core/tools/mcp/`)
6. Update `createLLMRuntime` to take `toolTypes: ToolType[]` (refactor in `core/llm/runtime.ts`)
7. Update 3 callers (chat runtime, multi-agent-factory, automation-llm) to pass `toolTypes: ToolType[]`
8. Add `core/llm/llm-tools-factory.test.ts` (~80-120 lines)

### D8. Plugins can still import `ToolType` and `createLLMRuntime`

`ToolType` and `createLLMRuntime` are public API of `core/llm/runtime.ts`. Plugins declare `ToolType[]` and pass it to `createLLMRuntime`. Plugins never import concrete tool implementations from `core/tools/`.

This is the actual "plugin cannot reach into core internals" enforcement — after ADR-0071:

- Plugins CAN import `ToolType`, `createLLMRuntime` from `core/llm/runtime.ts`
- Plugins CAN import `ProviderConfig` from `core/llm/provider-config`
- Plugins CAN import `buildSystemPrompt` from `core/llm/build-system-prompt`
- Plugins CANNOT import from `core/tools/*` (any concrete tool implementation)
- Plugins CANNOT import `createTool` from `core/llm/llm-tools-factory.ts` (private dispatch)

## Consequences

### Positive

- **Single tool-list contract.** All callers (chat, multi-agent, automation) use the same `ToolType[]` shape. No more 5-file import dance.
- **Plugin-tool boundary enforced.** Plugins no longer reach into `core/tools/` for concrete tools. The plugin layer is purely configuration + UI.
- **`ts-pattern` exhaustive matching** catches missing tool types at compile time. Adding a 7th tool type requires updating `ToolType` union + `createTool` match — TypeScript flags all call sites.
- **Tool impls co-located with tests + AGENTS.md.** Each tool has its own directory under `core/tools/` with factory + schema + tests + AGENTS.md, following the existing pattern from `file-ops/run-command/webfetch`.

### Negative

- **One more file in `core/llm/`.** `llm-tools-factory.ts` adds to the directory's surface area. Mitigated by it being a thin dispatch function (~40 lines).
- **Tool type config can be verbose.** A typical chat runtime call site goes from `tools: baseTools` (already-built) to `toolTypes: [{ type: 'file-ops', workspaceId }, { type: 'command' }, ...]`. More boilerplate per call site, but each line is explicit about what the runtime gets.
- **`buildDelegateTaskTool`'s deps shape changes.** Currently `buildDelegateTaskTool(multiAgents, provider, toolRegistry, onStreamEvent)` takes 4 positional args. After D3, it takes a single `DelegateTaskToolDeps` object. Callers must adapt.

### Neutral

- **ADR-0070 amendment.** D6 supersedes D4. The runtime skeleton's API evolves. Existing tests for `createLLMRuntime` (per) need updating.
- **Two-step commit.** Per user grill, lands first with `tools: AgentTool[]`, then this ADR changes to `toolTypes: ToolType[]`. Intermediate state is valid but has a temporary API surface.

## Alternatives considered

### Alt-1: Keep `tools: AgentTool[]` (per)

- Rejected: doesn't fix the plugin-tool reach problem. Plugins still import concrete tools.
- Per user's grill, this is explicitly rejected.

### Alt-2: Tagged union with `kind` discriminator (not `type`)

- Rejected: `type` is shorter and consistent with pi-agent-core's `AgentEvent` discriminator style.
- Functionally equivalent.

### Alt-3: Per-tool-type factory exports (fileOpsTool, commandTool, etc.)

- Rejected per user's grill: ts-pattern match with single `createTool` is cleaner than 6 named exports. The match is exhaustive, type-safe, and discoverable.

### Alt-4: Keep tools in their current locations (plugins/skills, plugins/multi-agents)

- Rejected: violates "core owns LLM runtime + tools" from ADR-0068. Plugins should not own tool implementations.

### Alt-5: Move tools to `core/llm/tools/` (subdirectory of `core/llm/`)

- Rejected per user's grill: `core/tools/` already exists from and is the canonical home for tool implementations. Adding `core/llm/tools/` would split tool-related code across two locations.

## References

- (multi-agent delegation): `delegate_task` tool + multi-agent isolation
- (automations): `llm` action path runs in renderer
- (renderer `core/` layer): established `core/tools/` for tool impls
- (core/llm/runtime sublayer): `createLLMRuntime` skeleton; superseded D4 by D6 above
- CONTEXT.md `Tool (工具)`, `Tool Call (工具调用)`, `Tool Result (工具结果)` vocabulary

## Amendment (2026-08-13) — delegate-task 接口收窄为 agent 引用 + runner 接缝

architecture review 2026-08-13 候选 1 落地:`core/tools/delegate-task` 的接口从「完整 agent 设计」收窄为「引用 + 接缝」,core → plugin 反向依赖清零。

- **D1 修正 — ToolType 变体拆平**:`{ type: "delegate-task"; deps: DelegateTaskToolDeps }` → `{ type: "delegate-task"; agents: readonly AgentRef[]; run: DelegateTaskRunner }`(与 `mcp.entries` / `file-ops.workspaceId` 形态一致,删除 deps 包装)。`AgentRef { id, name, description }` 与 `DelegateTaskRunner`(run: `Effect<{ finalText, usage? }, AppError, never>`)由 `core/tools/delegate-task` 定义。
- **D8 边界落实 — plugin 提供 runner 适配器**:`plugins/multi-agents/lib/multi-agent-runner.ts` 新增 `createMultiAgentRunner({ configs, baseProvider, toolRegistry, onStreamEvent })`,闭包持有 MultiAgentConfig 设计、实例化子代理、投影流事件。`core/tools/delegate-task` 不再 import plugin(类型走私清除,ADR-0071 D8 边界真正成立)。chat runtime 装配处声明式组装:`agents: multiAgents.map(toAgentRef)` + `run: createMultiAgentRunner(...)`。
- **core/tools barrel 补全**:`core/tools/index.ts` 现在导出全部六工具(候选 2);delegate-task 依赖方向修复后,barrel 导出不再拖 plugin 依赖。
- **错误语义**:runner 失败走 AppError 家族(NotFound / ToolCall / Unknown);模块 execute 内桥接为 pi-agent 可读的 `Error.message`(TaggedError 的 message 在 Schema 字段上,`Error.message` 为空)。

## Implementation note

This ADR is the **decision record**. Implementation happens in one commit (after has landed):

1. Create `src/renderer/src/core/llm/llm-tools-factory.ts`
2. Create `src/renderer/src/core/tools/{load-skill,mcp,delegate-task}/`
3. Delete `src/renderer/src/plugins/skills/lib/skill-meta-tool.ts`
4. Delete `src/renderer/src/plugins/multi-agents/lib/delegate-task-tool.ts`
5. Refactor `createLLMRuntime` in `core/llm/runtime.ts` to take `toolTypes: ToolType[]`
6. Update 3 callers to use `toolTypes: ToolType[]`
7. Add `src/renderer/src/core/llm/llm-tools-factory.test.ts`

Commit message: `refactor(core): ToolType union + ts-pattern dispatch in core/llm/llm-tools-factory.ts (候选 4)`.
