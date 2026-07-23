---
name: explain-error
description: Diagnose an error message or stack trace and propose likely causes and fixes. Use when the user pastes an error and asks what it means, why it's happening, or how to fix it.
---

# explain-error

Diagnose runtime errors, compile errors, and stack traces. Identify the most likely root cause and propose concrete next steps.

## When to activate

- User pastes an error message or stack trace and asks "what does this mean?"
- User says "why is this failing?", "why am I getting this error?"
- User is debugging and asks for help interpreting an error
- Build / test / runtime errors with unclear root cause

## Output format

```
## What happened
<one-sentence plain-English summary>

## Root cause
<the specific line / configuration / state causing the error>

## Likely fixes (try in order)
1. <fix #1> — why this might work
2. <fix #2> — why this might work

## Verify
<how to confirm the fix worked>

## If none of the above work
<what to investigate next>
```

## Process

1. **Identify the error type**:
   - Build / compile error (TS, bundler, native module)
   - Runtime exception (TypeError, RangeError, custom)
   - IPC failure (Electron, webview sandbox)
   - Effect-TS failure (Cause, Exit, AppError)
   - Database / SQLite error
   - Network / fetch error
   - LLM provider error (rate limit, auth, model not found)
2. **Pinpoint the location**: file path + line number from the stack trace.
3. **Read the relevant code** (or ask user to paste it if not provided).
4. **Form 2-3 hypotheses** ranked by likelihood. State the top one.
5. **Propose fixes** for the top hypothesis first, then fallbacks.
6. **Suggest verification** — a test, command, or check that confirms the fix.

## Project-specific patterns (codeman-agent)

This project uses:
- **Effect-TS** for async + errors. If you see `Cause.Fail` / `Exit.isFailure`, the error is in the Effect layer.
- **Electron IPC** between main and renderer. If main handler throws, renderer sees `Error: Error invoking remote method 'X': ...`.
- **Solid createStore** for reactive state. If state doesn't update, the proxy path is wrong.
- **SQLite + FTS5** for persistence. If a query returns nothing, check FTS5 index + schema migrations.

## Examples

**TypeScript build error:**
```
Type 'X | undefined' is not assignable to type 'X'.
```
→ Root cause: missing null check. Likely fix: add `if (!x) throw new NotFound(...)` or use `Schema.optional` for the field.

**Effect-TS failure:**
```
FiberFailure: An unknown error occurred in Effect.tryPromise
```
→ Root cause: `Effect.tryPromise` default-catch wraps non-Error rejections. Fix: provide explicit `catch: (e) => new InvalidConfig({...})` to preserve the error type.

**Electron IPC failure:**
```
Error: Error invoking remote method 'skillsScan': Error: ...
```
→ Root cause: main process handler threw. The inner JSON in the message is the actual AppError. Fix: read the inner `{...}` payload.

**SQLite "no such column":**
```
SqliteError: no such column: workspace_id
```
→ Root cause: migration not applied OR field name mismatch. Fix: check `src/main/db/migrations/` and re-run migrations.

## Tone

- **Don't** speculate wildly. If the error is ambiguous, say "two equally likely causes" and explain how to disambiguate.
- **Don't** suggest "restart the app" as a fix unless it's actually a startup race.
- **Do** cite the specific file/line so the user can verify your analysis.
- **Do** ask clarifying questions if critical context is missing (e.g. "which commit did this start failing after?").