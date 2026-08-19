# — Plugin owns its settings tab; `features/settings/routes/` flattens

**Status**: accepted · 2026-08-12

## Context

### 1. Skill and MCP settings UI live outside their plugins

`features/settings/routes/sections/skills-section.tsx` (109 lines) contains the **full** Skills settings UI: `PageLayoutShell`, `FlatList` over `skillsManifests$`, enable/disable toggles writing `appStore.state.value.disabledSkills`, source-label formatting. The actual `skills.store.ts` lives in `plugins/skills/stores/`.

`features/settings/routes/sections/mcp-section.tsx` (20 lines) is a thin wrapper that calls `refresh()` on mount and renders `<McpSettingsTab />` from `plugins/mcp/components/settings-tab.tsx` (the actual UI).

`router.tsx:19-20` imports both from `features/settings/routes/sections/`. Plugin routes `/plugins/skills` and `/plugins/mcp` resolve to these feature-owned components.

### 2. The cross-domain reach violates spirit

ADR-0068 established `plugins/` as the architectural boundary for plugin capabilities. The plugin-registry (`plugins/lib/plugin-registry.ts:77-89`) declares `route: { path: "/plugins/skills", label: "Skills" }` and `route: { path: "/plugins/mcp", label: "MCP" }`. Plugin routes resolve to feature code — the route's URL is plugin-owned but the rendering is settings-feature-owned. This breaks the principle that "a plugin's URL maps to a plugin's component."

For comparison, the multi-agents and automations plugins render their own settings tabs (`MultiAgentsSettingsTab`, `AutomationsSettingsTab`) directly via `plugins/X/components/settings-tab.tsx`. No feature wrapper. They are the canonical pattern; skills and MCP are the outliers.

### 3. `sections/` subdirectory is structural noise

`features/settings/routes/sections/{llm,app,window,skills,mcp,advanced}-section.tsx` uses an extra `sections/` subdirectory. All 6 files are peer-level siblings — the subdirectory adds no grouping. Other route collections in the codebase (`plugins/automations/routes/`, `features/chat/routes/`) do not use intermediate grouping. The `sections/` directory is dead weight.

The `-section` suffix on file and component names is also redundant: `LlmSection` already lives in a `sections/` directory. The same anti-pattern does not apply to plugin tabs (`McpSettingsTab`, `MultiAgentsSettingsTab`, `AutomationsSettingsTab`) which use `-tab` suffix because they render tab content.

The aligned pattern across the codebase is "**route component uses `-route` suffix and lives directly under `routes/`**". Examples: `AutomationsRoute` in `plugins/automations/routes/automations-route.tsx`, `ConversationRoute` in `features/chat/routes/conversation-route.tsx`. The settings feature's `LlmSection`/`AppSection`/etc. are inconsistent with this convention.

### 4. Plugin barrels inconsistently export settings tabs

