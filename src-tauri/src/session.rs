use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Lock file ────────────────────────────────────────────────────────────────

#[derive(Deserialize, Clone, Debug)]
pub struct LockFile {
    pub pid: u32,
    #[serde(rename = "workspaceFolders", default)]
    pub workspace_folders: Vec<String>,
    #[serde(rename = "ideName", default)]
    pub ide_name: String,
}

pub struct IdeSession {
    pub pid: u32,
    pub workspace_folders: Vec<String>,
    pub ide_name: String,
}

// ── Exported types ───────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Thinking,     // streaming: last partial assistant msg has thinking blocks
    Executing,    // streaming: last partial assistant msg has tool_use blocks
    Streaming,    // file written < 2s ago (text output)
    Delegating,   // main session with at least one active subagent
    Processing,   // last stop_reason = tool_use, recent activity (waiting for tool result)
    WaitingInput, // last stop_reason = end_turn
    Active,       // file written < 30s ago
    Idle,         // no recent activity
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub workspace_path: String,
    pub workspace_name: String,
    pub ide_name: Option<String>,
    pub is_subagent: bool,
    pub parent_session_id: Option<String>,
    pub agent_type: Option<String>,
    pub agent_description: Option<String>,
    pub slug: Option<String>,
    pub ai_title: Option<String>,
    pub status: SessionStatus,
    pub token_speed: f64,
    pub total_output_tokens: u64,
    pub last_message_preview: Option<String>,
    pub last_activity_ms: u64,
    pub created_at_ms: u64,
    pub jsonl_path: String,
    pub model: Option<String>,
    pub thinking_level: Option<String>,
    pub pid: Option<u32>,
    /// True when the PID is unambiguously matched to this specific session.
    /// False when multiple claude processes share the same cwd and none carries
    /// a matching --resume flag — stopping may affect sibling sessions.
    pub pid_precise: bool,
    pub last_skill: Option<String>,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

pub fn get_claude_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

#[cfg(unix)]
pub fn is_process_alive(pid: u32) -> bool {
    let ret = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if ret == 0 {
        return true;
    }
    // EPERM = process exists but we lack permission to signal it → alive
    // ESRCH = no such process → dead
    std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

#[cfg(not(unix))]
pub fn is_process_alive(_pid: u32) -> bool {
    true // Fallback: assume alive
}

fn decode_workspace_path(encoded: &str) -> String {
    // "-Users-hoveychen-workspace-netferry" → "/Users/hoveychen/workspace/netferry"
    // Best-effort; dashes inside path components are lost (e.g. "claude-fleet" ≠ "claude/fleet").
    let stripped = encoded.trim_start_matches('-');
    format!("/{}", stripped.replace('-', "/"))
}

fn encode_workspace_path(path: &str) -> String {
    // "/Users/foo/bar-baz" → "-Users-foo-bar-baz"  (inverse of decode, but lossless for matching)
    path.replace('/', "-")
}

fn workspace_name(path: &str) -> String {
    path.split('/')
        .filter(|s| !s.is_empty())
        .last()
        .unwrap_or(path)
        .to_string()
}

// ── CLI process scanning ─────────────────────────────────────────────────────

/// A running `claude` process discovered by sysinfo.
#[derive(Debug, Clone)]
pub struct CliProcess {
    pub pid: u32,
    pub ppid: Option<u32>,
    pub cwd: String,
    /// Session ID parsed from `--resume <id>` in the process argv, if present.
    pub resume_session_id: Option<String>,
}

fn extract_resume_id(cmd: &[std::ffi::OsString]) -> Option<String> {
    let mut iter = cmd.iter();
    while let Some(arg) = iter.next() {
        let s = arg.to_string_lossy();
        if s == "--resume" || s == "-r" {
            return iter.next().map(|v| v.to_string_lossy().into_owned());
        }
        if let Some(val) = s.strip_prefix("--resume=") {
            return Some(val.to_owned());
        }
    }
    None
}

/// Resolve a PID for a specific session given all processes sharing the same cwd.
///
/// Matching priority (highest → lowest):
/// 1. Exact `--resume <session_id>` match → always precise.
/// 2. Parent-child filtering: drop any claude process whose parent is also a
///    claude process in this workspace (those are subagent child processes).
///    If exactly one "root" process remains → precise.
/// 3. Single process → precise regardless.
/// 4. Multiple unresolvable processes → imprecise (first as representative).
fn resolve_pid(procs: &[CliProcess], session_id: &str) -> (Option<u32>, bool) {
    if procs.is_empty() {
        return (None, false);
    }

    // Rule 1: exact --resume match.
    if let Some(p) = procs.iter().find(|p| {
        p.resume_session_id.as_deref() == Some(session_id)
    }) {
        return (Some(p.pid), true);
    }

    // Rule 2: filter out child claude processes (subagents).
    // A process is a "child" if its parent PID is also in this workspace's process set.
    let pid_set: std::collections::HashSet<u32> = procs.iter().map(|p| p.pid).collect();
    let roots: Vec<&CliProcess> = procs.iter().filter(|p| {
        !p.ppid.map_or(false, |ppid| pid_set.contains(&ppid))
    }).collect();

    match roots.len() {
        0 => (Some(procs[0].pid), false), // shouldn't happen; fall back
        1 => (Some(roots[0].pid), true),
        _ => (Some(roots[0].pid), false), // still ambiguous after filtering
    }
}

/// Scan all running `claude` processes.
/// Uses sysinfo for cross-platform support (macOS, Linux, Windows).
pub fn scan_cli_processes() -> Vec<CliProcess> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

    let mut result = Vec::new();
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cwd(UpdateKind::Always)
            .with_cmd(UpdateKind::Always),
    );
    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy();
        if name == "claude" || name == "claude.exe" {
            if let Some(cwd) = process.cwd() {
                if let Some(path) = cwd.to_str() {
                    let resume_session_id = extract_resume_id(process.cmd());
                    let ppid = process.parent().map(|p| p.as_u32());
                    result.push(CliProcess {
                        pid: pid.as_u32(),
                        ppid,
                        cwd: path.to_string(),
                        resume_session_id,
                    });
                }
            }
        }
    }
    result
}

