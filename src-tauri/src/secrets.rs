//! 围绕 `keyring` crate 的薄包装，将 API 密钥命名空间化为
//! Windows Credential Manager 中的 `codeman-agent/<provider>/api_key`。
//!
//! `Secret<String>`（见 `types`）将值排除在日志之外；此模块将其
//! 排除在 settings JSON 文件之外。

use crate::types::ProviderId;
use keyring::Entry;
use log::{debug, warn};
use thiserror::Error;

const SERVICE: &str = "codeman-agent";

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("keyring 错误：{0}")]
    Keyring(#[from] keyring::Error),
    #[error("提供商未找到：{0}")]
    NotFound(String),
}

/// 存储或替换 `provider` 的 API 密钥。
pub fn set_api_key(provider: ProviderId, value: &str) -> Result<(), SecretError> {
    let entry = Entry::new(SERVICE, &format!("{}/api_key", provider.as_str()))?;
    entry.set_password(value)?;
    debug!("已存储 {} 的 API 密钥", provider.as_str());
    Ok(())
}

/// 读取 `provider` 的 API 密钥，用户从未保存时返回 `None`。
/// 返回的 `String` 在传递之前应包装在 `Secret<String>` 中。
pub fn get_api_key(provider: ProviderId) -> Result<Option<String>, SecretError> {
    let entry = Entry::new(SERVICE, &format!("{}/api_key", provider.as_str()))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SecretError::Keyring(e)),
    }
}

/// 删除存储的 `provider` API 密钥。不存在时无操作。
pub fn delete_api_key(provider: ProviderId) -> Result<(), SecretError> {
    let entry = Entry::new(SERVICE, &format!("{}/api_key", provider.as_str()))?;
    match entry.delete_credential() {
        Ok(()) => {
            debug!("已删除 {} 的 API 密钥", provider.as_str());
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            warn!("删除 {} 的 API 密钥失败：{e}", provider.as_str());
            Err(SecretError::Keyring(e))
        }
    }
}

/// 供设置 UI 使用的轻量探测，在不暴露密钥的情况下渲染"已配置 API 密钥"指示器。
pub fn has_api_key(provider: ProviderId) -> bool {
    matches!(get_api_key(provider), Ok(Some(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    // 这些测试接触真实的 Windows Credential Manager，因此被关在
    // `keyring-test` 后面，以便普通的 `cargo test` 不需要凭据存储。
    // 它们默认被忽略。

    #[test]
    #[ignore = "接触 OS 凭据存储"]
    fn round_trip_api_key() {
        let provider = ProviderId::Deepseek;
        set_api_key(provider, "hello").unwrap();
        assert_eq!(get_api_key(provider).unwrap().as_deref(), Some("hello"));
        delete_api_key(provider).unwrap();
        assert!(get_api_key(provider).unwrap().is_none());
    }
}
