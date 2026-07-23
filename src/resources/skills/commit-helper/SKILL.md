---
name: commit-helper
description: Generate a conventional commit message from staged git changes. Use when the user asks for help writing a commit message, when preparing a commit, or when discussing commit message conventions.
---

# commit-helper

Generate a conventional commit message that follows the project's commit conventions.

## When to activate

- User pastes `git diff --staged` output and asks for a commit message
- User says "write a commit message", "commit this", or similar
- User asks to format/split/reword a commit message
- User asks "what should I commit this as?"

## Output format

Always produce a single conventional commit message in this structure:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Where:
- **type**: one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `build`, `ci`
- **scope** (optional): module / package / area affected (e.g. `chat`, `settings`, `skills`, `mcp`)
- **subject**: imperative mood, lowercase, no period, ≤72 chars
- **body** (optional): wrap at 72 chars, explain WHAT and WHY (not HOW)
- **footer** (optional): `Refs:`, `Closes #N`, `BREAKING CHANGE:`, co-authors

## Steps

1. Read the diff. If empty, ask: "No staged changes. Run `git diff --staged` first?"
2. Identify the **type** from the diff content (not the file names):
   - New exports / new files → `feat`
   - Bug fix → `fix`
   - Refactor without behavior change → `refactor`
   - Test-only changes → `test`
   - Docs / comments → `docs`
3. Identify the **scope** by looking at which directory is most affected (e.g. `chat/lib/`, `shared/`, `src/main/`)
4. Write a **subject** that summarizes the diff in one line. Use imperative mood ("add", not "added").
5. Write a **body** with bullets (`-`) if there are 2+ logical changes. Keep it terse.
6. Suggest a **footer** if there are breaking changes (`BREAKING CHANGE: <desc>`) or related issues.

## Examples

**Single feature:**
```
feat(skills): add 4 ship-with-app Skills

- commit-helper, explain-error, code-review, summarize
- each ships as SKILL.md under src/resources/skills/
- electron-builder extraResources copies to ~/.agents/skills/.preinstalled/ on first launch
```

**Bug fix:**
```
fix(runtime): preserve partial streaming state on conv switch

ConversationState.messages is the single source of truth; Agent's local
copy no longer holds partial progress.
```

## Rules

- **Never** invent changes not in the diff
- **Always** preserve existing commit style (the project's `feat():` / `fix():` convention)
- **Never** include AI attribution (`Co-Authored-By: Claude`) unless user asks
- **Never** make the subject uppercase (unless proper noun in scope)
- If the diff is huge (>500 lines), propose splitting into multiple commits