//! Thin wrapper around the `keyring` crate that namespaces API keys
//! under `llm-bills/<provider>/api_key` in Windows Credential Manager.
//!
//! `Secret<String>` (see `types`) keeps the value out of logs; this
//! module keeps it out of the settings JSON file.

use crate::types::ProviderId;
use keyring::Entry;
use log::{debug, warn};
use thiserror::Error;

const SERVICE: &str = "llm-bills";

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("provider not found: {0}")]
    NotFound(String),
}

/// Store or replace the API key for `provider`.
pub fn set_api_key(provider: ProviderId, value: &str) -> Result<(), SecretError> {
    let entry = Entry::new(SERVICE, &format!("{}/api_key", provider.as_str()))?;
    entry.set_password(value)?;
    debug!("stored api key for {}", provider.as_str());
    Ok(())
}

/// Read the API key for `provider`, returning `None` when the user has
/// never saved one. The returned `String` should be wrapped in a
/// `Secret<String>` before being passed around.
pub fn get_api_key(provider: ProviderId) -> Result<Option<String>, SecretError> {
    let entry = Entry::new(SERVICE, &format!("{}/api_key", provider.as_str()))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SecretError::Keyring(e)),
    }
}

/// Delete the stored API key for `provider`. No-op if absent.
pub fn delete_api_key(provider: ProviderId) -> Result<(), SecretError> {
    let entry = Entry::new(SERVICE, &format!("{}/api_key", provider.as_str()))?;
    match entry.delete_credential() {
        Ok(()) => {
            debug!("deleted api key for {}", provider.as_str());
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            warn!("failed to delete api key for {}: {e}", provider.as_str());
            Err(SecretError::Keyring(e))
        }
    }
}

/// Lightweight probe used by the settings UI to render the "API key
/// configured" indicator without exposing the secret.
pub fn has_api_key(provider: ProviderId) -> bool {
    matches!(get_api_key(provider), Ok(Some(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    // These tests touch the real Windows Credential Manager and so are
    // gated behind `keyring-test` so a normal `cargo test` does not
    // require a credential store. They are ignored by default.

    #[test]
    #[ignore = "touches the OS credential store"]
    fn round_trip_api_key() {
        let provider = ProviderId::Deepseek;
        set_api_key(provider, "hello").unwrap();
        assert_eq!(get_api_key(provider).unwrap().as_deref(), Some("hello"));
        delete_api_key(provider).unwrap();
        assert!(get_api_key(provider).unwrap().is_none());
    }
}
