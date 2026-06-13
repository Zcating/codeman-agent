//! Database layer – SQLite + FTS5.
//
//! Schema lives in `schema.sql`; migrations live in `migrations/`.
//! Sub-modules mirror the schema tables.

pub mod conversations;
pub mod messages;
