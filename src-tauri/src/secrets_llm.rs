//! LLM API key storage — Tauri store backed, NOT keyring.
//!
//! Lower-security tier than billing keys (LLM keys only burn tokens).
//! Stored under `llm_providers/<provider_id>/api_key` in the Tauri store.
//!
//! Two-namespace rule (AGENTS.md): LLM keys go in Tauri store, billing keys
//! go in Windows Credential Manager. Never mix.

use crate::types::Secret;
use log::{debug, warn};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "llm_secrets.json";
const KEY_PREFIX: &str = "llm_providers";

fn store_key(provider_id: &str) -> String {
    format!("{KEY_PREFIX}/{provider_id}/api_key")
}

/// Store or replace the LLM API key for `provider_id`.
pub fn set_llm_key(app: &AppHandle, provider_id: &str, key: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("failed to open store: {e}"))?;
    store.set(store_key(provider_id), serde_json::json!(key));
    store
        .save()
        .map_err(|e| format!("failed to save store: {e}"))?;
    debug!(target: "secrets_llm", "stored LLM key for provider_id={}", provider_id);
    Ok(())
}

/// Read the LLM API key for `provider_id`, returning `None` when absent.
/// The returned `Secret<String>` keeps the value out of logs.
pub fn get_llm_key(app: &AppHandle, provider_id: &str) -> Result<Option<Secret>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("failed to open store: {e}"))?;
    let key = store_key(provider_id);
    match store.get(&key) {
        Some(serde_json::Value::String(value)) => Ok(Some(Secret::new(value))),
        Some(_) => {
            warn!(target: "secrets_llm", "unexpected type for {}; expected String", key);
            Ok(None)
        }
        None => Ok(None),
    }
}

/// Lightweight probe used by the settings UI to render the "API key
/// configured" indicator without exposing the secret value.
pub fn has_llm_key(app: &AppHandle, provider_id: &str) -> bool {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let key = store_key(provider_id);
    store.get(&key).is_some()
}

/// Delete the stored LLM API key for `provider_id`. No-op if absent.
pub fn delete_llm_key(app: &AppHandle, provider_id: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("failed to open store: {e}"))?;
    let key = store_key(provider_id);
    match store.delete(&key) {
        true => {
            store
                .save()
                .map_err(|e| format!("failed to save store after delete: {e}"))?;
            debug!(target: "secrets_llm", "deleted LLM key for provider_id={}", provider_id);
            Ok(())
        }
        false => {
            // Key was not present — treat as success (no-op)
            Ok(())
        }
    }
}
