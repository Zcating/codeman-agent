# — buildSystemPrompt takes raw SkillManifest, prompt-builder owns formatting

**Status**: accepted · 2026-08-12

## Context

### 1. The pre-fix shape

Two callers — `features/chat/stores/chat.store.ts:413` (main chat agent) and `plugins/multi-agents/lib/multi-agent-factory.ts:50` (sub-agent factory) — both built the LLM system prompt via the same flow:

```ts
// Caller side
const skillsSection = formatSkillsManifestSection(availableSkills);
const systemPrompt = buildSystemPrompt({
  // ... other sections ...
  skillsSection, // ← pre-formatted string
});
```

`formatSkillsManifestSection` lived in `plugins/skills/lib/skill-injector.ts` (a plugin). Two consequences:

- **Duplicate call site** — every consumer of `buildSystemPrompt` that wanted a skills section had to remember to call the formatter. Easy to forget; tests like `chat.store.test.ts` exercised the wrong call path.
- **Cross-domain helper import** — `chat` and `multi-agents` both reached into a plugin (`plugins/skills/lib`) for a prompt helper. The helper had no plugin-specific behaviour; it was a chat-domain concern mis-housed in a plugin.

### 2. The API forced pre-formatting

`BuildSystemPromptSections.skillsSection: string` required a pre-formatted string. The builder itself did not know how to format skills. This pushed formatting responsibility to every caller — exactly the opposite of what a "single source of truth for prompt assembly"  should do.

### 3. The deletion test failure

If `formatSkillsManifestSection` were removed from `plugins/skills/lib/skill-injector.ts`, both callers would break. The function existed only because the builder's interface refused to handle raw data.

## Decision

### D1. Move `formatSkillsManifestSection` into `build-system-prompt.ts` as a private function

The formatter has no plugin-specific behaviour; it is a pure XML escape + `<available_skills>` template. It belongs with the builder that consumes it. Move the function and its `escapeXml` helper into `features/chat/lib/build-system-prompt.ts`, mark them `function`-not-`export` so they stay internal.

### D2. Change `BuildSystemPromptSections.skillsSection: string` → `skills: readonly SkillManifest[]`

Callers pass raw manifests. The builder formats them internally. Signature change:

```ts
// Before
interface BuildSystemPromptSections {
  // ...
  skillsSection?: string; // pre-formatted
  userDefault: string;
}

// After
interface BuildSystemPromptSections {
  // ...
  skills?: readonly SkillManifest[]; // raw
  userDefault: string;
}
```

Builder section 6 becomes:

```ts
if (s.skills && s.skills.length > 0) {
  const formatted = formatSkillsManifestSection(s.skills);
  if (formatted) {
    parts.push(formatted);
  }
}
```

### D3. Delete `plugins/skills/lib/skill-injector.ts`

After D1 + the chat and multi-agents consumers adopt D2, `formatSkillsManifestSection` has zero callers. The file becomes pure overhead. Delete the source and its test file (`skill-injector.test.ts`). The formatter's coverage moves to `build-system-prompt.test.ts` (D4).

### D4. Migrate test coverage into `build-system-prompt.test.ts`

Existing `build-system-prompt.test.ts` had 8 tests . Add cases covering the new `skills` field behaviour:

- Test 5 — skills formatted into `<available_skills>` section
- Test 5b — XML-unsafe names/descriptions are escaped
- Test 5c — empty skills array → no section emitted
- Test 5d — input order is preserved in output (replaces skill-injector.test.ts "顺序按入参数组顺序")
- Test 9 — full input ordering (already existed, just updated to use `skills` field)

### D5. Consumer updates

- `features/chat/stores/chat.store.ts` — `buildSystemPrompt({ skills: availableSkills, ... })`. Available skills comes from typed `SkillsApi.scan()` (Commit 2, prep).
- `plugins/multi-agents/lib/multi-agent-factory.ts` — `buildSystemPrompt({ skills: baseProvider.skills ?? [], ... })`. No typed API needed; caller already has the ProviderConfig.
- `features/chat/lib/runtime.ts` — already passed `provider.systemPrompt`; no change to buildSystemPrompt call signature here.

## Alternatives considered

