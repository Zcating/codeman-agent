//! LLM API 密钥存储 — Tauri store 支持，**不是** keyring。
//!
//! 安全等级低于计费密钥（LLM 密钥只会消耗 token）。
//! 存储在 Tauri store 的 `llm_providers/<provider_id>/api_key` 下。
//!
//! 双命名空间规则（AGENTS.md）：LLM 密钥进 Tauri store，计费密钥
//! 进 Windows Credential Manager。永不混合。

use crate::types::Secret;
use log::{debug, warn};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "llm_secrets.json";
const KEY_PREFIX: &str = "llm_providers";

fn store_key(provider_id: &str) -> String {
    format!("{KEY_PREFIX}/{provider_id}/api_key")
}

/// 存储或替换 `provider_id` 的 LLM API 密钥。
pub fn set_llm_key(app: &AppHandle, provider_id: &str, key: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("打开存储失败：{e}"))?;
    store.set(store_key(provider_id), serde_json::json!(key));
    store
        .save()
        .map_err(|e| format!("保存存储失败：{e}"))?;
    debug!(target: "secrets_llm", "已存储 provider_id={} 的 LLM 密钥", provider_id);
    Ok(())
}

/// 读取 `provider_id` 的 LLM API 密钥，不存在时返回 `None`。
/// 返回的 `Secret<String>` 将值排除在日志之外。
pub fn get_llm_key(app: &AppHandle, provider_id: &str) -> Result<Option<Secret>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("打开存储失败：{e}"))?;
    let key = store_key(provider_id);
    match store.get(&key) {
        Some(serde_json::Value::String(value)) => Ok(Some(Secret::new(value))),
        Some(_) => {
            warn!(target: "secrets_llm", "{} 的类型意外；期望 String", key);
            Ok(None)
        }
        None => Ok(None),
    }
}

/// 供设置 UI 使用的轻量探测，在不暴露密钥值的情况下渲染"已配置 API 密钥"指示器。
pub fn has_llm_key(app: &AppHandle, provider_id: &str) -> bool {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let key = store_key(provider_id);
    store.get(&key).is_some()
}

/// 删除存储的 `provider_id` LLM API 密钥。不存在时无操作。
pub fn delete_llm_key(app: &AppHandle, provider_id: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("打开存储失败：{e}"))?;
    let key = store_key(provider_id);
    match store.delete(&key) {
        true => {
            store
                .save()
                .map_err(|e| format!("删除后保存存储失败：{e}"))?;
            debug!(target: "secrets_llm", "已删除 provider_id={} 的 LLM 密钥", provider_id);
            Ok(())
        }
        false => {
            // 密钥不存在——视为成功（无操作）
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    // 集成测试推迟到 V2——需要 Tauri 运行时兼容性。
}
