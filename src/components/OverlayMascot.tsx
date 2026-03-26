/**
 * OverlayMascot — floating overlay window content.
 *
 * - Quip bubble OR alert cards above the frame (mutually exclusive)
 * - MascotEyes inside a rounded robot frame
 * - Status LED bar with labels
 * - Drag handle in bottom-right corner
 * - Double-click on frame opens main window
 * - Right-click hides overlay
 * - ResizeObserver for accurate window sizing
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { useSessionsStore, useWaitingAlertsStore } from "../store";
import type { WaitingAlert } from "../types";
import { MascotEyesCore } from "./MascotEyesCore";
import styles from "./OverlayMascot.module.css";

function timeAgo(ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return t("just_now");
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t("m_ago", { n: mins });
  const hours = Math.floor(mins / 60);
  return t("h_ago", { n: hours });
}

function OverlayAlertCard({
  alert,
  onDismiss,
  onClick,
}: {
  alert: WaitingAlert;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLeaving(true);
    setTimeout(onDismiss, 280);
  };

  return (
    <div
      className={`${styles.alertCard} ${leaving ? styles.alertCard_leaving : ""}`}
      onClick={onClick}
    >
      <div className={styles.alertDot} />
      <div className={styles.alertContent}>
        <div className={styles.alertWorkspace}>{alert.workspaceName}</div>
        <div className={styles.alertSummary}>{alert.summary}</div>
        <div className={styles.alertTime}>{timeAgo(alert.detectedAtMs, t)}</div>
      </div>
      <button className={styles.alertClose} onClick={handleDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

export function OverlayMascot() {
  const { t } = useTranslation();
  const sessions = useSessionsStore((s) => s.sessions);
  const { alerts, dismissedIds, dismiss } = useWaitingAlertsStore();
  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.sessionId));
  const hasAlerts = visibleAlerts.length > 0;

  const [quipText, setQuipText] = useState<string | null>(null);

  // Derive status counts — distinguish main vs sub-agent
  const busyStatuses = ["thinking", "executing", "streaming", "processing", "active", "delegating"];
  const mainSessions = sessions.filter((s) => !s.isSubagent);
  const subSessions = sessions.filter((s) => s.isSubagent);
  const mainBusyCount = mainSessions.filter((s) => busyStatuses.includes(s.status)).length;
  const subBusyCount = subSessions.filter((s) => busyStatuses.includes(s.status)).length;
  const waitingCount = mainSessions.filter((s) => s.status === "waitingInput").length;
  const totalSpeed = sessions.reduce((sum, s) => sum + s.tokenSpeed, 0);

  // Resize window to fit content via ResizeObserver
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const height = Math.ceil(el.scrollHeight) + 4; // small padding to prevent clipping
      getCurrentWindow().setSize(new LogicalSize(280, height)).catch(() => {});
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleDoubleClick = useCallback(() => {
    invoke("show_main_window").catch(() => {});
  }, []);

  const handleAlertClick = (alert: WaitingAlert) => {
    invoke("show_main_window").catch(() => {});
    invoke("open_session_from_overlay", { jsonlPath: alert.jsonlPath }).catch(() => {});
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    invoke("toggle_overlay", { visible: false }).catch(() => {});
    emit("overlay-disabled").catch(() => {});
  }, []);

  // Show at most 3 alerts, rest collapsed
  const shownAlerts = visibleAlerts.slice(0, 3);
  const moreCount = visibleAlerts.length - 3;

  // Show quip bubble only when there are no alerts
  const showQuip = !hasAlerts && !!quipText;

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Alert cards above the frame — only when there are alerts */}
      {hasAlerts && (
        <div className={styles.alertStack}>
          {shownAlerts.map((alert) => (
            <OverlayAlertCard
              key={alert.sessionId}
              alert={alert}
              onDismiss={() => dismiss(alert.sessionId)}
              onClick={() => handleAlertClick(alert)}
            />
          ))}
          {moreCount > 0 && (
            <div className={styles.alertMore}>
              +{moreCount} {t("overlay.more_alerts")}
            </div>
          )}
        </div>
      )}

      {/* Quip bubble above the frame — only when no alerts */}
      {showQuip && (
        <div className={styles.quipBubble}>
          <div className={styles.quipText}>{quipText}</div>
          <div className={styles.quipTail} />
        </div>
      )}

      {/* Robot frame */}
      <div
        className={styles.frame}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Screen area with mascot eyes */}
        <div className={styles.screen}>
          <MascotEyesCore onQuip={setQuipText} />
        </div>

        {/* Status LED bar with labels */}
        <div className={styles.statusBar}>
          {mainBusyCount > 0 && (
            <div className={styles.ledGroup}>
              <span className={`${styles.led} ${styles.ledActive}`} />
              <span className={styles.ledLabel}>
                {mainBusyCount} {t("overlay.led_busy")}
              </span>
            </div>
          )}
          {subBusyCount > 0 && (
            <div className={styles.ledGroup}>
              <span className={`${styles.led} ${styles.ledSub}`} />
              <span className={styles.ledLabel}>
                {subBusyCount} {t("overlay.led_sub")}
              </span>
            </div>
          )}
          {waitingCount > 0 && (
            <div className={styles.ledGroup}>
              <span className={`${styles.led} ${styles.ledWaiting}`} />
              <span className={styles.ledLabel}>
                {waitingCount} {t("overlay.led_waiting")}
              </span>
            </div>
          )}
          {totalSpeed > 0 && (
            <div className={styles.ledGroup}>
              <span className={styles.ledLabel}>
                {Math.round(totalSpeed)} {t("tok_s")}
              </span>
            </div>
          )}
          {sessions.length === 0 && (
            <span className={styles.ledLabel}>{t("overlay.no_agents")}</span>
          )}

          {/* Drag handle — bottom right */}
          <div className={styles.dragHandle} data-tauri-drag-region>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" opacity="0.4">
              <circle cx="6" cy="2" r="1" />
              <circle cx="9" cy="2" r="1" />
              <circle cx="3" cy="5" r="1" />
              <circle cx="6" cy="5" r="1" />
              <circle cx="9" cy="5" r="1" />
              <circle cx="6" cy="8" r="1" />
              <circle cx="9" cy="8" r="1" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
