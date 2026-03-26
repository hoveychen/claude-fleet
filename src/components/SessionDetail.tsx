import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDetailStore, useSessionsStore } from "../store";
import type { SessionInfo } from "../types";
import { MessageList } from "./MessageList";
import { SkillHistory } from "./SkillHistory";
import styles from "./SessionDetail.module.css";

const ACTIVE_STATUSES = new Set([
  "thinking", "executing", "streaming", "processing",
  "waitingInput", "active", "delegating",
]);

function shortId(id: string) {
  return id.slice(0, 8);
}

export function SessionDetail() {
  const { t } = useTranslation();
  const { session, messages, isLoading, close, open } = useDetailStore();
  const sessions = useSessionsStore((s) => s.sessions);

  // Build tabs: [mainSession, ...activeSubagents]
  // Show tabs only when viewing a main agent that has active subagents,
  // or when viewing a subagent (show sibling tabs + parent).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const checkFollow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsFollowing(dist < 200);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkFollow, { passive: true });
    return () => el.removeEventListener("scroll", checkFollow);
  }, [checkFollow, session]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const tabs = useMemo((): SessionInfo[] => {
    if (!session) return [];

    let mainSession: SessionInfo | undefined;
    let subagents: SessionInfo[];

    if (session.isSubagent && session.parentSessionId) {
      mainSession = sessions.find((s) => s.id === session.parentSessionId);
      subagents = sessions.filter(
        (s) => s.isSubagent && s.parentSessionId === session.parentSessionId
      );
    } else {
      mainSession = session;
      subagents = sessions.filter(
        (s) => s.isSubagent && s.parentSessionId === session.id
      );
    }

    const activeSubagents = subagents.filter((s) => ACTIVE_STATUSES.has(s.status));
    if (activeSubagents.length === 0) return [];

    return mainSession ? [mainSession, ...activeSubagents] : activeSubagents;
  }, [session, sessions]);

  return (
      <div className={`${styles.root} ${session ? styles.open : ""}`}>
        {session && (
          <>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.header_row}>
              <div className={styles.header_left}>
                <span className={styles.workspace}>{session.workspaceName}</span>
                {session.isSubagent ? (
                  <span className={styles.tag_subagent}>
                    ⎇ {session.agentType ?? t("subagent")}
                  </span>
                ) : (
                  <span className={styles.tag_main}>◈ {t("main")}</span>
                )}
                {session.slug && (
                  <span className={styles.slug}>{session.slug}</span>
                )}
              </div>
              <div className={styles.header_right}>
                {session.ideName && (
                  <span className={styles.ide}>{session.ideName}</span>
                )}
                <span className={styles.tokens}>
                  {session.totalOutputTokens.toLocaleString()} {t("tokens_out")}
                </span>
                {session.contextPercent != null && (
                  <span
                    className={`${styles.context} ${session.contextPercent >= 0.8 ? styles.context_high : ""}`}
                    title={t("card.tip_context", { percent: Math.round(session.contextPercent * 100) })}
                  >
                    ctx {Math.round(session.contextPercent * 100)}%
                  </span>
                )}
                <button className={styles.close_btn} onClick={close}>
                  ✕
                </button>
              </div>
            </div>
            {session.aiTitle && (
              <div className={styles.ai_title}>{session.aiTitle}</div>
            )}
          </div>

          {/* Subagent tabs */}
          {tabs.length > 0 && (
            <div className={styles.tab_bar}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.tab} ${tab.id === session.id ? styles.tab_active : ""}`}
                  onClick={() => { if (tab.id !== session.id) open(tab); }}
                >
                  <span
                    className={styles.tab_dot}
                    data-status={tab.status}
                  />
                  {tab.isSubagent
                    ? `⎇ ${tab.agentType ?? shortId(tab.id)}`
                    : `◈ ${t("main")}`}
                </button>
              ))}
            </div>
          )}

          {/* Path */}
          <div className={styles.path}>{session.workspacePath}</div>

          {/* Skill history */}
          <SkillHistory jsonlPath={session.jsonlPath} />

          {/* Messages */}
          <div ref={scrollRef} className={styles.scroll_area}>
            <MessageList messages={messages} isLoading={isLoading} />
          </div>

          {/* Auto-follow indicator */}
          {isFollowing ? (
            <div className={styles.follow_bar}>
              {t("detail.following")}
            </div>
          ) : (
            <button className={styles.follow_bar_btn} onClick={scrollToBottom}>
              ↓ {t("detail.scroll_to_latest")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
