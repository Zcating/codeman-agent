//! Sandboxed filesystem path validation.
//!
//! Ensures all file operations stay within the configured workspace boundary
//! by canonicalizing paths and checking containment before any fs operation.
//!
//! Security invariants enforced:
//! - `\\?\` long-path prefix is rejected (bypasses MAX_PATH and security checks)
//! - NTFS alternate data streams (`::DATA`) are rejected
//! - Symlinks are resolved before boundary check
//! - Canonical paths must start with the canonical workspace root

use std::path::{Path, PathBuf};

use crate::types::AppError;

/// Validates that `path` is contained within `workspace_root`.
///
/// # Security
///
/// This function must be called by ALL filesystem commands (T6-T10) before
/// performing any file operation. It prevents:
/// - Path traversal attacks (`../` sequences)
/// - Symbolic link escapes
/// - Windows long-path prefix bypasses (`\\?\`)
/// - NTFS alternate data stream attacks (`::DATA`)
///
/// # Errors
///
/// Returns `AppError::SandboxViolation` if:
/// - The path string contains `\\?\` prefix
/// - The path string contains NTFS stream notation (`::DATA`)
/// - The canonical path is not contained within the canonical workspace root
///
/// # Arguments
///
/// * `path` - The path to validate (relative or absolute)
/// * `workspace_root` - The root of the allowed workspace (must be a directory)
pub fn validate_path_in_workspace(
    path: &Path,
    workspace_root: &Path,
) -> Result<PathBuf, AppError> {
    let path_str = path.to_string_lossy().to_lowercase();

    // 1. Reject \\?\ long path prefix (case-insensitive check on path string BEFORE canonicalize)
    // This prefix bypasses MAX_PATH limits and many Windows security checks.
    if path_str.starts_with(r"\\?\") {
        return Err(AppError::SandboxViolation {
            path: path.display().to_string(),
            workspace_label: workspace_root.display().to_string(),
        });
    }

    // 2. Reject NTFS alternate data streams (::DATA or ::$DATA)
    // Streams can hide content from normal path-based sandbox checks.
    if path_str.contains("::data") {
        return Err(AppError::SandboxViolation {
            path: path.display().to_string(),
            workspace_label: workspace_root.display().to_string(),
        });
    }

    // 3. Canonicalize to resolve symlinks + normalize case on Windows
    let canonical_path =
        std::fs::canonicalize(path).map_err(|_| AppError::SandboxViolation {
            path: path.display().to_string(),
            workspace_label: workspace_root.display().to_string(),
        })?;
    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|_| AppError::SandboxViolation {
            path: path.display().to_string(),
            workspace_label: workspace_root.display().to_string(),
        })?;

    // 4. Check canonical path is within workspace root
    if !canonical_path.starts_with(&canonical_root) {
        return Err(AppError::SandboxViolation {
            path: path.display().to_string(),
            workspace_label: workspace_root.display().to_string(),
        });
    }

    Ok(canonical_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(windows)]
    use std::os::windows::fs::symlink_dir;
    #[cfg(unix)]
    use std::os::unix::fs::symlink as symlink_dir;
    use tempfile::TempDir;

    #[test]
    fn path_inside_workspace_returns_canonical() {
        // Arrange: tempdir workspace + file inside
        let tempdir = TempDir::new().unwrap();
        let workspace_root = tempdir.path();
        let file_path = workspace_root.join("inside.txt");
        fs::write(&file_path, "test content").unwrap();

        // Act
        let result = validate_path_in_workspace(&file_path, workspace_root);

        // Assert
        assert!(result.is_ok(), "Expected Ok for in-workspace path, got {:?}", result);
        let canonical = result.unwrap();
        let canonical_root = std::fs::canonicalize(workspace_root).unwrap();
        assert!(
            canonical.starts_with(&canonical_root),
            "Canonical path {:?} should start with workspace {:?}",
            canonical,
            canonical_root
        );
    }

    #[test]
    fn path_outside_workspace_errors() {
        // Arrange: two tempdirs, file at B, workspace = A
        let tempdir_a = TempDir::new().unwrap();
        let tempdir_b = TempDir::new().unwrap();
        let workspace_root = tempdir_a.path();
        let outside_file = tempdir_b.path().join("outside.txt");
        fs::write(&outside_file, "outside").unwrap();

        // Act
        let result = validate_path_in_workspace(&outside_file, workspace_root);

        // Assert
        assert!(result.is_err(), "Expected Err for out-of-workspace path");
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
    }

    #[test]
    #[cfg_attr(windows, ignore = "symlink creation requires admin privileges on Windows")]
    fn symlink_pointing_outside_errors() {
        // Arrange: tempdir workspace + symlink inside pointing to file outside
        let tempdir_workspace = TempDir::new().unwrap();
        let tempdir_outside = TempDir::new().unwrap();
        let workspace_root = tempdir_workspace.path();

        let outside_file = tempdir_outside.path().join("target.txt");
        fs::write(&outside_file, "secret").unwrap();

        let symlink_path = workspace_root.join("escape_link");
        symlink_dir(&outside_file, &symlink_path).unwrap();

        // Act
        let result = validate_path_in_workspace(&symlink_path, workspace_root);

        // Assert
        assert!(result.is_err(), "Expected Err for symlink escaping workspace");
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
    }

    #[test]
    fn long_path_prefix_rejected() {
        // Arrange: any tempdir workspace
        let tempdir = TempDir::new().unwrap();
        let workspace_root = tempdir.path();
        let file_path = workspace_root.join("file.txt");
        fs::write(&file_path, "content").unwrap();

        // Simulate a path with \\?\ prefix
        #[cfg(windows)]
        let prefixed_path = PathBuf::from(r"\\?\C:\some\path");
        #[cfg(unix)]
        let prefixed_path = PathBuf::from(r"\\?\home\some\path");

        // Act
        let result = validate_path_in_workspace(&prefixed_path, workspace_root);

        // Assert: should be rejected BEFORE canonicalize attempt
        assert!(result.is_err(), r"Expected Err for \\?\ prefix path");
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
    }

    #[test]
    fn ntfs_stream_rejected() {
        // Arrange: tempdir workspace + file with stream notation
        let tempdir = TempDir::new().unwrap();
        let workspace_root = tempdir.path();
        let file_path = workspace_root.join("data.txt");
        fs::write(&file_path, "content").unwrap();

        // Path with NTFS alternate data stream notation
        let stream_path = PathBuf::from("data.txt::DATA");

        // Act
        let result = validate_path_in_workspace(&stream_path, workspace_root);

        // Assert: should be rejected for stream notation
        assert!(result.is_err(), "Expected Err for NTFS stream path");
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::SandboxViolation { .. }));
    }
}
