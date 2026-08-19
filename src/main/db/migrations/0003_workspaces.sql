-- D8-W: workspaces moves from Settings JSON to SQLite
-- Cascade: deleting workspace CASCADE-deletes all conversations with that workspace_id

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_created_at ON workspaces(created_at DESC);
