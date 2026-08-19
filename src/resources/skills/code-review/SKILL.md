---
name: code-review
description: Review a git diff for bugs, performance regressions, and style problems. Use when the user asks to review changes, review a PR, or self-review before committing.
---

# code-review

Review staged or unstaged git changes for correctness, performance, and style. Output a structured review with severity tags.

## When to activate

- User pastes a `git diff` and asks for review / feedback
- User says "review this", "code review", "check my changes"
- User is preparing a PR and wants a pre-review
- User says "what could go wrong with this code?"

## Output format

Produce a structured review with these sections (skip empty ones):

```
## Critical (must fix)
- [path:line] <issue>

## Warnings (should fix)
- [path:line] <issue>

## Suggestions (consider)
- [path:line] <idea>

## Strengths
- <what's done well>
```

## Severity definitions

- **Critical**: bugs, type errors, data loss, security holes, breaking changes
- **Warnings**: performance regressions, accessibility issues, missing tests, edge cases
- **Suggestions**: refactor ideas, naming, doc strings

## What to check

1. **Correctness**:
   - Off-by-one errors in loops / array indices
   - Missing `await` on async calls
   - Race conditions in concurrent code
   - Null / undefined handling
   - Type errors (especially `as any` / `@ts-ignore` — flag immediately)
2. **Effect-TS patterns** (this project uses Effect-TS):
   - Business functions not wrapped in `Effect.fn`
   - Errors not extending `AppError` via `Schema.TaggedError`
   - Schemas not using `effect/Schema` (`Schema.Struct`, `Schema.brand`, `Schema.filter`)
   - Empty `catch` blocks (`catch(e) {}`)
3. **Performance**:
   - O(n²) when O(n) is possible
   - Synchronous file I/O on the main thread
   - Unbounded loops / memory growth
4. **Security**:
   - Path traversal (especially with user input)
   - Unescaped user input in shell / SQL
   - API key / secret leaks
5. **Style** (this project's conventions):
   - `as any` / `@ts-ignore` (forbidden — flag as Critical)
   - BEM class names (forbidden — use Tailwind utility classes per)
   - Inline `<style>` blocks (forbidden — use `@theme` tokens)
   - `createSignal` outside `stores/` (forbidden — must live in `src/features/<feature>/stores/`)
   - Direct IPC in components (forbidden — go through Store per)

## Process

1. Read the diff carefully, file by file.
2. For each potential issue, note `[file_path:line_number]` for the user to jump to.
3. Be specific — "the `for` loop at line 42 has off-by-one" beats "loops look suspicious".
4. **Don't** flag style preferences not documented here (tabs vs spaces, naming length, etc.).
5. If the diff is small (<50 lines), be thorough. If large (>500 lines), focus on Critical + Warnings only.
6. End with **Strengths** — what the author did well. Always include this section.

## Tone

- Constructive, not pedantic
- Acknowledge tradeoffs ("could use Map for O(1) but Array.find is fine at this scale")
- Don't lecture — assume the author is competent
- Skip "you might want to consider" hedging; just say the thing