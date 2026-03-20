import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import type { SessionInfo, SessionStatus } from "../types";
import styles from "./SessionCard.module.css";

// ── Subagent type icon ────────────────────────────────────────────────────────

export function SubagentTypeIcon({ type }: { type: string | null }) {
  switch (type?.toLowerCase()) {
    case "explore":
      // Magnifying glass
      return (
        <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <circle cx="5" cy="5" r="3.5" />
          <line x1="7.5" y1="7.5" x2="11" y2="11" />
        </svg>
      );
    case "plan":
      // Clipboard / blueprint
      return (
        <svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor" aria-hidden>
          <rect x="1.5" y="2" width="9" height="9.5" rx="1.2" opacity="0.25" />
          <rect x="1.5" y="2" width="9" height="9.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="4" y1="5.5" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="7.5" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <rect x="3.5" y="1" width="5" height="2" rx="0.8" fill="currentColor" />
        </svg>
      );
    case "general-purpose":
      // Wrench
      return (
        <svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor" aria-hidden>
          <path d="M9.5 1.5 C8 1.5 7 2.5 7 4 C7 4.3 7.05 4.6 7.1 4.85 L1.8 10.15 C1.5 10.45 1.5 10.9 1.8 11.2 C2.1 11.5 2.55 11.5 2.85 11.2 L8.15 5.9 C8.4 5.95 8.7 6 9 6 C10.5 6 11.5 5 11.5 3.5 C11.5 3.1 11.4 2.75 11.25 2.45 L9.7 4 L8.8 3.1 L10.35 1.55 C10.05 1.4 9.8 1.5 9.5 1.5Z" />
        </svg>
      );
    case "claude-code-guide":
      // Open book
      return (
        <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
          <path d="M6 10.5 C6 10.5 3 9 1 9.5 L1 2.5 C3 2 6 3.5 6 3.5" fill="currentColor" fillOpacity="0.15" />
          <path d="M6 10.5 C6 10.5 9 9 11 9.5 L11 2.5 C9 2 6 3.5 6 3.5" fill="currentColor" fillOpacity="0.15" />
          <path d="M6 3.5 L6 10.5" />
          <path d="M1 2.5 C3 2 6 3.5 6 3.5 C6 3.5 9 2 11 2.5 L11 9.5 C9 9 6 10.5 6 10.5 C6 10.5 3 9 1 9.5 Z" />
        </svg>
      );
    default:
      // Diamond — unknown type
      return <span aria-hidden>⎇</span>;
  }
}

// ── Status icon ───────────────────────────────────────────────────────────────