### Keep `formatSkillsManifestSection` exported from a shared helper module (path A — not selected)

Move only the formatter to `src/shared/lib/skill-formatter.ts`. Two callers import from shared. Builder signature stays as `skillsSection: string`.

Pros: minimal disruption to builder.
Cons: duplicate call-site responsibility (caller still must call formatter + pass string). Does not solve the "one place owns prompt formatting" principle. Rejected because it preserves the original smell at the type-system level.

### Inverted control: pass a render function (path B — not selected)

```ts
interface BuildSystemPromptSections {
  skills?: readonly SkillManifest[];
  skillsRenderer?: (skills: readonly SkillManifest[]) => string;
  // ...
}
```

Pros: builder stays decoupled from skill format.
Cons: yet another thing for callers to pass; the formatter is small enough that abstraction overhead > benefit. The skill formatter is the obvious default — overriding it would be a code smell, not a feature. Rejected as over-engineering.

### Keep `skillsSection` as a deprecated escape hatch (path C — not selected)

Add `skills` as the new field, keep `skillsSection` working. After both consumers migrate, remove `skillsSection`.

Pros: no transient build breakage.
Cons: dead code during the migration window, two valid ways to do the same thing for one or two commits. Rejected because the staged refactor (Commits 1 → 2 → 3) is short enough that transient breakage is acceptable, and the codebase is mid-flight under a single agent session — there is no external dependency on the broken state.

## Consequences

### Positive

- Builder owns its formatting. Adding a new section category (e.g., user-injected MCP rules) does not require touching callers — pass raw data, builder formats.
- Cross-domain helper import (`chat → plugins/skills/lib`) eliminated. Plugin no longer hosts chat-domain concerns.
- One fewer file in `plugins/skills/lib/` (smaller plugin surface).
- Test coverage consolidated where it belongs (`build-system-prompt.test.ts` covers both builder and formatter).

### Negative

- Transient build breakage between Commit 1 (builder signature change) and Commits 2–3 (consumer updates). Both intermediate states are local to the staging session and recovered in the same plan.
- Caller can no longer customise the skills XML format (would require exporting the formatter). Acceptable — no caller has expressed a need to customise.

### Neutral

- No change to `BuildSystemPromptSections` fields other than the skills one.
- No new exports from `features/chat/lib/build-system-prompt.ts`.
- No (system prompt assembler) contradiction — establishes the assembler; this ADR refines one section's input shape.

## Validation

- `pnpm run typecheck` — clean across node + web configs.
- `pnpm exec vitest run src/renderer/src/features/chat/lib/build-system-prompt.test.ts` — 13/13 passing (was 8, added 5 covering the new `skills` field).
- `pnpm exec vitest run src/renderer/src/features/chat/stores/chat.store.test.ts` — 58/58 passing.
- `pnpm exec vitest run src/renderer/src/plugins/multi-agents/lib/multi-agent-factory.test.ts` — 7/7 passing.
- `pnpm exec vitest run src/renderer/src/features/chat/lib/runtime.test.ts src/renderer/src/features/chat/lib/runtime.compaction.test.ts` — 47/47 passing.
- `grep -rn 'plugins/skills/lib/skill-injector' src/` — zero hits after Commit 5 (file deleted).

## Rollback

If the new signature breaks downstream consumers not anticipated:

1. Restore `plugins/skills/lib/skill-injector.ts` from git history (Commit 5 deletion is reversible).
2. Re-add `skillsSection: string` field to `BuildSystemPromptSections` alongside `skills`.
3. Re-export `formatSkillsManifestSection` from `build-system-prompt.ts`.
4. Update `chat.store.ts` + `multi-agent-factory.ts` to call formatter externally.

Do not rollback Commit 4 (`runtime.ts` typed APIs) — that change is independent of this ADR and stands regardless.

## Related

- — system prompt assembler (original)
- — ProviderApi fresh-lookup seam (data access pattern this design complements)
- — renderer-side bridge wrapper contract (typed adapter principle applied here)
- 5-commit staging plan (Commits 1–5 in this sequence) executed in single session `9acdb09 → 217f4d2 → 4403d71 → 3ce410d → (pending)`
