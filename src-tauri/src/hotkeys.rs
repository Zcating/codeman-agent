//! Global hotkey parsing + registration.
//!
//! We accept a small but expressive DSL: modifier tokens (`Ctrl`,
//! `Alt`, `Shift`, `Meta`/`Super`/`Win`) joined with `+` to a single
//! key. Keys can be a single ASCII letter (A-Z), a digit (0-9), or
//! `F1`-`F12`. Anything else returns a `String` error that the
//! settings UI surfaces.

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum HotkeyError {
    #[error("invalid hotkey `{0}`: {1}")]
    Parse(String, String),
    #[error("plugin error: {0}")]
    Plugin(String),
}

pub fn parse(s: &str) -> Result<Shortcut, HotkeyError> {
    let (mods, code) = parse_components(s)?;
    Ok(Shortcut::new(Some(mods), code))
}

fn parse_components(s: &str) -> Result<(Modifiers, Code), HotkeyError> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    if parts.is_empty() {
        return Err(HotkeyError::Parse(s.into(), "empty".into()));
    }

    let mut mods = Modifiers::empty();
    let mut key: Option<Code> = None;
    for part in parts {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "super" | "meta" | "win" => mods |= Modifiers::META,
            other => {
                if key.is_some() {
                    return Err(HotkeyError::Parse(
                        s.into(),
                        format!("multiple non-modifier keys: {other}"),
                    ));
                }
                key = Some(parse_key(other).map_err(|e| HotkeyError::Parse(s.into(), e))?);
            }
        }
    }
    let code = key.ok_or_else(|| HotkeyError::Parse(s.into(), "no key".into()))?;
    Ok((mods, code))
}

fn parse_key(s: &str) -> Result<Code, String> {
    if s.len() == 1 {
        let c = s.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            return Ok(match c.to_ascii_uppercase() {
                'A' => Code::KeyA,
                'B' => Code::KeyB,
                'C' => Code::KeyC,
                'D' => Code::KeyD,
                'E' => Code::KeyE,
                'F' => Code::KeyF,
                'G' => Code::KeyG,
                'H' => Code::KeyH,
                'I' => Code::KeyI,
                'J' => Code::KeyJ,
                'K' => Code::KeyK,
                'L' => Code::KeyL,
                'M' => Code::KeyM,
                'N' => Code::KeyN,
                'O' => Code::KeyO,
                'P' => Code::KeyP,
                'Q' => Code::KeyQ,
                'R' => Code::KeyR,
                'S' => Code::KeyS,
                'T' => Code::KeyT,
                'U' => Code::KeyU,
                'V' => Code::KeyV,
                'W' => Code::KeyW,
                'X' => Code::KeyX,
                'Y' => Code::KeyY,
                'Z' => Code::KeyZ,
                _ => unreachable!(),
            });
        }
        if c.is_ascii_digit() {
            return Ok(match c {
                '0' => Code::Digit0,
                '1' => Code::Digit1,
                '2' => Code::Digit2,
                '3' => Code::Digit3,
                '4' => Code::Digit4,
                '5' => Code::Digit5,
                '6' => Code::Digit6,
                '7' => Code::Digit7,
                '8' => Code::Digit8,
                '9' => Code::Digit9,
                _ => unreachable!(),
            });
        }
    }
    if let Some(n) = s.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()) {
        if (1..=12).contains(&n) {
            return Ok(match n {
                1 => Code::F1,
                2 => Code::F2,
                3 => Code::F3,
                4 => Code::F4,
                5 => Code::F5,
                6 => Code::F6,
                7 => Code::F7,
                8 => Code::F8,
                9 => Code::F9,
                10 => Code::F10,
                11 => Code::F11,
                12 => Code::F12,
                _ => unreachable!(),
            });
        }
    }
    Err(format!("unsupported key `{s}` (use A-Z, 0-9, or F1-F12)"))
}

/// Unregister every currently-registered shortcut. Useful before
/// re-registering on settings change.
pub fn unregister_all(app: &AppHandle) -> Result<(), HotkeyError> {
    let gs = app.global_shortcut();
    let registered = gs
        .registered_shortcuts()
        .map_err(|e| HotkeyError::Plugin(e.to_string()))?;
    for shortcut in registered {
        if let Err(e) = gs.unregister(shortcut) {
            log::warn!("failed to unregister shortcut: {e}");
        }
    }
    Ok(())
}

pub fn register(
    app: &AppHandle,
    s: &str,
    on_press: impl Fn(&AppHandle) + Send + Sync + 'static,
) -> Result<(), HotkeyError> {
    let shortcut = parse(s)?;
    let gs = app.global_shortcut();
    gs.on_shortcut(shortcut, move |app_handle, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            on_press(app_handle);
        }
    })
    .map_err(|e| HotkeyError::Plugin(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_default_hotkeys() {
        assert!(parse("Ctrl+Alt+B").is_ok());
        assert!(parse("Ctrl+Alt+H").is_ok());
    }

    #[test]
    fn parses_function_keys_and_digits() {
        assert!(parse("Ctrl+F12").is_ok());
        assert!(parse("Alt+5").is_ok());
        assert!(parse("Shift+Meta+Z").is_ok());
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse("").is_err());
        assert!(parse("Ctrl+").is_err());
        assert!(parse("Ctrl+Alt").is_err());
        assert!(parse("Ctrl+Esc").is_err());
        assert!(parse("Ctrl+Alt+B+H").is_err());
    }
}
