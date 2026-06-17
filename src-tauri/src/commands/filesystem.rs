//! 文件系统 IPC 命令（T6–T10）。
//!
//! T6: read_file — 已实现
//! T7-T10: 骨架（待实现）

use crate::filesystem::sandbox::validate_path_in_workspace;
use crate::settings::Settings;
use crate::state::AppState;
use crate::types::AppError;
use std::path::Path;
use tauri::State;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

/// Pure logic for read_file. Testable without AppState.
pub(crate) fn read_file_impl(
    settings: &Settings,
    workspace_id: &str,
    path: &str,
) -> Result<String, AppError> {
    // 1. Find workspace
    let workspace = settings
        .workspaces
        .iter()
        .find(|w| w.id == workspace_id)
        .ok_or_else(|| AppError::NotFound {
            message: format!("Workspace not found: {}", workspace_id),
        })?;

    // 2. Check enabled
    if !workspace.enabled {
        return Err(AppError::InvalidConfig {
            message: "Workspace disabled".into(),
        });
    }

    // 3. Check file exists first (NotFound), before sandbox check.
    //    Using metadata() instead of canonicalize() so non-existent files
    //    return NotFound rather than SandboxViolation.
    let absolute_path = if Path::new(path).is_absolute() {
        Path::new(path).to_path_buf()
    } else {
        workspace.root_path.join(path)
    };
    std::fs::metadata(&absolute_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::NotFound {
                message: format!("File not found: {}", path),
            }
        } else {
            AppError::Upstream { message: e.to_string() }
        }
    })?;

    // 4. Sandbox check (resolves symlinks + checks containment)
    let canonical_path =
        validate_path_in_workspace(Path::new(path), &workspace.root_path)?;

    // 5. Size check
    let metadata =
        std::fs::metadata(&canonical_path).map_err(|e| AppError::Upstream {
            message: e.to_string(),
        })?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(AppError::Upstream {
            message: format!("File exceeds maximum size (10 MB): {}", path),
        });
    }

    // 6. Read (UTF-8 only)
    std::fs::read_to_string(&canonical_path).map_err(|_| AppError::Upstream {
        message: format!("Non-UTF-8 or binary file: {}", path),
    })
}

#[tauri::command]
pub async fn read_file(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
) -> Result<String, AppError> {
    let settings = state.get_settings();
    read_file_impl(&settings, &workspace_id, &path)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Settings, Workspace};
    use tempfile::TempDir;

    fn make_settings(workspace_id: &str, root: &std::path::Path, enabled: bool) -> Settings {
        Settings {
            workspaces: vec![Workspace {
                id: workspace_id.into(),
                label: "test".into(),
                root_path: root.to_path_buf(),
                enabled,
            }],
            ..Settings::default()
        }
    }

    #[test]
    fn read_file_happy_path() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("hello.txt");
        std::fs::write(&file_path, "hello world").unwrap();

        let settings = make_settings("ws1", tempdir.path(), true);
        // Use absolute path so sandbox canonicalization finds the file inside workspace
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = read_file_impl(&settings, "ws1", &absolute_path);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), "hello world");
    }

    #[test]
    fn read_file_sandbox_violation() {
        let tempdir_a = TempDir::new().unwrap();
        let tempdir_b = TempDir::new().unwrap();
        let outside_file = tempdir_b.path().join("secret.txt");
        std::fs::write(&outside_file, "secret").unwrap();

        let settings = make_settings("ws1", tempdir_a.path(), true);
        let absolute_outside_path = outside_file.to_string_lossy().to_string();

        let result = read_file_impl(&settings, "ws1", &absolute_outside_path);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
    }

    #[test]
    fn read_file_too_large() {
        let tempdir = TempDir::new().unwrap();
        let big_file = tempdir.path().join("big.bin");
        let content: Vec<u8> = vec![b'a'; 11 * 1024 * 1024];
        std::fs::write(&big_file, content).unwrap();

        let settings = make_settings("ws1", tempdir.path(), true);
        let absolute_path = big_file.to_string_lossy().to_string();

        let result = read_file_impl(&settings, "ws1", &absolute_path);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message.contains("exceeds maximum size")),
            "Expected Upstream with size error, got {:?}",
            err
        );
    }

    #[test]
    fn read_file_not_found() {
        let tempdir = TempDir::new().unwrap();
        let settings = make_settings("ws1", tempdir.path(), true);

        let result = read_file_impl(&settings, "ws1", "nonexistent.txt");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::NotFound { .. }));
    }

    #[test]
    fn read_file_disabled_workspace() {
        let tempdir = TempDir::new().unwrap();
        let settings = make_settings("ws1", tempdir.path(), false);

        let result = read_file_impl(&settings, "ws1", "any.txt");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::InvalidConfig { .. }));
    }
}
