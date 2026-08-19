CREATE TABLE automation_executions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  final_text TEXT,
  exit_code INTEGER,
  stderr TEXT,
  error TEXT,
  metadata_json TEXT
);
CREATE INDEX idx_automation_executions_rule_started ON automation_executions (rule_id, started_at DESC);
CREATE INDEX idx_automation_executions_status ON automation_executions (status, started_at DESC);