// ── IDE session scanning ─────────────────────────────────────────────────────

pub fn scan_ide_sessions(claude_dir: &Path) -> Vec<IdeSession> {
    let ide_dir = claude_dir.join("ide");
    let mut sessions = Vec::new();

    let Ok(entries) = fs::read_dir(&ide_dir) else {
        return sessions;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("lock") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(lock): Result<LockFile, _> = serde_json::from_str(&content) else {
            continue;
        };
        if is_process_alive(lock.pid) {
            sessions.push(IdeSession {
                pid: lock.pid,
                workspace_folders: lock.workspace_folders,
                ide_name: lock.ide_name,
            });
        }
    }
    sessions
}

// ── JSONL parsing ────────────────────────────────────────────────────────────

fn determine_status(last_lines: &[Value], file_age_secs: f64) -> SessionStatus {
    if file_age_secs < 8.0 {
        // Find the current turn: everything after the last user message.
        let turn_start = last_lines
            .iter()
            .rposition(|v| v.get("type").and_then(|t| t.as_str()) == Some("user"))
            .map(|i| i + 1)
            .unwrap_or(0);

        // Look at the LAST incomplete (stop_reason=null) assistant message in the turn.
        // This tells us what the model is currently outputting, without false-positives
        // from blocks that appeared earlier in the same turn.
        let last_partial = last_lines[turn_start..].iter().rev().find(|v| {
            if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                return false;
            }
            let stop = v
                .get("message")
                .and_then(|m| m.get("stop_reason"));
            // stop_reason absent or null → still streaming
            stop.map_or(true, |s| s.is_null())
        });

        if let Some(partial) = last_partial {
            let block_types: Vec<&str> = partial
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter_map(|b| b.get("type").and_then(|t| t.as_str()))
                        .collect()
                })
                .unwrap_or_default();

            if block_types.contains(&"thinking") {
                return SessionStatus::Thinking;
            }
            if block_types.contains(&"tool_use") {
                return SessionStatus::Executing;
            }
            return SessionStatus::Streaming;
        }

        // No incomplete message found — model may have just finished writing.
        // Fall through to check stop_reason of the last complete message.
    }

    // Check what the last meaningful line is to distinguish "tool executing" vs "model thinking".
    let last_meaningful = last_lines.iter().rev().find(|v| {
        matches!(
            v.get("type").and_then(|t| t.as_str()),
            Some("user") | Some("assistant")
        )
    });

    if let Some(last) = last_meaningful {
        let last_type = last.get("type").and_then(|t| t.as_str());

        if last_type == Some("user") {
            // Last write was a user message — the model is thinking about it.
            // This covers both: tool_result received (model thinking after tool execution)
            // and fresh user message (model doing initial/extended thinking before first write).
            if file_age_secs < 120.0 {
                return SessionStatus::Thinking;
            }
        }

        if last_type == Some("assistant") {
            let stop_reason = last
                .get("message")
                .and_then(|m| m.get("stop_reason"))
                .and_then(|s| s.as_str());

            match stop_reason {
                Some("end_turn") if file_age_secs < 300.0 => return SessionStatus::WaitingInput,
                // Last write was a tool_use — the tool is still executing.
                Some("tool_use") if file_age_secs < 60.0 => return SessionStatus::Executing,
                _ => {}
            }
        }
    }

    if file_age_secs < 30.0 {
        SessionStatus::Active
    } else {
        SessionStatus::Idle
    }
}

