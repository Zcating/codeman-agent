---
name: summarize
description: Summarize long content (files, articles, conversation history, diffs) into a concise structured summary. Use when the user asks for a summary, TL;DR, or overview.
---

# summarize

Produce a concise structured summary of long content. Always output in the same language as the source (default: Chinese for code comments / commit messages; English for code identifiers).

## When to activate

- User says "summarize this", "TL;DR", "give me an overview"
- User pastes a long file / conversation / article and asks for the gist
- User asks "what does this code do?" for non-trivial files
- User asks for a summary of git log / changelog

## Output format

Choose the structure that best fits the content. Common patterns:

**Code file summary:**
```
## <file path>
**Purpose**: <one line>
**Key exports**: <list>
**Notable patterns**: <list, e.g. "uses Effect.fn", "subscribes to stream">
**Caveats**: <list, if any>
```

**Conversation summary:**
```
## Summary
- <topic 1>: <key takeaway>
- <topic 2>: <key takeaway>

## Decisions
- <decision> (rationale)

## Open questions
- <question>
```

**Diff summary:**
```
## Changes
- <area>: <what changed and why>

## Risk areas
- <files with non-trivial logic changes>
```

## Length targets

- **Short content** (<100 lines): summary ≤5 lines
- **Medium content** (100-500 lines): summary ≤20 lines, focused on intent not mechanics
- **Long content** (>500 lines): 2-level summary (TL;DR + sections)

## Process

1. Read the content in full before summarizing. Don't skim.
2. Identify the **purpose** first (why does this exist? what problem does it solve?).
3. Identify **key decisions** (tradeoffs made, patterns chosen).
4. Note **non-obvious things** (gotchas, edge cases, workarounds).
5. Skip boilerplate and standard patterns unless they are the point.
6. Preserve all important IDs, names, numbers, file paths.

## What NOT to do

- Don't invent details not in the source ("this probably uses X" — only state what's verifiable)
- Don't repeat the source verbatim — paraphrase for compression
- Don't add your own opinions or recommendations (save for separate analysis)
- Don't include trivial imports / obvious code unless they reveal intent
- Don't over-summarize — if the source is 500 lines of pure logic, the summary should still be 50+ lines, not 5

## Tone

- **Neutral**: report, don't editorialize
- **Specific**: cite file paths, line numbers, function names when relevant
- **Honest about uncertainty**: if part of the source is unclear, say so ("this section's intent is ambiguous — appears to handle X but the variable naming suggests Y")