export function StatusIcon({ status }: { status: SessionStatus }) {
  switch (status) {
    case "thinking":
      // Chat bubble "..." — "hmm, let me think..."
      return (
        <svg className={`${styles.sicon} ${styles.sicon_thinking}`} viewBox="0 0 14 12" fill="currentColor" aria-hidden>
          <rect x="0.5" y="0.5" width="13" height="8" rx="2.5" opacity="0.2" />
          <path d="M3.5 8.5 L2 11 L6 8.5" opacity="0.2" />
          <circle cx="4"  cy="4.5" r="1.3" />
          <circle cx="7"  cy="4.5" r="1.3" />
          <circle cx="10" cy="4.5" r="1.3" />
        </svg>
      );
    case "executing":
      // Lightning bolt — "⚡ on it!"
      return (
        <svg className={`${styles.sicon} ${styles.sicon_executing}`} viewBox="0 0 10 14" fill="currentColor" aria-hidden>
          <polygon points="6.5,0 1.5,8 5,8 3.5,14 8.5,6 5,6" />
        </svg>
      );
    case "streaming":
      // Sound equalizer bars — writing/speaking
      return (
        <svg className={`${styles.sicon} ${styles.sicon_streaming}`} viewBox="0 0 10 8" fill="currentColor" aria-hidden>
          <rect className={styles.bar1} x="0" y="3" width="2" height="5" rx="1" />
          <rect className={styles.bar2} x="4" y="0" width="2" height="8" rx="1" />
          <rect className={styles.bar3} x="8" y="2" width="2" height="6" rx="1" />
        </svg>
      );
    case "processing":
      // Clock face with spinning hand — "ticking away..."
      return (
        <svg className={styles.sicon} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
          <circle cx="5" cy="5" r="4" strokeWidth="1.5" />
          <line className={styles.clock_hand} x1="5" y1="5" x2="5" y2="2" strokeWidth="1.8" />
        </svg>
      );
    case "waitingInput":
      // Question mark bouncing — "what should I do next?"
      return (
        <svg className={`${styles.sicon} ${styles.sicon_question}`} viewBox="0 0 8 12" fill="currentColor" aria-hidden>
          <path d="M1.5 2.8 Q1.5 0.5 4 0.5 Q6.5 0.5 6.5 2.8 Q6.5 4.8 4 6 L4 7.8"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="4" cy="10.5" r="1.1" />
        </svg>
      );
    case "active":
      // Beating heart — "alive and ready"
      return (
        <svg className={`${styles.sicon} ${styles.sicon_heart}`} viewBox="0 0 10 9" fill="currentColor" aria-hidden>
          <path d="M5 8.5 C1 5.5 0 3 0 2 C0 0.5 1.2 0 2.5 0.5 C3.5 0.9 5 2 5 2 C5 2 6.5 0.9 7.5 0.5 C8.8 0 10 0.5 10 2 C10 3 9 5.5 5 8.5Z" />
        </svg>
      );
    case "delegating":
      // Node broadcasting — sending work out
      return (
        <svg className={`${styles.sicon} ${styles.sicon_delegating}`} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="2.5" cy="5"   r="1.5" fill="currentColor" stroke="none" />
          <line   x1="4"  y1="5"   x2="6.5" y2="2.5" className={styles.del_line1} />
          <line   x1="4"  y1="5"   x2="6.5" y2="7.5" className={styles.del_line2} />
          <circle cx="8"  cy="2.5" r="1.5" fill="currentColor" stroke="none" className={styles.del_node1} />
          <circle cx="8"  cy="7.5" r="1.5" fill="currentColor" stroke="none" className={styles.del_node2} />
        </svg>
      );
    case "idle":
      // Floating Zzz — "taking a nap..."
      return (
        <svg className={`${styles.sicon} ${styles.sicon_idle_zzz}`} viewBox="0 0 14 12"
             fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path className={styles.z1} d="M1 9.5 L5.5 9.5 L1 12 L5.5 12"   strokeWidth="1.6" />
          <path className={styles.z2} d="M5 5.5 L8.5 5.5 L5 7.8 L8.5 7.8" strokeWidth="1.4" />
          <path className={styles.z3} d="M8 2 L11 2 L8 4 L11 4"            strokeWidth="1.2" />
        </svg>
      );
  }
}

// ── Status badge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
      <StatusIcon status={status} />
      {t(`status.${status}`)}
    </span>
  );
}

// ── Token speed ───────────────────────────────────────────────────────────────

function TokenSpeed({ speed }: { speed: number }) {
  const { t } = useTranslation();
  if (speed < 0.5) return null;
  return (
    <span className={styles.speed} title={t("card.tip_speed")}>
      {speed.toFixed(1)} <span className={styles.speed_unit}>{t("tok_s")}</span>
    </span>
  );
}

// ── Time ago ──────────────────────────────────────────────────────────────────

function TimeAgo({ ms }: { ms: number }) {
  const { t } = useTranslation();
  const diff = Date.now() - ms;
  let label: string;
  if (diff < 60_000) label = t("just_now");
  else if (diff < 3_600_000) label = t("m_ago", { n: Math.floor(diff / 60_000) });
  else if (diff < 86_400_000) label = t("h_ago", { n: Math.floor(diff / 3_600_000) });
  else label = t("d_ago", { n: Math.floor(diff / 86_400_000) });
  return <span className={styles.time} title={new Date(ms).toLocaleString()}>{label}</span>;
}

// ── Model name formatter ──────────────────────────────────────────────────────

export function formatModel(model: string): string {
  // e.g. "claude-opus-4-5-20251101" → "Opus 4.5"
  //      "claude-sonnet-4-6"        → "Sonnet 4.6"
  //      "claude-haiku-4-5-20251001"→ "Haiku 4.5"
  const m = model.match(/claude-(\w+)-([\d]+)-([\d]+)/);
  if (m) {
    const name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return `${name} ${m[2]}.${m[3]}`;
  }
  return model;
}

// ── SessionCard ───────────────────────────────────────────────────────────────

interface Props {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  variant?: "default" | "group-main";
  hideHeader?: boolean;
}