fn compute_token_stats(lines: &[&str]) -> (f64, u64) {
    let mut total_output: u64 = 0;
    let mut timed_tokens: Vec<(f64, u64)> = Vec::new();
    let mut seen_msg_ids: HashSet<String> = HashSet::new();

    for line in lines {
        let Ok(v): Result<Value, _> = serde_json::from_str(line) else {
            continue;
        };
        if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(msg) = v.get("message").and_then(|m| m.as_object()) else {
            continue;
        };
        // Only count finalized messages
        if msg.get("stop_reason").map_or(true, |s| s.is_null()) {
            continue;
        }
        let msg_id = msg
            .get("id")
            .and_then(|i| i.as_str())
            .unwrap_or_default()
            .to_string();
        if !msg_id.is_empty() {
            if seen_msg_ids.contains(&msg_id) {
                continue;
            }
            seen_msg_ids.insert(msg_id);
        }

        let output_tokens = msg
            .get("usage")
            .and_then(|u| u.get("output_tokens"))
            .and_then(|t| t.as_u64())
            .unwrap_or(0);
        total_output += output_tokens;

        // Timestamp for speed
        if let Some(ts_str) = v.get("timestamp").and_then(|t| t.as_str()) {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                timed_tokens.push((dt.timestamp() as f64, output_tokens));
            }
        }
    }

    // Speed: tokens/s over the last 5-minute window
    let speed = if timed_tokens.len() >= 2 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();
        let window_start = now - 300.0;

        let recent: Vec<_> = timed_tokens
            .iter()
            .filter(|(ts, _)| *ts > window_start)
            .collect();

        if recent.len() >= 2 {
            let total_recent: u64 = recent.iter().map(|(_, t)| t).sum();
            let first_ts = recent.first().map(|(ts, _)| *ts).unwrap_or(0.0);
            let last_ts = recent.last().map(|(ts, _)| *ts).unwrap_or(0.0);
            let duration = last_ts - first_ts;
            if duration > 0.0 {
                total_recent as f64 / duration
            } else {
                0.0
            }
        } else {
            0.0
        }
    } else {
        0.0
    };

    (speed, total_output)
}

fn extract_model(last_lines: &[Value]) -> Option<String> {
    for msg in last_lines.iter().rev() {
        if msg.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let model = msg
            .get("message")
            .and_then(|m| m.get("model"))
            .and_then(|m| m.as_str())
            .unwrap_or_default();
        if !model.is_empty() && model != "unknown" && model != "<synthetic>" {
            return Some(model.to_string());
        }
    }
    None
}

fn has_thinking_blocks(last_lines: &[Value]) -> bool {
    for msg in last_lines.iter() {
        if msg.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        if let Some(content) = msg
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_array())
        {
            for block in content {
                if block.get("type").and_then(|t| t.as_str()) == Some("thinking") {
                    return true;
                }
            }
        }
    }
    false
}

fn extract_last_text(last_lines: &[Value]) -> Option<String> {
    for msg in last_lines.iter().rev() {
        if msg.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(content) = msg
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_array())
        else {
            continue;
        };
        for block in content.iter().rev() {
            if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                    let preview: String = text.chars().take(200).collect();
                    return Some(preview);
                }
            }
        }
    }
    None
}

fn extract_last_skill(last_lines: &[Value]) -> Option<String> {
    for msg in last_lines.iter().rev() {
        if msg.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(content) = msg
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_array())
        else {
            continue;
        };
        for block in content.iter().rev() {
            if block.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                && block.get("name").and_then(|n| n.as_str()) == Some("Skill")
            {
                if let Some(skill) = block
                    .get("input")
                    .and_then(|i| i.get("skill"))
                    .and_then(|s| s.as_str())
                {
                    return Some(skill.to_string());
                }
            }
        }
    }
    None
}

