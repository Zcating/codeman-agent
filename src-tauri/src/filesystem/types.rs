//! Filesystem 域类型。供 T6–T10 IPC 命令与前端共用。
//!
//! 项目词汇表见 `CONTEXT.md`；此处名称刻意与该文档一致。

use serde::{Deserialize, Serialize};

/// 单条文件搜索命中。
///
/// 由 `search_files` IPC 命令返回给前端：
/// - `path` 始终使用 forward-slash 相对路径（与 glob 模式语义一致）
/// - `line_number = 0` 表示仅文件名命中（无内容模式）
/// - `line_number >= 1` 表示内容模式命中行号（1-indexed）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileMatch {
    /// 相对 workspace 根的路径，forward-slash 分隔。
    pub path: String,
    /// 命中的行号（1-indexed）；文件名命中时为 0。
    pub line_number: u32,
    /// 命中的行内容；文件名命中时为空字符串。
    pub line_content: String,
}
