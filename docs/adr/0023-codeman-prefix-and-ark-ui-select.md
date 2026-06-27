# 0023 — codeman-* Naming Convention + Ark UI Select Adoption

**Status**: accepted · **Date**: 2026-06-27 · **Scope**: `shared/components/internal/*` + `shared/components/ui/codeman-select.tsx` + `shared/components/ui/codeman-group-select.tsx` + e2e + docs + tests
**Supersedes (in scope)**: ADR-0022 D5 (codeman-* prefix) + ADR-0022 D4 (hand-rolled Select — was proposed, not implemented)
**Related**: ADR-0022, ADR-0010 Q4 (ui vs internal boundary), ADR-0016 (service-in-store), CONTEXT.md "组件" section

## Context

V2.1 wave 1 (commit 4346d3f + earlier) shipped ADR-0022 + HomeAgentForm + Sidebar primitive + agent-sidebar. After wave 1, two ground-truth corrections emerged:

1. **Naming drift**: CONTEXT.md "组件" section states codeman-* is the namespace, but `agent-sidebar.tsx` is the actual file. Drift.
2. **Hand-rolled Select is wrong shape**: Two consumers emerged (HomeAgentForm workspace picker with "+ Add new" action; ChatView grouped provider picker). Hand-rolling the full shadcn-svelte Select API (Popover + Portal + Trigger + Content + Listbox + Item + ItemGroup + keyboard nav + ARIA + scroll lock + focus trap + typeahead) = 500-800 LOC of bug-prone code. Re-grill after hyperplan team cross-critique evaluated Radix UI (React, no Solid) / Kobalte (Solid-native, larger surface) / @ark-ui/solid (Zag.js FSM, multi-framework, MIT, headless via data-scope/data-part, official Chakra team).

Re-grill 2026-06-27 chose @ark-ui/solid (user pick): Solid-native, ~3-5 KB gzipped per Select usage, full keyboard + ARIA built-in, Floating UI positioning via --reference-width/--x/--y CSS vars.

## Decisions

### D4-N — codeman-* prefix rules

- All files in `shared/components/internal/` MUST start with `codeman-`; component name MUST match (e.g. `CodemanSidebar` exported from `codeman-sidebar.tsx`).
- Rename `agent-sidebar.tsx` → `codeman-sidebar.tsx` (and test file) is atomic single-commit (squash-merged), no partial state.
- Reviewers reject new files in `internal/` without `codeman-` prefix. No precommit enforcement (per ADR-0010 Q4 review convention).
- ui/ keeps non-prefixed names: `button`, `card`, `checkbox`, `input`, `select`, `sidebar`, `textarea`.

### D4-S — Select via @ark-ui/solid

- Add `@ark-ui/solid@^5.37.0` (single new runtime dep).
- Two wrappers in `shared/components/ui/`:
  - `codeman-select.tsx` — single-list Select using `Select.Root` / `Select.Control` / `Select.Trigger` / `Select.ValueText` / `Select.Indicator` / `Select.Positioner` / `Select.Content` / `Select.List` / `Select.Item` / `Select.ItemText` / `Select.ItemIndicator`. Props: `options`, `value`, `onChange`, `placeholder`, `disabled`, `Action` (slot for non-option button).
  - `codeman-group-select.tsx` — adds `Select.ItemGroup` + `Select.ItemGroupLabel`. Props: `groups`, `value`, `onChange`, `placeholder`, `disabled`.
- Both wrappers own: `cn()` styling, z-index policy (`--layer-index`), empty-state slot, disabled handling, typeahead visual feedback.
- `Action` slot: plain `<button>` after `<Select.List>`, separated by `<hr role="separator">`. Calls `useSelectContext().setOpen(false)` on click. NOT in listbox role (trade-off; acceptable per re-grill).
- `HiddenSelect` NOT rendered by default; opt-in via `withHiddenSelect` prop on wrappers.
- Collection API: `createListCollection({ items: [...] })` from @ark-ui/solid with `label` + `value` per item.
- Single-select uses `value: string[]` per Ark UI convention; extract via `e.value[0]`.

### D5'-N — "+ Add new" placement

- Inside `<Select.Content>`, after `<Select.List>` (or last ItemGroup), separated by styled `<hr>`.
- Trade-off: button is NOT arrow-reachable (only Tab-out-able). Mouse-clickable. Defer composite role to V2.2.

## Consequences

### Positive

- Naming drift fixed (docs match code).
- Hand-rolled Select (~500 LOC of bug-prone positioning/keyboard/ARIA code) replaced by ~80 LOC wrapper + ~3-5 KB gzipped dep.
- Two consumer wins: HomeAgentForm card-grid (heavy, scales poorly to 50+ workspaces) → dropdown (compact, scales linearly); ChatView native `<select>` (no groups) → grouped Select (cleaner provider grouping).
- ADR-0023 unblocks 18 atomic commits in V2.1 polish wave 2.

### Negative

- New runtime dep (`@ark-ui/solid`). Maintenance burden if upstream renames components.
- Custom `Action` button not in listbox role = screen reader may not announce it as listbox action. Documented; V2.2 may revisit.
- Ark UI is a moving target (renamed `Listbox`→`List` in v5, `Value`→`ValueText`). Pin minor (`^5.37.0`); audit on major bump.

### Cross-file impact

| File | Change |
|---|---|
| `docs/adr/0023-...md` | This ADR |
| `package.json` + `pnpm-lock.yaml` | + `@ark-ui/solid@^5.37.0` |
| `shared/components/ui/codeman-select.tsx` | NEW (~80 LOC wrapper) |
| `shared/components/ui/codeman-group-select.tsx` | NEW (~100 LOC wrapper) |
| `shared/components/internal/agent-sidebar.tsx` → `codeman-sidebar.tsx` | RENAME (atomic) |
| `features/chat/components/home.tsx` | Replace WorkspaceCard grid with `<CodemanSelect>` |
| `features/chat/components/chat-view.tsx` | Migrate ProviderSelect to `<CodemanGroupSelect>` |
| `CONTEXT.md` | Update "组件" section |
| `docs/adr/0022-...md` | 1-paragraph pointer to ADR-0023 |
| `src/AGENTS.md` + `src/shared/AGENTS.md` + `src/features/chat/AGENTS.md` | Update lookup tables |
| `e2e/helpers.ts` + `e2e/10-home-agent.spec.ts` | Migrate selectors |

Total: 12+ files; 18 atomic commits; reversible within 1 PR.

### Reversibility

Within 1 PR (V2.1 polish wave 2): revert `codeman-*` files → `agent-sidebar`, revert Ark UI import → hand-rolled or alternative. AGENTS.md lookup tables revert. ~150 LOC of pure Select wrapper code disappears.

## References

- ADR-0022 — internal components + design tokens (this ADR adds D4-S + D5'-N, governs naming)
- ADR-0010 Q4 — ui vs internal folder boundary (codeman-* rule is `internal/`-specific)
- ADR-0016 — service-in-store rule (codeman-* components are pure props-driven, no IPC)
- CONTEXT.md "组件" — Codeman Component + UI Primitive glossary entries
- https://ark-ui.com/solid/docs/components/select — official Select docs
- https://ark-ui.com/llms-solid.txt — full LLM-friendly API surface
- https://github.com/chakra-ui/ark — Zag.js FSM source
- Re-grill-with-docs session 2026-06-27 (4 critiques → 7 decisions → R1/R2 confirmations)