fn parse_session_info(
    jsonl_path: &Path,
    session_id: String,
    workspace_path: String,
    workspace_name: String,
    ide_name: Option<String>,
    is_subagent: bool,
    parent_session_id: Option<String>,
    agent_type: Option<String>,
    agent_description: Option<String>,
    meta_model: Option<String>,
    meta_thinking_level: Option<String>,
    pid: Option<u32>,
    pid_precise: bool,
) -> Option<SessionInfo> {
    let metadata = fs::metadata(jsonl_path).ok()?;
    let last_modified = metadata.modified().ok()?;
    let last_activity_ms = last_modified
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let created_at_ms = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(last_activity_ms);

    let age = SystemTime::now()
        .duration_since(last_modified)
        .unwrap_or(Duration::from_secs(3600));

    // Skip sessions older than 7 days
    if age > Duration::from_secs(7 * 24 * 3600) {
        return None;
    }

    let content = fs::read_to_string(jsonl_path).ok()?;
    let all_lines: Vec<&str> = content.lines().collect();

    // Last 100 lines for status
    let start = all_lines.len().saturating_sub(100);
    let last_n: Vec<Value> = all_lines[start..]
        .iter()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();

    let status = determine_status(&last_n, age.as_secs_f64());
    let (token_speed, total_output_tokens) = compute_token_stats(&all_lines);
    let last_message_preview = extract_last_text(&last_n);

    let slug = last_n
        .iter()
        .filter_map(|v| v.get("slug").and_then(|s| s.as_str()).map(|s| s.to_string()))
        .last();

    // ai-title appears near the start of the file; scan all lines
    let ai_title = all_lines
        .iter()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .find(|v| v.get("type").and_then(|t| t.as_str()) == Some("ai-title"))
        .and_then(|v| v.get("aiTitle").and_then(|t| t.as_str()).map(|s| s.to_string()));

    let model = meta_model.or_else(|| extract_model(&last_n));
    let last_skill = extract_last_skill(&last_n);

    // Prefer explicit thinking level from meta; fall back to detecting thinking blocks
    let thinking_level = meta_thinking_level.or_else(|| {
        if has_thinking_blocks(&last_n) {
            Some("thinking".to_string())
        } else {
            None
        }
    });

    Some(SessionInfo {
        id: session_id,
        workspace_path,
        workspace_name,
        ide_name,
        is_subagent,
        parent_session_id,
        agent_type,
        agent_description,
        slug,
        ai_title,
        status,
        token_speed,
        total_output_tokens,
        last_message_preview,
        last_activity_ms,
        created_at_ms,
        jsonl_path: jsonl_path.to_string_lossy().to_string(),
        model,
        thinking_level,
        pid,
        pid_precise,
        last_skill,
    })
}

// ── Public entry point ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SubagentMeta {
    #[serde(rename = "agentType")]
    agent_type: Option<String>,
    description: Option<String>,
    model: Option<String>,
    #[serde(rename = "thinkingLevel")]
    thinking_level: Option<String>,
}

