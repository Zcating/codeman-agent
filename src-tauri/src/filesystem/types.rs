//! Filesystem types — mirror `FileMatch` TS interface in `src/shared/lib/types.ts`.
//!
//! ADR-0013: V2 file IO tools. `Option<u32>` and `Option<String>` mirror the
//! TS `number | null` / `string | null` types so the JSON round-trip at the
//! IPC boundary keeps the `null` sentinel for "no content match".

use serde::{Deserialize, Serialize};

/// One match in `search_files` results. `line_number` / `line_content` are
/// `None` when the match is purely a glob match (no content pattern provided
/// or no line matched).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileMatch {
    /// Workspace-relative forward-slash path (e.g. `"src/main.ts"`).
    pub path: String,
    /// 1-based line number of the matching line, `None` for pure glob match.
    pub line_number: Option<u32>,
    /// The matching line's content, `None` for pure glob match.
    pub line_content: Option<String>,
}
