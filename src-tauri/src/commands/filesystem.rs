//! 文件系统 IPC 命令（T6–T10 的骨架）。
//!
//! 真实实现在对应任务中填充。

use crate::state::AppState;
use crate::types::AppError;
use tauri::State;

#[tauri::command]
pub async fn read_file(
    _state: State<'_, AppState>,
    _workspace_id: String,
    _path: String,
) -> Result<String, AppError> {
    Err(AppError::Upstream { message: "not yet implemented".into() })
}

#[tauri::command]
pub async fn write_file(
    _state: State<'_, AppState>,
    _workspace_id: String,
    _path: String,
    _content: String,
) -> Result<(), AppError> {
    Err(AppError::Upstream { message: "not yet implemented".into() })
}

#[tauri::command]
pub async fn edit_file(
    _state: State<'_, AppState>,
    _workspace_id: String,
    _path: String,
    _old_text: String,
    _new_text: String,
    _replace_all: bool,
) -> Result<(), AppError> {
    Err(AppError::Upstream { message: "not yet implemented".into() })
}

#[tauri::command]
pub async fn search_files(
    _state: State<'_, AppState>,
    _workspace_id: String,
    _glob: String,
    _content_pattern: Option<String>,
) -> Result<Vec<crate::filesystem::types::FileMatch>, AppError> {
    Err(AppError::Upstream { message: "not yet implemented".into() })
}

#[tauri::command]
pub async fn delete_file(
    _state: State<'_, AppState>,
    _workspace_id: String,
    _path: String,
) -> Result<(), AppError> {
    Err(AppError::Upstream { message: "not yet implemented".into() })
}