| Plugin barrel                   | Exports settings-tab?                       |
| ------------------------------- | ------------------------------------------- |
| `plugins/mcp/index.ts`          | ✅ exports `McpSettingsTab`                 |
| `plugins/automations/index.ts`  | ✅ exports `AutomationsSettingsTab`         |
| `plugins/multi-agents/index.ts` | ❌ does NOT export `MultiAgentsSettingsTab` |
| `plugins/skills/index.ts`       | ❌ does NOT export (doesn't exist yet)      |

The router currently imports each settings-tab directly from `plugins/X/components/settings-tab`. After this ADR, all four plugin barrels will export their settings-tab, and the router may use the barrel or the direct path — both will work.

### 5. MCP onMount refresh is the only side effect in the wrapper

`features/settings/routes/sections/mcp-section.tsx` exists **only** to call `refresh()` on mount and show a toast on success. The wrapper has zero rendering logic of its own — it imports `<McpSettingsTab />` and returns it. After this ADR, the refresh effect lives inside `McpSettingsTab` itself using `createEffect`, matching the pattern in `AutomationsSettingsTab` (which calls `automationsStore.effects.loadRules()` via `createEffect` at mount).

## Decision

### D1. Skills settings UI moves entirely into the skills plugin

`features/settings/routes/sections/skills-section.tsx` (109 lines) is renamed and moved:

```
features/settings/routes/sections/skills-section.tsx
  → plugins/skills/components/settings-tab.tsx
```

The component renames: `SkillsSection` → `SkillsSettingsTab`. The same for the test file:

```
features/settings/routes/sections/skills-section.test.tsx
  → plugins/skills/components/settings-tab.test.tsx
```

`plugins/skills/index.ts` adds: `export { SkillsSettingsTab } from "./components/settings-tab";`

### D2. MCP section wrapper is deleted; refresh moves into `McpSettingsTab`

`features/settings/routes/sections/mcp-section.tsx` is deleted entirely. `plugins/mcp/components/settings-tab.tsx` gains a `createEffect` at the top of the component that calls `refresh()` and toasts on success/error:

```typescript
import { createEffect, type JSX } from 'solid-js';

export function McpSettingsTab(): JSX.Element {
  createEffect(() => {
    void Effect.runPromiseExit(refresh).then((exit) => {
      Exit.match(exit, {
        onFailure: (cause) => {
          const errMsg = cause._tag === 'Fail' ? String(cause.error) : '(unknown error)';
          codemanToast.error(`Failed to load MCP servers: ${errMsg}`);
        },
        onSuccess: ({ servers }) => {
          if (servers.length > 0) {
            codemanToast.success(`Loaded ${servers.length} MCP server(s)`);
          }
        },
      });
    });
  });

  // ... existing JSX
}
```

### D3. `features/settings/routes/sections/` flattens; component names use `-route` suffix

| Old path                                                      | New path                                           | Old component     | New component   |
| ------------------------------------------------------------- | -------------------------------------------------- | ----------------- | --------------- |
| `features/settings/routes/sections/llm-section.tsx`           | `features/settings/routes/llm-route.tsx`           | `LlmSection`      | `LlmRoute`      |
| `features/settings/routes/sections/app-section.tsx`           | `features/settings/routes/app-route.tsx`           | `AppSection`      | `AppRoute`      |
| `features/settings/routes/sections/window-section.tsx`        | `features/settings/routes/window-route.tsx`        | `WindowSection`   | `WindowRoute`   |
| `features/settings/routes/sections/advanced-section.tsx`      | `features/settings/routes/advanced-route.tsx`      | `AdvancedSection` | `AdvancedRoute` |
| `features/settings/routes/sections/llm-section.test.tsx`      | `features/settings/routes/llm-route.test.tsx`      | —                 | —               |
| `features/settings/routes/sections/app-section.test.tsx`      | `features/settings/routes/app-route.test.tsx`      | —                 | —               |
| `features/settings/routes/sections/advanced-section.test.tsx` | `features/settings/routes/advanced-route.test.tsx` | —                 | —               |

The `sections/` subdirectory is removed. Files and tests move up one level.

### D4. Multi-agents barrel gains `MultiAgentsSettingsTab` export

`plugins/multi-agents/index.ts` adds: `export { MultiAgentsSettingsTab } from "./components/settings-tab";`

This brings multi-agents in line with mcp and automations barrel conventions.

### D5. `router.tsx` updates imports to use plugin barrels

```typescript
// Before
import { SkillsSection } from '@codeman-frontend/features/settings/routes/sections/skills-section';
import { McpSection } from '@codeman-frontend/features/settings/routes/sections/mcp-section';
import { SettingsTab as MultiAgentsSettingsTab } from '@codeman-frontend/plugins/multi-agents/components/settings-tab';

// After
import { SkillsSettingsTab } from '@codeman-frontend/plugins/skills';
import { McpSettingsTab } from '@codeman-frontend/plugins/mcp';
import { MultiAgentsSettingsTab } from '@codeman-frontend/plugins/multi-agents';
// (AutomationsSettingsTab already imported from barrel or direct path — no change)
```

The `as MultiAgentsSettingsTab` alias is removed — the barrel-exported name already matches.

### D6. `settings-sidebar.tsx` and other settings consumers

`features/settings/components/settings-sidebar.tsx` references settings routes by URL (`/settings/llm`, `/settings/app`, etc.) and does not import section components — no change needed. The redirected routes `/settings/skills` and `/settings/mcp` continue to redirect to `/plugins/skills` and `/plugins/mcp` per the existing redirect logic in `router.tsx:152-162`. No change needed.

### D7. Single atomic commit

All 11+ file changes happen in one commit. Intermediate state (where `features/settings/routes/sections/` exists but skills/mcp files don't) is invalid — the commit must pass typecheck and tests after.

Commit message: `refactor(settings): plugin owns its settings tab; flatten settings/routes/`.

### D8. No ADR for `/settings/skills` and `/settings/mcp` redirects

The existing redirects from `/settings/{skills,mcp}` to `/plugins/{skills,mcp}` (in `router.tsx:152-162`) stay in place for backward compatibility. No removal in this ADR.

## Consequences

### Positive

- **Plugin URL maps to plugin component.** `/plugins/skills` resolves to `plugins/skills/components/settings-tab.tsx`. The plugin-registry's declared route now matches the actual component location. Same for MCP.
- **`features/settings/routes/` is flat and small.** Four route files at the same level, no `sections/` subdirectory. Consistent with `features/chat/routes/`, `plugins/automations/routes/`.
- **Component naming consistent.** Settings features use `-route` suffix matching the codebase convention (`ConversationRoute`, `AutomationsRoute`). Plugin tabs use `-tab` suffix. The two naming tracks are now non-overlapping.
- **MCP wrapper overhead eliminated.** 20 lines of thin wrapper gone. Refresh effect lives where it belongs.
- **Plugin barrels uniform.** All four plugin barrels export their settings-tab. Multi-agents no longer an outlier.

### Negative

- **One commit touches 11+ files.** Large diff. Mitigated by: (a) mechanical nature of the changes, (b) automated rename via editor refactoring, (c) tests catch any breakages.
- **`features/settings/` becomes thinner.** With skills/mcp removed and sections/ flattened, the settings feature has fewer files. This is the right direction (settings is a thin shell, not a content owner) but means future settings additions should land in features, not in plugins (unless plugin-owned).
- **Skills settings tab now imports from `features/settings/lib/settings-saver`.** This is the persistence helper for any settings writer. The plugin layer reaching into `features/settings/lib/` for one helper is acceptable per spirit (settings is a framework feature providing utility APIs to callers, including plugin-owned callers). If future plugin-settings proliferation motivates it, `settingsSaver` could move to `shared/lib/` later — out of scope for this ADR.

### Neutral

- **Existing redirects preserved.** `/settings/skills` and `/settings/mcp` still redirect. Future cleanup can remove them when external links (e.g., docs, bookmarks) are migrated.
- **Plugin barrel exports.** Direct import from `@codeman-frontend/plugins/skills/components/settings-tab` continues to work; barrel export is additive.

## Alternatives considered

### Alt-1: Keep wrapper for MCP (thin section that onMounts McpSettingsTab)

- Rejected: the wrapper exists only for one `createEffect` + one toast. Inlining both into `McpSettingsTab` is shorter and clearer.

### Alt-2: Keep `sections/` subdirectory

- Rejected: subdirectory adds no grouping. 6 peer files do not need a parent folder. Other routes in the codebase (chat, plugins) don't use intermediate grouping either.

### Alt-3: Keep `-section` suffix

- Rejected: the suffix encodes "this is a settings tab" but the same concept is called "tab" elsewhere (`MultiAgentsSettingsTab`). The codebase convention for route components is `-route` suffix; the codebase convention for settings tab content is `-tab` suffix. The settings feature is itself a router, so its components are routes.

### Alt-4: Move skills/mcp settings content into `core/settings-tabs/` subdirectory

- Rejected: settings tabs are plugin-specific UI, not LLM runtime. They belong in the plugin's `components/` directory. `core/` is for renderer-internal architectural primitives.

### Alt-5: Multi-commit migration (rename first, then plugin moves)

- Rejected: intermediate state is invalid. The commit must be atomic to ensure typecheck + tests pass after.

## References

- (FormDialogShell): shell pattern used in skill/multi-agent settings tabs
- (PageLayoutShell): shell pattern used in mcp/skills/multi-agent/automations settings tabs
- (FlatList): used in skills/mcp/multi-agent settings lists
- (renderer `core/` layer): plugin architectural boundary
- CONTEXT.md `Plugin (插件)` + `Plugin Registry (插件注册表)` + `Plugin Navigation Metadata (插件导航元数据)`: vocabulary for plugin-owned routes

## Implementation note

This ADR is the **decision record**. Implementation happens in one commit:

1. Create `plugins/skills/components/settings-tab.tsx` (copy from skills-section.tsx, rename function)
2. Create `plugins/skills/components/settings-tab.test.tsx` (move from skills-section.test.tsx, update imports)
3. Delete `features/settings/routes/sections/skills-section.tsx`
4. Delete `features/settings/routes/sections/skills-section.test.tsx`
5. Add `export { SkillsSettingsTab }` to `plugins/skills/index.ts`
6. Update `plugins/mcp/components/settings-tab.tsx` to add `createEffect(refresh)` + toast
7. Delete `features/settings/routes/sections/mcp-section.tsx`
8. Add `export { MultiAgentsSettingsTab }` to `plugins/multi-agents/index.ts`
9. Rename `features/settings/routes/sections/{llm,app,window,advanced}-section.tsx` → `features/settings/routes/{llm,app,window,advanced}-route.tsx`; rename component names
10. Rename test files similarly
11. Delete `features/settings/routes/sections/` directory
12. Update `router.tsx` imports
13. Update other consumers (tests, etc.)

Commit message: `refactor(settings): plugin owns its settings tab; flatten settings/routes/`.
