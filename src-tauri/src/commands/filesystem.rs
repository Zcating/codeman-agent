//! 文件系统 IPC 命令（T6–T10）。
//!
//! T6: read_file — 已实现
//! T7-T10: 骨架（待实现）

use log;
use crate::db::workspaces;
use crate::filesystem::sandbox::validate_path_in_workspace;
use crate::types::AppError;
use std::path::Path;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

/// Pure logic for read_file. Testable without AppState.
pub(crate) fn read_file_impl(
    workspace: &workspaces::Workspace,
    path: &str,
) -> Result<String, AppError> {
    let root = Path::new(&workspace.root_path);

    // 1. Check file exists first (NotFound), before sandbox check.
    //    Using metadata() instead of canonicalize() so non-existent files
    //    return NotFound rather than SandboxViolation.
    let absolute_path = if Path::new(path).is_absolute() {
        Path::new(path).to_path_buf()
    } else {
        root.join(path)
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
        validate_path_in_workspace(Path::new(path), root)?;

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

#[tauri::command(rename_all = "camelCase")]
pub async fn read_file(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    workspace_id: String,
    path: String,
) -> Result<String, AppError> {
    log::debug!("read_file: 进入 workspace_id={} path={}", workspace_id, path);
    let workspace = workspaces::get_workspace_by_id(pool.inner(), &workspace_id)
        .await
        .map_err(|e| {
            log::error!("read_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::from(e)
        })?
        .ok_or_else(|| {
            log::warn!("read_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::NotFound {
                message: format!("Workspace not found: {}", workspace_id),
            }
        })?;
    let result = read_file_impl(&workspace, &path);
    match &result {
        Ok(_) => {
            log::info!("read_file: 成功 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::SandboxViolation { .. }) => {
            log::warn!("read_file: 越界 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::NotFound { .. }) => {
            log::warn!("read_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::InvalidConfig { .. }) => {
            log::warn!("read_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(_) => {
            log::error!("read_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
    }
    result
}

/// Pure logic for write_file. Testable without AppState.
pub(crate) fn write_file_impl(
    workspace: &workspaces::Workspace,
    path: &str,
    content: &str,
) -> Result<(), AppError> {
    let root = Path::new(&workspace.root_path);

    // 1. Check blocked extensions BEFORE sandbox
    let path_lower = path.to_lowercase();
    let blocked = ["exe", "dll", "sys", "ini"];
    if let Some(last) = path_lower.rsplit('/').next() {
        if let Some(ext) = last.rsplit('.').next() {
            if blocked.contains(&ext) {
                return Err(AppError::Upstream {
                    message: format!("Blocked file type: .{}", ext),
                });
            }
        }
    }

    // 4. Sandbox check — handle non-existent target paths (write case)
    // Canonicalize workspace root (always exists), then:
    // - For relative paths: use starts_with on the joined path (no re-canonicalize needed)
    // - For absolute paths: use the same sandbox validate_path_in_workspace
    let canonical_root = std::fs::canonicalize(root).map_err(|e| {
        AppError::Upstream {
            message: format!("Cannot canonicalize workspace root: {}", e),
        }
    })?;

    let path_lower = path.to_lowercase();

    // Reject \\?\ prefix and NTFS streams (before any path operations)
    if path_lower.starts_with(r"\\?\") {
        return Err(AppError::SandboxViolation {
            path: path.into(),
            workspace_label: workspace.label.clone(),
        });
    }
    if path_lower.contains("::data") {
        return Err(AppError::SandboxViolation {
            path: path.into(),
            workspace_label: workspace.label.clone(),
        });
    }

    // Determine the target path for validation and for the atomic write operation
    // For relative paths: use starts_with on the joined path (Path::starts_with handles
    // short/long path name mismatches on Windows). The parent must exist.
    // For absolute paths: use validate_path_in_workspace (requires file to exist).
    let absolute_target: std::path::PathBuf =
        if Path::new(path).is_absolute() {
            // Absolute path: canonicalize and validate via sandbox
            let canonical = validate_path_in_workspace(Path::new(path), root)?;
            // Use the canonical path for the atomic write
            canonical
        } else {
            // Relative path: join with canonical workspace root, check prefix
            let joined = canonical_root.join(path);

            // Path::starts_with handles short/long path name mismatches on Windows
            if !joined.starts_with(&canonical_root) {
                return Err(AppError::SandboxViolation {
                    path: path.into(),
                    workspace_label: workspace.label.clone(),
                });
            }

            // Ensure parent directory exists (required for writes)
            let parent = joined.parent().ok_or_else(|| AppError::Upstream {
                message: format!("Invalid path (no parent): {}", path),
            })?;
            if !parent.exists() {
                return Err(AppError::Upstream {
                    message: format!("Parent directory does not exist: {}", parent.display()),
                });
            }

            joined
        };

    // 5. Size check
    let content_bytes = content.as_bytes();
    if content_bytes.len() > MAX_FILE_SIZE as usize {
        return Err(AppError::Upstream {
            message: "Content exceeds maximum size (10 MB)".into(),
        });
    }

    // 6. Atomic write: temp file in same directory + rename
    let parent = absolute_target.parent().ok_or_else(|| AppError::Upstream {
        message: format!("Invalid path (no parent): {}", path),
    })?;
    let temp_filename = format!(
        "{}.tmp.{}.{}",
        absolute_target.file_name().unwrap_or_default().to_string_lossy(),
        uuid::Uuid::new_v4(),
        std::process::id()
    );
    let temp_path = parent.join(&temp_filename);

    std::fs::write(&temp_path, content_bytes).map_err(|e| AppError::Upstream {
        message: format!("Failed to write temp file: {}", e),
    })?;

    // Rename to target; on failure, remove temp file and propagate error
    if let Err(rename_err) = std::fs::rename(&temp_path, &absolute_target) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(AppError::Upstream {
            message: format!("Failed to rename temp file to target: {}", rename_err),
        });
    }

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn write_file(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    workspace_id: String,
    path: String,
    content: String,
) -> Result<(), AppError> {
    log::debug!("write_file: 进入 workspace_id={} path={}", workspace_id, path);
    let workspace = workspaces::get_workspace_by_id(pool.inner(), &workspace_id)
        .await
        .map_err(|e| {
            log::error!("write_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::from(e)
        })?
        .ok_or_else(|| {
            log::warn!("write_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::NotFound {
                message: format!("Workspace not found: {}", workspace_id),
            }
        })?;
    let result = write_file_impl(&workspace, &path, &content);
    match &result {
        Ok(_) => {
            log::info!("write_file: 成功 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::SandboxViolation { .. }) => {
            log::warn!("write_file: 越界 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::NotFound { .. }) => {
            log::warn!("write_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::InvalidConfig { .. }) => {
            log::warn!("write_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(_) => {
            log::error!("write_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
    }
    result
}

/// Pure logic for edit_file. Testable without AppState.
pub(crate) fn edit_file_impl(
    workspace: &workspaces::Workspace,
    path: &str,
    old_text: &str,
    new_text: &str,
    replace_all: bool,
) -> Result<(), AppError> {
    let root = Path::new(&workspace.root_path);

    // 1. Check blocked extensions BEFORE sandbox
    let path_lower = path.to_lowercase();
    let blocked = ["exe", "dll", "sys", "ini"];
    if let Some(last) = path_lower.rsplit('/').next() {
        if let Some(ext) = last.rsplit('.').next() {
            if blocked.contains(&ext) {
                return Err(AppError::Upstream {
                    message: format!("Blocked file type: .{}", ext),
                });
            }
        }
    }

    // 2. Canonicalize workspace root
    let canonical_root = std::fs::canonicalize(root).map_err(|e| {
        AppError::Upstream {
            message: format!("Cannot canonicalize workspace root: {}", e),
        }
    })?;

    // 5. Determine absolute target path and validate sandbox
    let absolute_target: std::path::PathBuf = if Path::new(path).is_absolute() {
        let canonical = validate_path_in_workspace(Path::new(path), root)?;
        canonical
    } else {
        let joined = canonical_root.join(path);
        if !joined.starts_with(&canonical_root) {
            return Err(AppError::SandboxViolation {
                path: path.into(),
                workspace_label: workspace.label.clone(),
            });
        }
        joined
    };

    // 6. File must exist (NotFound if missing)
    std::fs::metadata(&absolute_target).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::NotFound {
                message: format!("File not found: {}", path),
            }
        } else {
            AppError::Upstream { message: e.to_string() }
        }
    })?;

    // 7. Canonicalize for read/write operations
    let canonical_path =
        std::fs::canonicalize(&absolute_target).map_err(|e| AppError::Upstream {
            message: e.to_string(),
        })?;

    // 8. Size check (10 MB cap)
    let metadata =
        std::fs::metadata(&canonical_path).map_err(|e| AppError::Upstream {
            message: e.to_string(),
        })?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(AppError::Upstream {
            message: format!("File exceeds maximum size (10 MB): {}", path),
        });
    }

    // 9. Read current content
    let content =
        std::fs::read_to_string(&canonical_path).map_err(|_| AppError::Upstream {
            message: format!("Non-UTF-8 or binary file: {}", path),
        })?;

    // 10. Count occurrences
    let count = content.matches(old_text).count();

    // 11. Apply replacement logic
    let new_content = if replace_all {
        if count == 0 {
            return Err(AppError::Upstream {
                message: "old_text not found".into(),
            });
        }
        content.replace(old_text, new_text)
    } else {
        if count == 0 {
            return Err(AppError::Upstream {
                message: "old_text not found".into(),
            });
        }
        if count > 1 {
            return Err(AppError::Upstream {
                message: format!("old_text must match exactly once (got {})", count),
            });
        }
        content.replacen(old_text, new_text, 1)
    };

    // 12. Atomic write: temp file in same directory + rename
    let parent = absolute_target.parent().ok_or_else(|| AppError::Upstream {
        message: format!("Invalid path (no parent): {}", path),
    })?;
    let temp_filename = format!(
        "{}.tmp.{}.{}",
        absolute_target.file_name().unwrap_or_default().to_string_lossy(),
        uuid::Uuid::new_v4(),
        std::process::id()
    );
    let temp_path = parent.join(&temp_filename);

    std::fs::write(&temp_path, new_content.as_bytes()).map_err(|e| {
        AppError::Upstream {
            message: format!("Failed to write temp file: {}", e),
        }
    })?;

    if let Err(rename_err) = std::fs::rename(&temp_path, &absolute_target) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(AppError::Upstream {
            message: format!("Failed to rename temp file to target: {}", rename_err),
        });
    }

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn edit_file(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    workspace_id: String,
    path: String,
    old_text: String,
    new_text: String,
    replace_all: bool,
) -> Result<(), AppError> {
    log::debug!("edit_file: 进入 workspace_id={} path={}", workspace_id, path);
    let workspace = workspaces::get_workspace_by_id(pool.inner(), &workspace_id)
        .await
        .map_err(|e| {
            log::error!("edit_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::from(e)
        })?
        .ok_or_else(|| {
            log::warn!("edit_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::NotFound {
                message: format!("Workspace not found: {}", workspace_id),
            }
        })?;
    let result = edit_file_impl(&workspace, &path, &old_text, &new_text, replace_all);
    match &result {
        Ok(_) => {
            log::info!("edit_file: 成功 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::SandboxViolation { .. }) => {
            log::warn!("edit_file: 越界 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::NotFound { .. }) => {
            log::warn!("edit_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::InvalidConfig { .. }) => {
            log::warn!("edit_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(_) => {
            log::error!("edit_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
    }
    result
}

/// Pure logic for search_files. Testable without AppState.
pub(crate) fn search_files_impl(
    workspace: &workspaces::Workspace,
    glob_pattern: &str,
    content_pattern: Option<&str>,
) -> Result<Vec<crate::filesystem::types::FileMatch>, AppError> {
    let root = Path::new(&workspace.root_path);

    // 1. Validate workspace root exists (sanity check via sandbox)
    let _canonical_root =
        validate_path_in_workspace(root, root)
            .map_err(|_| AppError::SandboxViolation {
                path: Path::new(&workspace.root_path).display().to_string(),
                workspace_label: workspace.label.clone(),
            })?;

    // 4. Build glob matcher
    // globset Glob requires ** for recursive matching; we add ** prefix if not present
    // so that "*.txt" behaves as "**/*.txt" (matches subdirectories)
    let effective_pattern = if glob_pattern.contains("**") || glob_pattern.starts_with("**") {
        glob_pattern.to_string()
    } else {
        format!("**/{}", glob_pattern)
    };
    let matcher = globset::GlobSetBuilder::new()
        .add(globset::Glob::new(&effective_pattern).map_err(|e| AppError::InvalidConfig {
            message: format!("Invalid glob pattern '{}': {}", glob_pattern, e),
        })?)
        .build()
        .map_err(|e| AppError::InvalidConfig {
            message: format!("Invalid glob pattern '{}': {}", glob_pattern, e),
        })?;

    let workspace_root = &workspace.root_path;
    let mut results: Vec<crate::filesystem::types::FileMatch> = Vec::new();

    // 5. Walk workspace
    // min_depth(1) skips the root dir itself (important: tempdirs start with .tmp)
    // filter_entry skips hidden/node_modules/.git subdirectories during descent
    let walker = walkdir::WalkDir::new(workspace_root)
        .follow_links(false)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !is_skipped(e));

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }

        let entry_path = entry.path();

        // Compute relative path from workspace root
        let relative_path = match entry_path.strip_prefix(workspace_root) {
            Ok(rel) => rel,
            Err(_) => continue,
        };

        // Normalize to forward slashes for glob matching (globset uses / as separator)
        let match_path = relative_path
            .to_string_lossy()
            .replace('\\', "/");

        // Check glob match
        if !matcher.is_match(&match_path) {
            continue;
        }

        // If no content pattern, add with no line info
        let content_pattern = match content_pattern {
            None => {
                results.push(crate::filesystem::types::FileMatch {
                    path: match_path,
                    line_number: None,
                    line_content: None,
                });
                continue;
            }
            Some(pat) => pat,
        };

        // Content search: read file, find matching lines
        let metadata = match std::fs::metadata(entry_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Skip files > 10 MB
        if metadata.len() > MAX_FILE_SIZE {
            continue;
        }

        let file_content = match std::fs::read_to_string(entry_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut found = false;
        for (line_idx, line) in file_content.lines().enumerate() {
            if line.contains(content_pattern) {
                results.push(crate::filesystem::types::FileMatch {
                    path: match_path.clone(),
                    line_number: Some((line_idx + 1) as u32),
                    line_content: Some(line.to_string()),
                });
                found = true;
                break; // only first matching line per file
            }
        }
        if found {
            continue;
        }
    }

    // Cap at 100 results
    results.truncate(100);

    Ok(results)
}

fn is_skipped(entry: &walkdir::DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with('.') || s == "node_modules" || s == ".git")
        .unwrap_or(false)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn search_files(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    workspace_id: String,
    glob: String,
    content_pattern: Option<String>,
) -> Result<Vec<crate::filesystem::types::FileMatch>, AppError> {
    log::debug!("search_files: 进入 workspace_id={} glob={}", workspace_id, glob);
    let workspace = workspaces::get_workspace_by_id(pool.inner(), &workspace_id)
        .await
        .map_err(|e| {
            log::error!("search_files: 失败 workspace_id={} glob={}", workspace_id, glob);
            AppError::from(e)
        })?
        .ok_or_else(|| {
            log::warn!("search_files: 失败 workspace_id={} glob={}", workspace_id, glob);
            AppError::NotFound {
                message: format!("Workspace not found: {}", workspace_id),
            }
        })?;
    let result = search_files_impl(&workspace, &glob, content_pattern.as_deref());
    match &result {
        Ok(matches) => {
            log::info!("search_files: 成功 workspace_id={} glob={} count={}", workspace_id, glob, matches.len());
        }
        Err(AppError::SandboxViolation { .. }) => {
            log::warn!("search_files: 越界 workspace_id={} glob={}", workspace_id, glob);
        }
        Err(AppError::NotFound { .. }) => {
            log::warn!("search_files: 失败 workspace_id={} glob={}", workspace_id, glob);
        }
        Err(AppError::InvalidConfig { .. }) => {
            log::warn!("search_files: 失败 workspace_id={} glob={}", workspace_id, glob);
        }
        Err(_) => {
            log::error!("search_files: 失败 workspace_id={} glob={}", workspace_id, glob);
        }
    }
    result
}

/// Pure logic for delete_file. Testable without AppState.
pub(crate) fn delete_file_impl(
    workspace: &workspaces::Workspace,
    path: &str,
) -> Result<(), AppError> {
    let root = Path::new(&workspace.root_path);

    // 1. Check blocked extensions
    let path_lower = path.to_lowercase();
    let blocked = ["exe", "dll", "sys", "ini"];
    if let Some(last) = path_lower.rsplit('/').next() {
        if let Some(ext) = last.rsplit('.').next() {
            if blocked.contains(&ext) {
                return Err(AppError::Upstream {
                    message: format!("Blocked file type: .{}", ext),
                });
            }
        }
    }

    // 2. Sandbox check — canonicalize and verify containment
    let canonical_path =
        validate_path_in_workspace(Path::new(path), root)?;

    // 5. Reject directory (V2: file-only)
    let metadata = std::fs::metadata(&canonical_path).map_err(|e| {
        AppError::Upstream { message: e.to_string() }
    })?;
    if metadata.is_dir() {
        return Err(AppError::Upstream {
            message: "Path is a directory, not a file".into(),
        });
    }

    // 6. Move to recycle bin
    trash::delete(&canonical_path).map_err(|e| {
        AppError::Upstream {
            message: format!("Failed to move to recycle bin: {}", e),
        }
    })?;

    // 7. Sanity check: file should no longer exist at canonical path
    if canonical_path.exists() {
        return Err(AppError::Upstream {
            message: "Trash succeeded but file still exists".into(),
        });
    }

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_file(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    log::debug!("delete_file: 进入 workspace_id={} path={}", workspace_id, path);
    let workspace = workspaces::get_workspace_by_id(pool.inner(), &workspace_id)
        .await
        .map_err(|e| {
            log::error!("delete_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::from(e)
        })?
        .ok_or_else(|| {
            log::warn!("delete_file: 失败 workspace_id={} path={}", workspace_id, path);
            AppError::NotFound {
                message: format!("Workspace not found: {}", workspace_id),
            }
        })?;
    let result = delete_file_impl(&workspace, &path);
    match &result {
        Ok(_) => {
            log::info!("delete_file: 成功 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::SandboxViolation { .. }) => {
            log::warn!("delete_file: 越界 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::NotFound { .. }) => {
            log::warn!("delete_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(AppError::InvalidConfig { .. }) => {
            log::warn!("delete_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
        Err(_) => {
            log::error!("delete_file: 失败 workspace_id={} path={}", workspace_id, path);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::workspaces;
    use tempfile::TempDir;

    fn make_workspace(id: &str, root: &std::path::Path) -> workspaces::Workspace {
        workspaces::Workspace {
            id: id.into(),
            label: "test".into(),
            root_path: root.to_string_lossy().to_string(),
            created_at: 0,
        }
    }

    #[test]
    fn read_file_happy_path() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("hello.txt");
        std::fs::write(&file_path, "hello world").unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        // Use absolute path so sandbox canonicalization finds the file inside workspace
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = read_file_impl(&ws, &absolute_path);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), "hello world");
    }

    #[test]
    fn read_file_sandbox_violation() {
        let tempdir_a = TempDir::new().unwrap();
        let tempdir_b = TempDir::new().unwrap();
        let outside_file = tempdir_b.path().join("secret.txt");
        std::fs::write(&outside_file, "secret").unwrap();

        let ws = make_workspace("ws1", tempdir_a.path());
        let absolute_outside_path = outside_file.to_string_lossy().to_string();

        let result = read_file_impl(&ws, &absolute_outside_path);

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

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = big_file.to_string_lossy().to_string();

        let result = read_file_impl(&ws, &absolute_path);

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
        let ws = make_workspace("ws1", tempdir.path());

        let result = read_file_impl(&ws, "nonexistent.txt");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::NotFound { .. }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // write_file tests
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn write_file_happy_path() {
        let tempdir = TempDir::new().unwrap();
        let ws = make_workspace("ws1", tempdir.path());
        // Use relative path so sandbox canonicalizes to a path inside workspace
        let relative_path = "out.txt";

        let result = write_file_impl(&ws, relative_path, "new content");

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let file_path = tempdir.path().join("out.txt");
        let read_back = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(read_back, "new content");

        // No leftover *.tmp.* files
        let entries: Vec<_> = std::fs::read_dir(tempdir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.contains(".tmp."))
            .collect();
        assert!(entries.is_empty(), "Leftover temp files: {:?}", entries);
    }

    #[test]
    fn write_file_sandbox_violation() {
        let tempdir_a = TempDir::new().unwrap();
        let tempdir_b = TempDir::new().unwrap();
        let outside_file = tempdir_b.path().join("target.txt");
        std::fs::write(&outside_file, "secret").unwrap();

        let ws = make_workspace("ws1", tempdir_a.path());
        let absolute_outside_path = outside_file.to_string_lossy().to_string();

        let result = write_file_impl(&ws, &absolute_outside_path, "content");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
        // File content must NOT be modified (sandbox blocked the write)
        let content = std::fs::read_to_string(&outside_file).unwrap();
        assert_eq!(content, "secret", "Sandbox should have blocked the write");
    }

    #[test]
    fn write_file_content_too_large() {
        let tempdir = TempDir::new().unwrap();
        let ws = make_workspace("ws1", tempdir.path());
        let relative_path = "big.txt";
        let content: Vec<u8> = vec![b'a'; 11 * 1024 * 1024];

        let result = write_file_impl(&ws, relative_path, &String::from_utf8_lossy(&content));

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message.contains("exceeds maximum size")),
            "Expected Upstream with size error, got {:?}",
            err
        );
        let file_path = tempdir.path().join("big.txt");
        assert!(!file_path.exists(), "File should not be created");
    }

    #[test]
    fn write_file_blocked_extension() {
        let tempdir = TempDir::new().unwrap();
        let ws = make_workspace("ws1", tempdir.path());

        let result = write_file_impl(&ws, "malware.exe", "MZ...");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message.contains("Blocked file type: .exe")),
            "Expected Upstream blocked extension error, got {:?}",
            err
        );
        let file_path = tempdir.path().join("malware.exe");
        assert!(!file_path.exists(), "File should not be created");
    }

    #[test]
    fn write_file_atomic_rollback() {
        let tempdir = TempDir::new().unwrap();
        let target_path = tempdir.path().join("target.txt");
        // Make target a directory so rename fails
        std::fs::create_dir(&target_path).unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let relative_path = "target.txt";

        let result = write_file_impl(&ws, relative_path, "content");

        assert!(result.is_err(), "Expected Err due to rename failure, got {:?}", result);

        // No leftover temp files
        let entries: Vec<_> = std::fs::read_dir(tempdir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.contains(".tmp."))
            .collect();
        assert!(entries.is_empty(), "Leftover temp files after rollback: {:?}", entries);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // edit_file tests
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn edit_file_unique_replace() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("target.txt");
        std::fs::write(&file_path, "foo bar").unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = edit_file_impl(&ws, &absolute_path, "foo", "baz", false);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "baz bar");
    }

    #[test]
    fn edit_file_zero_matches_errors() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("target.txt");
        std::fs::write(&file_path, "hello").unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = edit_file_impl(&ws, &absolute_path, "xyz", "abc", false);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message == "old_text not found"),
            "Expected Upstream 'old_text not found', got {:?}",
            err
        );
        // File unchanged
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "hello");
    }

    #[test]
    fn edit_file_multiple_matches_errors() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("target.txt");
        std::fs::write(&file_path, "foo foo foo").unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = edit_file_impl(&ws, &absolute_path, "foo", "baz", false);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message == "old_text must match exactly once (got 3)"),
            "Expected Upstream 'old_text must match exactly once (got 3)', got {:?}",
            err
        );
        // File unchanged
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "foo foo foo");
    }

    #[test]
    fn edit_file_replace_all() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("target.txt");
        std::fs::write(&file_path, "foo foo foo").unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = edit_file_impl(&ws, &absolute_path, "foo", "baz", true);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "baz baz baz");
    }

    #[test]
    fn edit_file_sandbox_violation() {
        let tempdir_a = TempDir::new().unwrap();
        let tempdir_b = TempDir::new().unwrap();
        let outside_file = tempdir_b.path().join("target.txt");
        std::fs::write(&outside_file, "hello").unwrap();

        let ws = make_workspace("ws1", tempdir_a.path());
        let absolute_outside_path = outside_file.to_string_lossy().to_string();

        let result = edit_file_impl(&ws, &absolute_outside_path, "hello", "bye", false);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
        // File unchanged
        let content = std::fs::read_to_string(&outside_file).unwrap();
        assert_eq!(content, "hello");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // search_files tests
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn search_files_glob_match() {
        let tempdir = TempDir::new().unwrap();
        std::fs::write(tempdir.path().join("a.txt"), "hello").unwrap();
        std::fs::write(tempdir.path().join("b.md"), "world").unwrap();
        std::fs::create_dir(tempdir.path().join("sub")).unwrap();
        std::fs::write(tempdir.path().join("sub/c.txt"), "nested").unwrap();

        let ws = make_workspace("ws1", tempdir.path());

        let result = search_files_impl(&ws, "*.txt", None);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let matches = result.unwrap();
        let paths: Vec<_> = matches.iter().map(|m| m.path.as_str()).collect();
        assert!(
            paths.contains(&"a.txt") && paths.contains(&"sub/c.txt"),
            "Expected a.txt and sub/c.txt, got {:?}",
            paths
        );
        assert!(!paths.contains(&"b.md"), "b.md should not match *.txt");
    }

    #[test]
    fn search_files_content_match() {
        let tempdir = TempDir::new().unwrap();
        std::fs::write(tempdir.path().join("a.txt"), "TODO: fix\nOK").unwrap();
        std::fs::write(tempdir.path().join("b.md"), "no issue").unwrap();

        let ws = make_workspace("ws1", tempdir.path());

        let result = search_files_impl(&ws, "*", Some("TODO"));

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let matches = result.unwrap();
        assert_eq!(matches.len(), 1, "Expected 1 match, got {:?}", matches);
        let m = &matches[0];
        assert_eq!(m.path, "a.txt");
        assert_eq!(m.line_number, Some(1));
        assert_eq!(m.line_content.as_deref(), Some("TODO: fix"));
    }

    #[test]
    fn search_files_combined() {
        let tempdir = TempDir::new().unwrap();
        std::fs::write(tempdir.path().join("a.ts"), "TODO: fix bug").unwrap();
        std::fs::write(tempdir.path().join("b.ts"), "no issue").unwrap();
        std::fs::write(tempdir.path().join("c.rs"), "TODO: elsewhere").unwrap();

        let ws = make_workspace("ws1", tempdir.path());

        let result = search_files_impl(&ws, "*.ts", Some("TODO"));

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let matches = result.unwrap();
        assert_eq!(matches.len(), 1, "Expected 1 match, got {:?}", matches);
        assert_eq!(matches[0].path, "a.ts");
        assert_eq!(matches[0].line_content.as_deref(), Some("TODO: fix bug"));
    }

    #[test]
    fn search_files_no_matches() {
        let tempdir = TempDir::new().unwrap();
        std::fs::write(tempdir.path().join("a.txt"), "hello").unwrap();
        std::fs::write(tempdir.path().join("b.md"), "world").unwrap();

        let ws = make_workspace("ws1", tempdir.path());

        let result = search_files_impl(&ws, "*.json", None);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        let matches = result.unwrap();
        assert!(matches.is_empty(), "Expected empty, got {:?}", matches);
    }

    #[test]
    fn search_files_sandbox_violation() {
        // Workspace root does not exist — canonicalize fails → SandboxViolation
        let tempdir = TempDir::new().unwrap();
        let nonexistent = tempdir.path().join("does_not_exist");

        let ws = make_workspace("ws1", &nonexistent);

        let result = search_files_impl(&ws, "*", None);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // delete_file tests
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn delete_file_happy_path() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("doomed.txt");
        std::fs::write(&file_path, "farewell").unwrap();

        // Canonicalize before delete so we can check existence after
        let canonical = std::fs::canonicalize(&file_path).unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = delete_file_impl(&ws, &absolute_path);

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert!(
            !canonical.exists(),
            "File should be gone from recycle bin"
        );
    }

    #[test]
    fn delete_file_sandbox_violation() {
        let tempdir_a = TempDir::new().unwrap();
        let tempdir_b = TempDir::new().unwrap();
        let outside_file = tempdir_b.path().join("target.txt");
        std::fs::write(&outside_file, "secret").unwrap();

        let ws = make_workspace("ws1", tempdir_a.path());
        let absolute_outside_path = outside_file.to_string_lossy().to_string();

        let result = delete_file_impl(&ws, &absolute_outside_path);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
        // File must NOT be deleted
        let content = std::fs::read_to_string(&outside_file).unwrap();
        assert_eq!(content, "secret", "Sandbox should have blocked the delete");
    }

    #[test]
    fn delete_file_directory_rejected() {
        let tempdir = TempDir::new().unwrap();
        let subdir = tempdir.path().join("subdir");
        std::fs::create_dir(&subdir).unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = subdir.to_string_lossy().to_string();

        let result = delete_file_impl(&ws, &absolute_path);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message == "Path is a directory, not a file"),
            "Expected Upstream 'Path is a directory, not a file', got {:?}",
            err
        );
        // Directory must be preserved
        assert!(subdir.exists(), "Directory should be preserved");
    }

    #[test]
    fn delete_file_blocked_extension() {
        let tempdir = TempDir::new().unwrap();
        let file_path = tempdir.path().join("malware.exe");
        std::fs::write(&file_path, "MZ...").unwrap();

        let ws = make_workspace("ws1", tempdir.path());
        let absolute_path = file_path.to_string_lossy().to_string();

        let result = delete_file_impl(&ws, &absolute_path);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, AppError::Upstream { ref message } if message.contains("Blocked file type: .exe")),
            "Expected Upstream blocked extension error, got {:?}",
            err
        );
        // File must be preserved
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "MZ...", "File should be preserved");
    }
}
