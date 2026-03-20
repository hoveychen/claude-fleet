//! Backend trait — abstraction over local (file-based) and remote (HTTP probe)
//! data sources.  Both `LocalBackend` and `RemoteBackend` implement this trait
//! so that all Tauri command handlers can be written as simple delegations with
//! no `if remote { … } else { … }` branching.

use crate::account::AccountInfo;
use crate::session::SessionInfo;
use serde_json::Value;

pub trait Backend: Send + Sync {
    fn list_sessions(&self) -> Vec<SessionInfo>;
    fn get_messages(&self, path: &str) -> Result<Vec<Value>, String>;
    fn kill_pid(&self, pid: u32) -> Result<(), String>;
    fn kill_workspace(&self, workspace_path: String) -> Result<(), String>;
    fn account_info(&self) -> Result<AccountInfo, String>;
    /// Start tailing a session file for new lines.
    /// Returns the initial byte offset (file size at call time).
    /// New lines are delivered as `session-tail` Tauri events.
    fn start_watch(&self, path: String) -> Result<u64, String>;
    fn stop_watch(&self);
}

/// No-op placeholder used before the real backend is initialised in
/// `tauri::Builder::setup`.  Needed because `AppState` must be `manage()`d
/// before `setup()` runs, but `AppHandle` (required by `LocalBackend`) is only
/// available inside `setup()`.
pub(crate) struct NullBackend;

impl Backend for NullBackend {
    fn list_sessions(&self) -> Vec<SessionInfo> {
        vec![]
    }
    fn get_messages(&self, _: &str) -> Result<Vec<Value>, String> {
        Err("backend not ready".into())
    }
    fn kill_pid(&self, _: u32) -> Result<(), String> {
        Err("backend not ready".into())
    }
    fn kill_workspace(&self, _: String) -> Result<(), String> {
        Err("backend not ready".into())
    }
    fn account_info(&self) -> Result<AccountInfo, String> {
        Err("backend not ready".into())
    }
    fn start_watch(&self, _: String) -> Result<u64, String> {
        Err("backend not ready".into())
    }
    fn stop_watch(&self) {}
}
