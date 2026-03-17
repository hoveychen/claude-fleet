import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessionsStore } from "../store";
import type { SessionInfo, SessionStatus } from "../types";
import { InspectModal } from "./InspectModal";
import { SessionCard } from "./SessionCard";
import styles from "./GalleryView.module.css";

// ── Helpers ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: SessionStatus[] = [
  "streaming", "processing", "waitingInput", "active", "delegating",
];

function isActive(s: SessionInfo) {
  return ACTIVE_STATUSES.includes(s.status);
}

// ── GalleryRow: one main agent with nested subagents ──────────────────────

interface RowProps {
  main: SessionInfo;
  subagents: SessionInfo[];
  onSelect: (s: SessionInfo) => void;
}

function GalleryRow({ main, subagents, onSelect }: RowProps) {
  return (
    <div className={`${styles.row} ${isActive(main) ? styles.row_active : ""}`}>
      {/* Main card */}
      <div className={styles.main_card} onClick={() => onSelect(main)}>
        <SessionCard session={main} isSelected={false} onClick={() => onSelect(main)} />
      </div>

      {/* Subagent cards */}
      {subagents.length > 0 && (
        <div className={styles.subagents}>
          {subagents.map((sub) => (
            <div key={sub.jsonlPath} className={styles.sub_card} onClick={() => onSelect(sub)}>
              <SessionCard session={sub} isSelected={false} onClick={() => onSelect(sub)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helper: build rows from a flat session list ───────────────────────────

function buildRows(
  sessions: SessionInfo[],
  onSelect: (s: SessionInfo) => void
) {
  const mains = sessions.filter((s) => !s.isSubagent);
  const subByParent = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    if (s.isSubagent && s.parentSessionId) {
      const arr = subByParent.get(s.parentSessionId) ?? [];
      arr.push(s);
      subByParent.set(s.parentSessionId, arr);
    }
  }
  const orphans = sessions.filter(
    (s) =>
      s.isSubagent &&
      (!s.parentSessionId || !mains.find((m) => m.id === s.parentSessionId))
  );

  const sortedMains = [
    ...mains.filter(isActive),
    ...mains.filter((s) => !isActive(s)),
  ];

  return (
    <>
      {sortedMains.map((main) => (
        <GalleryRow
          key={main.jsonlPath}
          main={main}
          subagents={subByParent.get(main.id) ?? []}
          onSelect={onSelect}
        />
      ))}
      {orphans.map((s) => (
        <div key={s.jsonlPath} className={styles.orphan_card} onClick={() => onSelect(s)}>
          <SessionCard session={s} isSelected={false} onClick={() => onSelect(s)} />
        </div>
      ))}
    </>
  );
}

// ── GalleryView ───────────────────────────────────────────────────────────

export function GalleryView() {
  const { t } = useTranslation();
  const sessions = useSessionsStore((s) => s.sessions);
  const [inspecting, setInspecting] = useState<SessionInfo | null>(null);
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Promote idle main sessions that have active subagents → delegating
  const activeSubagentParentIds = new Set(
    sessions
      .filter(
        (s) =>
          s.isSubagent &&
          s.parentSessionId &&
          ACTIVE_STATUSES.includes(s.status)
      )
      .map((s) => s.parentSessionId!)
  );
  const promoted = sessions.map((s) =>
    !s.isSubagent && s.status === "idle" && activeSubagentParentIds.has(s.id)
      ? { ...s, status: "delegating" as const }
      : s
  );

  const activeSessions = promoted.filter(isActive);

  // Filter source: active only or all sessions
  const filterSource = showAll ? promoted : activeSessions;

  const filtered = filter
    ? filterSource.filter((s) => {
        const q = filter.toLowerCase();
        return (
          s.workspaceName.toLowerCase().includes(q) ||
          s.slug?.toLowerCase().includes(q) ||
          s.agentDescription?.toLowerCase().includes(q) ||
          s.ideName?.toLowerCase().includes(q)
        );
      })
    : filterSource;

  // When showAll, split into active and recent groups
  const filteredActive = showAll ? filtered.filter(isActive) : filtered;
  const filteredRecent = showAll ? filtered.filter((s) => !isActive(s)) : [];

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder={t("filter_placeholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className={styles.count}>
          {activeSessions.length} {t("active")}
        </span>
        <button
          className={`${styles.toggle_btn} ${showAll ? styles.toggle_btn_active : ""}`}
          onClick={() => setShowAll((v) => !v)}
          title={showAll ? t("gallery_show_active") : t("gallery_show_all")}
        >
          {showAll ? t("gallery_show_active") : t("gallery_show_all")}
        </button>
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {showAll ? (
          <>
            {filteredActive.length > 0 && (
              <div className={styles.section}>
                <div className={styles.section_label}>{t("active")}</div>
                {buildRows(filteredActive, setInspecting)}
              </div>
            )}
            {filteredRecent.length > 0 && (
              <div className={styles.section}>
                <div className={styles.section_label}>{t("recent")}</div>
                {buildRows(filteredRecent, setInspecting)}
              </div>
            )}
            {filtered.length === 0 && (
              <p className={styles.empty}>{t("no_sessions")}</p>
            )}
          </>
        ) : (
          <>
            {buildRows(filteredActive, setInspecting)}
            {filteredActive.length === 0 && (
              <p className={styles.empty}>{t("no_sessions")}</p>
            )}
          </>
        )}
      </div>

      {/* Inspect modal */}
      {inspecting && (
        <InspectModal session={inspecting} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}
