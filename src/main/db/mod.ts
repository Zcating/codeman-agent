// T4b — electron/main/db/mod.ts: better-sqlite3 connection + migration runner.
//
// Per ADR-0024 D1: schema verbatim from src-tauri/src/db/migrations/.
// Per V3 consensus 1.4: better-sqlite3 (Node 22 ABI) for V3 (Node 22.18+).
// TDD-exempt: integration-tested via e2e (T7). Unit tests are impractical for
// file I/O + native binding.

import Database, { type Database as DB } from "better-sqlite3";
import { join, dirname } from "node:path";
import { app } from "electron";
import { existsSync, readdirSync, readFileSync } from "node:fs";

let _db: DB | null = null;

function dbPath(): string {
  return join(app.getPath("userData"), "codeman-agent.db");
}

function migrationsDir(): string {
  // Migrations are bundled with main process at electron/main/db/migrations/*.sql
  // After electron-vite build: dist-electron/main/db/migrations/*.sql
  // In dev: relative to source.
  const distPath = join(__dirname, "db", "migrations");
  if (existsSync(distPath)) {return distPath;}
  return join(__dirname, "..", "..", "src", "main", "db", "migrations");
}

function applyMigrations(db: DB): void {
  // Bootstrap migration tracking table.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const dir = migrationsDir();
  if (!existsSync(dir)) {return;}
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all().map((r) => (r as { name: string }).name),
  );
  for (const f of files) {
    if (applied.has(f)) {continue;}
    const sql = readFileSync(join(dir, f), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      f,
      Date.now(),
    );
  }
}

export function initDatabase(): DB {
  if (_db) {return _db;}
  const path = dbPath();
  // Ensure parent dir exists.
  const parent = dirname(path);
  if (!existsSync(parent)) {
    require("node:fs").mkdirSync(parent, { recursive: true });
  }
  _db = new Database(path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  applyMigrations(_db);
  return _db;
}

export function getDatabase(): DB {
  if (!_db) {
    throw new Error("[db] not initialized — call initDatabase() first");
  }
  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
