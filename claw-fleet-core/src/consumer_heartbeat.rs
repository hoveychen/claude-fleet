//! Consumer-presence heartbeat.
//!
//! The party that polls `~/.fleet/guard/` and `~/.fleet/elicitation/` for
//! pending requests (the desktop app, or `fleet serve` when a SSE client is
//! connected) writes this file periodically.  The `fleet guard` /
//! `fleet elicitation` hook CLIs check it before blocking Claude Code on a
//! request that might never be consumed.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn heartbeat_path() -> Option<PathBuf> {
    crate::session::real_home_dir().map(|h| h.join(".fleet").join("consumer.heartbeat"))
}

/// Write the current timestamp (ms since epoch) to the heartbeat file.
pub fn write_heartbeat() {
    let Some(path) = heartbeat_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let ts_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let _ = fs::write(&path, format!("{}\n", ts_ms));
}

/// Whether a consumer has written the heartbeat within `stale_after`.
pub fn is_consumer_alive(stale_after: Duration) -> bool {
    let Some(path) = heartbeat_path() else {
        return false;
    };
    let Ok(content) = fs::read_to_string(&path) else {
        return false;
    };
    let Ok(ts_ms) = content.trim().parse::<u128>() else {
        return false;
    };
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    now_ms.saturating_sub(ts_ms) < stale_after.as_millis()
}