export function SessionCard({ session, isSelected, onClick, variant, hideHeader }: Props) {
  const { t } = useTranslation();
  const isActive = ["thinking", "executing", "streaming", "processing", "waitingInput", "delegating"].includes(
    session.status
  );
  const [killing, setKilling] = useState(false);

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session.pid || killing) return;

    if (session.pidPrecise) {
      const confirmed = window.confirm(t("stop_confirm", { name: session.workspaceName }));
      if (!confirmed) return;
      setKilling(true);
      try {
        await invoke("kill_session", { pid: session.pid });
      } finally {
        setKilling(false);
      }
    } else {
      const confirmed = window.confirm(
        t("stop_imprecise_confirm", { workspace: session.workspaceName })
      );
      if (!confirmed) return;
      setKilling(true);
      try {
        await invoke("kill_workspace_sessions", { workspacePath: session.workspacePath });
      } finally {
        setKilling(false);
      }
    }
  };

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.selected : ""} ${isActive ? styles.active : ""} ${variant === "group-main" ? styles.group_main : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Header row */}
      <div className={`${styles.header} ${hideHeader ? styles.header_compact : ""}`}>
        {!hideHeader && <span className={styles.workspace}>{session.workspaceName}</span>}
        {!hideHeader && <StatusBadge status={session.status} />}
        {isActive && session.pid !== null && !session.isSubagent && (
          <button
            className={`${styles.stop_btn} ${killing ? styles.stop_btn_killing : ""} ${!session.pidPrecise ? styles.stop_btn_warn : ""}`}
            onClick={handleStop}
            title={session.pidPrecise ? t("stop_session") : t("stop_session_imprecise")}
            disabled={killing}
          >
            ■
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className={styles.meta}>
        {session.isSubagent ? (
          <span className={styles.tag_subagent} title={session.agentType ?? t("subagent")}>
            <SubagentTypeIcon type={session.agentType} />
          </span>
        ) : (
          <span className={styles.tag_main} title={t("card.tip_main")}>◈ {t("main")}</span>
        )}
        {session.ideName && (
          <span className={styles.tag_ide} title={t("card.tip_ide", { name: session.ideName })}>{session.ideName}</span>
        )}
        {session.model && (
          <span className={styles.tag_model} title={t("card.tip_model", { model: session.model })}>{formatModel(session.model)}</span>
        )}
        {session.thinkingLevel && session.thinkingLevel !== "medium" && (
          <span className={styles.tag_thinking} title={t("card.tip_thinking", { level: session.thinkingLevel })}>
            <svg viewBox="0 0 8 11" width="9" height="9" fill="currentColor" aria-hidden>
              <path d="M4 0.5 C1.2 0.5 0.5 2.8 0.5 4.5 C0.5 6.3 1.8 7.4 2.3 8 L2.3 9.3 L5.7 9.3 L5.7 8 C6.2 7.4 7.5 6.3 7.5 4.5 C7.5 2.8 6.8 0.5 4 0.5Z" />
              <line x1="2.5" y1="9.7" x2="5.5" y2="9.7" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="3"   y1="10.5" x2="5"  y2="10.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {session.lastSkill && (
          <span className={styles.tag_skill} title={t("card.tip_skill", { skill: session.lastSkill })}>/{session.lastSkill}</span>
        )}
        {session.slug && (
          <span className={styles.slug} title={t("card.tip_slug", { slug: session.slug })}>{session.slug}</span>
        )}
      </div>

      {/* AI Title (main session) or agent description (subagent) */}
      {(session.aiTitle || (session.isSubagent && session.agentDescription)) && (
        <p className={styles.ai_title} title={session.aiTitle ?? session.agentDescription ?? undefined}>
          {session.aiTitle ?? session.agentDescription}
        </p>
      )}

      {/* Preview */}
      {session.lastMessagePreview && (
        <p className={styles.preview} title={session.lastMessagePreview}>{session.lastMessagePreview}</p>
      )}

      {/* Footer row */}
      <div className={styles.footer}>
        <TokenSpeed speed={session.tokenSpeed} />
        <span className={styles.tokens} title={t("card.tip_tokens")}>
          {session.totalOutputTokens.toLocaleString()} {t("tokens")}
        </span>
        <TimeAgo ms={session.lastActivityMs} />
      </div>
    </div>
  );
}