pub fn scan_sessions(claude_dir: &Path) -> Vec<SessionInfo> {
    let mut sessions = Vec::new();
    let ide_sessions = scan_ide_sessions(claude_dir);
    let cli_processes = scan_cli_processes();

    let projects_dir = claude_dir.join("projects");
    let Ok(workspace_entries) = fs::read_dir(&projects_dir) else {
        return sessions;
    };

    for workspace_entry in workspace_entries.flatten() {
        let workspace_dir = workspace_entry.path();
        if !workspace_dir.is_dir() {
            continue;
        }

        let encoded = workspace_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();

        // Find associated IDE session by encoding the lock file paths and comparing to the
        // directory name directly.  This avoids the lossy decode round-trip: a workspace named
        // "claude-fleet" encodes to "-Users-…-claude-fleet" but decodes to "/Users/…/claude/fleet".
        let ide = ide_sessions.iter().find(|ide| {
            ide.workspace_folders
                .iter()
                .any(|f| encode_workspace_path(f) == encoded)
        });

        // Use the exact path from the lock file when available; fall back to lossy decode.
        let workspace_path = ide
            .and_then(|s| {
                s.workspace_folders
                    .iter()
                    .find(|f| encode_workspace_path(f) == encoded)
            })
            .cloned()
            .unwrap_or_else(|| decode_workspace_path(&encoded));

        let ws_name = workspace_name(&workspace_path);
        let ide_name = ide.map(|s| s.ide_name.clone());

        // Collect all CLI processes for this workspace (may be >1 when subagents are running).
        // PID: use Claude CLI process only (not the IDE PID — killing the IDE PID would
        // terminate the editor itself, not just the Claude session).
        let procs_in_cwd: Vec<CliProcess> = cli_processes
            .iter()
            .filter(|p| p.cwd == workspace_path)
            .cloned()
            .collect();

        let Ok(entries) = fs::read_dir(&workspace_dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();

            // Main session JSONL files
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                let session_id = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();

                let (session_pid, pid_precise) = resolve_pid(&procs_in_cwd, &session_id);

                if let Some(info) = parse_session_info(
                    &path,
                    session_id,
                    workspace_path.clone(),
                    ws_name.clone(),
                    ide_name.clone(),
                    false,
                    None,
                    None,
                    None,
                    None,
                    None,
                    session_pid,
                    pid_precise,
                ) {
                    sessions.push(info);
                }
            }

            // Subagent directories: <session-uuid>/subagents/agent-*.jsonl
            if path.is_dir() {
                let parent_session_id = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_string();

                let subagents_dir = path.join("subagents");
                let Ok(agent_entries) = fs::read_dir(&subagents_dir) else {
                    continue;
                };

                for agent_entry in agent_entries.flatten() {
                    let agent_path = agent_entry.path();
                    if agent_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }

                    let agent_id = agent_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default()
                        .to_string();

                    // Read optional meta.json
                    let meta_path = agent_path.with_extension("meta.json");
                    let meta = fs::read_to_string(&meta_path)
                        .ok()
                        .and_then(|s| serde_json::from_str::<SubagentMeta>(&s).ok());

                    let agent_type = meta.as_ref().and_then(|m| m.agent_type.clone());
                    let agent_description = meta.as_ref().and_then(|m| m.description.clone());
                    let meta_model = meta.as_ref().and_then(|m| m.model.clone());
                    let meta_thinking_level = meta.and_then(|m| m.thinking_level.clone());

                    // Subagents share the parent's PID resolution; never precise on their own
                    // since we can't kill just the subagent independently.
                    let (sub_pid, _) = resolve_pid(&procs_in_cwd, &parent_session_id);

                    if let Some(info) = parse_session_info(
                        &agent_path,
                        agent_id,
                        workspace_path.clone(),
                        ws_name.clone(),
                        ide_name.clone(),
                        true,
                        Some(parent_session_id.clone()),
                        agent_type,
                        agent_description,
                        meta_model,
                        meta_thinking_level,
                        sub_pid,
                        false, // subagents are never pid_precise: stop parent instead
                    ) {
                        sessions.push(info);
                    }
                }
            }
        }
    }

    // Promote main sessions to Delegating if they have at least one active subagent.
    let active_parent_ids: std::collections::HashSet<String> = sessions
        .iter()
        .filter(|s| {
            s.is_subagent
                && matches!(
                    s.status,
                    SessionStatus::Thinking
                        | SessionStatus::Executing
                        | SessionStatus::Streaming
                        | SessionStatus::Delegating
                        | SessionStatus::Processing
                        | SessionStatus::WaitingInput
                )
        })
        .filter_map(|s| s.parent_session_id.clone())
        .collect();

    for session in &mut sessions {
        if !session.is_subagent
            && session.parent_session_id.is_none()
            && active_parent_ids.contains(&session.id)
            && matches!(
                session.status,
                SessionStatus::Active | SessionStatus::Idle | SessionStatus::WaitingInput | SessionStatus::Processing
            )
        {
            session.status = SessionStatus::Delegating;
        }
    }

    // Sort: active first, then by created_at_ms asc (oldest first = stable order)
    sessions.sort_by(|a, b| {
        let a_active = matches!(
            a.status,
            SessionStatus::Thinking
                | SessionStatus::Executing
                | SessionStatus::Streaming
                | SessionStatus::Delegating
                | SessionStatus::Processing
                | SessionStatus::WaitingInput
        );
        let b_active = matches!(
            b.status,
            SessionStatus::Thinking
                | SessionStatus::Executing
                | SessionStatus::Streaming
                | SessionStatus::Delegating
                | SessionStatus::Processing
                | SessionStatus::WaitingInput
        );
        b_active
            .cmp(&a_active)
            .then(a.created_at_ms.cmp(&b.created_at_ms))
    });

    sessions
}
