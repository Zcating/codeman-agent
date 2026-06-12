# ADR 0004 — SQLite + FTS5 for conversation persistence

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 storage layer
- Related: ADR 0003 (Effect-TS store layer)

## Context

V1 introduces persistent conversations with full-text search
across all of a user's history. The old V0 kept no history
beyond a single active snapshot. We need a storage substrate
that supports linear message storage, fast full-text search,
migrations across releases, and stays inside the Rust
process (so secrets never leak and TS code does not depend
on a third-party DB service).

## Decision

Persist conversations and messages in **SQLite** owned by the
Rust process, accessed from TypeScript through Tauri IPC
commands. Search uses **SQLite FTS5** with content mirrored
from the `messages` table. Rust uses `sqlx` (compile-time
checked queries, async-friendly, no extra build step) and
ships a `schema.sql` plus numbered migration files.

## Schema (V1, "D1" shape)

```sql
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,        -- uuid
  title           TEXT NOT NULL,           -- auto from first user msg, ≤40 chars
  system_prompt   TEXT,                    -- NULL = use global default
  created_at      INTEGER NOT NULL,        -- unix epoch seconds
  updated_at      INTEGER NOT NULL,
  archived_at     INTEGER                  -- NULL = active
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,           -- 'user' | 'assistant' | 'tool' | 'system'
  content         TEXT NOT NULL,
  tool_calls      TEXT,                    -- JSON: [{name, args, id}]
  tool_results    TEXT,                    -- JSON: [{tool_call_id, result, error}]
  model           TEXT,                    -- which LLM produced this
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_messages_conv_created
  ON messages(conversation_id, created_at);

CREATE VIRTUAL TABLE messages_fts USING fts5(
  content, content='messages', content_rowid='rowid'
);
```

## Considered options

- **P1 (chosen) — SQLite + FTS5 in Rust.** Standard, fast,
  full-text search out of the box, easy migrations, Rust
  process owns the data.
- **P2 — per-conversation JSON files.** Rejected. Search is
  O(n) over files; migrations are manual; backups are
  per-file. Pointless complexity.
- **P3 — IndexedDB in the webview.** Rejected. Breaks the
  "Rust owns secrets and storage" boundary; data cannot
  survive a webview reset; doesn't help Rust-side tool
  implementations that might want to query history.
- **P4 — Tauri Store JSON single file.** Rejected. Doesn't
  scale past a few hundred messages; full-text search is
  manual.

## Consequences

- `Cargo.toml` adds `sqlx` with `sqlite`, `runtime-tokio`,
  `chrono`, `uuid` features. Lock these to a specific minor
  version; sqlx breaks between minors.
- Tauri IPC gains ~7–10 new commands: `list_conversations`,
  `get_conversation`, `create_conversation`,
  `append_message`, `list_messages`, `delete_conversation`,
  `archive_conversation`, `search_conversations`, plus
  `clear_all_history` (a destructive action, not a query).
- Schema evolves via numbered migration files in
  `src-tauri/src/db/migrations/`. The Rust side runs them on
  startup; we never edit `schema.sql` in place after V1.
- V1 does **not** migrate the old V0 `settings.json`. On
  first launch of V1, V0 settings are simply ignored; the
  user starts fresh. (See ADR 0005 for the product
  framing.)
- Soft delete: deleting a conversation sets `archived_at`;
  a daily background job hard-deletes anything archived
  longer than `conversations.auto_archive_after_days`
  (default 30).
- `max_history` (default 1000) caps the total number of
  *non-archived* conversations. When exceeded, the oldest
  non-archived is auto-archived; if that pushes the archived
  count over a 1500 hard cap, the oldest archived is
  hard-deleted.

## References

- SQLite FTS5: https://www.sqlite.org/fts5.html
- sqlx: https://github.com/launchbadge/sqlx
