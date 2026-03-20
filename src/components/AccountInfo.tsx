import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./AccountInfo.module.css";

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UsageStats {
  utilization: number; // 0–1 fraction
  resets_at: string;
  prev_utilization: number | null;
}

interface AccountInfoData {
  email: string;
  full_name: string;
  organization_name: string;
  plan: string;
  auth_method: string;
  five_hour: UsageStats | null;
  seven_day: UsageStats | null;
  seven_day_sonnet: UsageStats | null;
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function formatResetIn(resets_at: string, t: TFunc): string {
  const diff = new Date(resets_at).getTime() - Date.now();
  if (diff <= 0) return t("account.resets_soon");
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return t("account.resets_days", { n: d });
  if (h >= 1) return t("account.resets_hours", { n: h });
  const m = Math.floor(diff / 60000);
  return t("account.resets_mins", { n: m });
}

function formatLastUpdated(ts: number | null, t: TFunc): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 5000) return t("account.updated_just_now");
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("account.updated_s_ago", { n: Math.floor(diff / 1000) });
  return t("account.updated", { n: m });
}

function UsageBar({
  label,
  stats,
}: {
  label: string;
  stats: UsageStats | null;
}) {
  const { t } = useTranslation();
  if (!stats) return null;
  const pct = Math.round(stats.utilization * 100);
  const prev =
    stats.prev_utilization !== null && stats.prev_utilization !== undefined
      ? Math.round(stats.prev_utilization * 100)
      : null;

  let trend: "faster" | "slower" | "similar" | null = null;
  if (prev !== null) {
    const diff = pct - prev;
    if (diff > 5) trend = "faster";
    else if (diff < -5) trend = "slower";
    else trend = "similar";
  }

  return (
    <div className={styles.usage_item}>
      <div className={styles.usage_header}>
        <span className={styles.usage_label}>{label}</span>
        <span
          className={styles.usage_pct}
          title={t("account.tooltip_current")}
        >
          {pct}%
        </span>
      </div>
      <div className={styles.bar_track}>
        <div
          className={styles.bar_fill}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {prev !== null && (
          <div
            className={styles.bar_prev_marker}
            style={{ left: `${Math.min(prev, 100)}%` }}
          />
        )}
      </div>
      <div className={styles.usage_footer}>
        <span className={styles.usage_reset}>
          {t("account.resets_in", { t: formatResetIn(stats.resets_at, t) })}
        </span>
        {prev !== null && trend !== null && (
          <span
            className={`${styles.usage_prev} ${styles[`trend_${trend}`]}`}
            title={t("account.tooltip_prev", {
              n: prev,
              trend: t(`account.trend_${trend}`),
            })}
          >
            {trend === "faster" ? "↑" : trend === "slower" ? "↓" : "≈"}{" "}
            {prev}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cursor account types ──────────────────────────────────────────────────────

interface CursorDailyStats {
  date: string;
  tabSuggestedLines: number;
  tabAcceptedLines: number;
  composerSuggestedLines: number;
  composerAcceptedLines: number;
}

interface CursorUsageItem {
  name: string;
  used: number;
  limit: number | null;
  resetsAt: string | null;
}

interface CursorAccountInfoData {
  email: string;
  signUpType: string;
  membershipType: string;
  subscriptionStatus: string;
  totalPrompts: number;
  dailyStats: CursorDailyStats[];
  usage: CursorUsageItem[];
}

interface DetectedTools {
  cli: boolean;
  vscode: boolean;
  jetbrains: boolean;
  desktop: boolean;
  cursor: boolean;
}

interface SetupStatus {
  detected_tools: DetectedTools;
  [key: string]: unknown;
}

type AccountTab = "claude" | "cursor";

// ── Claude Code tab ──────────────────────────────────────────────────────────

function ClaudeCodeTab() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AccountInfoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<AccountInfoData>("get_account_info");
      setInfo(data);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(String(e));
      if (!logPath) {
        invoke<string>("get_log_path").then(setLogPath).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = autoRefresh ? setInterval(load, AUTO_REFRESH_INTERVAL_MS) : null;
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh]);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {loading && <p className={styles.dim}>{t("account.loading")}</p>}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          {logPath && <p className={styles.log_hint}>{t("account.debug_log", { path: logPath })}</p>}
          <button className={styles.retry} onClick={load}>{t("account.retry")}</button>
        </div>
      )}
      {info && (
        <>
          <section className={styles.section}>
            <div className={styles.section_title}>{t("account.title")}</div>
            <Row label={t("account.auth")} value="Claude AI" />
            <Row label={t("account.email")} value={info.email} />
            <Row label={t("account.org")} value={info.organization_name} />
            <Row label={t("account.plan")} value={info.plan} />
          </section>
          <section className={styles.section}>
            <div className={styles.section_title}>{t("account.usage")}</div>
            <UsageBar label={t("account.five_hour")} stats={info.five_hour} />
            <UsageBar label={t("account.seven_day")} stats={info.seven_day} />
            <UsageBar label={t("account.seven_day_sonnet")} stats={info.seven_day_sonnet} />
          </section>
        </>
      )}
      <div className={styles.footer}>
        {lastUpdated && !loading && (
          <span className={styles.last_updated}>{formatLastUpdated(lastUpdated, t)}</span>
        )}
        <div className={styles.footer_actions}>
          <label className={styles.auto_toggle}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            {t("account.auto_5m")}
          </label>
          <button className={styles.refresh} onClick={load} disabled={loading} title={t("account.refresh_now")}>↻</button>
        </div>
      </div>
    </>
  );
}

// ── Cursor tab ───────────────────────────────────────────────────────────────

function CursorUsageBar({ item }: { item: CursorUsageItem }) {
  const { t } = useTranslation();
  const pct = item.limit ? Math.round((item.used / item.limit) * 100) : null;

  return (
    <div className={styles.usage_item}>
      <div className={styles.usage_header}>
        <span className={styles.usage_label}>{item.name}</span>
        <span className={styles.usage_pct}>
          {item.limit ? `${item.used} / ${item.limit}` : item.used.toLocaleString()}
        </span>
      </div>
      {pct !== null && (
        <div className={styles.bar_track}>
          <div
            className={styles.bar_fill}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {item.resetsAt && (
        <div className={styles.usage_footer}>
          <span className={styles.usage_reset}>
            {t("account.resets_in", { t: formatResetIn(item.resetsAt, t) })}
          </span>
        </div>
      )}
    </div>
  );
}

function CursorTab() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<CursorAccountInfoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CursorAccountInfoData>("get_cursor_account_info");
      setInfo(data);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = autoRefresh ? setInterval(load, AUTO_REFRESH_INTERVAL_MS) : null;
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh]);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {loading && <p className={styles.dim}>{t("account.loading")}</p>}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          <button className={styles.retry} onClick={load}>{t("account.retry")}</button>
        </div>
      )}
      {info && (
        <>
          <section className={styles.section}>
            <div className={styles.section_title}>{t("account.title")}</div>
            <Row label={t("account.email")} value={info.email} />
            <Row label={t("account.cursor_plan")} value={info.membershipType || "—"} />
            <Row label={t("account.cursor_status")} value={info.subscriptionStatus || "—"} />
            <Row label={t("account.cursor_sign_up")} value={info.signUpType || "—"} />
            <Row label={t("account.cursor_prompts")} value={info.totalPrompts.toLocaleString()} />
          </section>
          {info.usage.length > 0 && (
            <section className={styles.section}>
              <div className={styles.section_title}>{t("account.usage")}</div>
              {info.usage.map((item) => (
                <CursorUsageBar key={item.name} item={item} />
              ))}
            </section>
          )}
          {info.dailyStats.length > 0 && (
            <section className={styles.section}>
              <div className={styles.section_title}>{t("account.cursor_daily_title")}</div>
              <table className={styles.stats_table}>
                <thead>
                  <tr>
                    <th>{t("account.cursor_col_date")}</th>
                    <th>{t("account.cursor_col_tab")}</th>
                    <th>{t("account.cursor_col_composer")}</th>
                  </tr>
                </thead>
                <tbody>
                  {info.dailyStats.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td title={t("account.cursor_suggested_accepted")}>
                        {d.tabSuggestedLines}/{d.tabAcceptedLines}
                      </td>
                      <td title={t("account.cursor_suggested_accepted")}>
                        {d.composerSuggestedLines}/{d.composerAcceptedLines}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      <div className={styles.footer}>
        {lastUpdated && !loading && (
          <span className={styles.last_updated}>{formatLastUpdated(lastUpdated, t)}</span>
        )}
        <div className={styles.footer_actions}>
          <label className={styles.auto_toggle}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            {t("account.auto_5m")}
          </label>
          <button className={styles.refresh} onClick={load} disabled={loading} title={t("account.refresh_now")}>↻</button>
        </div>
      </div>
    </>
  );
}

// ── Main AccountInfo panel ───────────────────────────────────────────────────

export function AccountInfo() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<AccountTab>("claude");
  const [mountedTabs, setMountedTabs] = useState<Set<AccountTab>>(new Set(["claude"]));
  const [isMacOS, setIsMacOS] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [cliInstallState, setCliInstallState] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [cliInstallMsg, setCliInstallMsg] = useState<string | null>(null);
  const [hasClaude, setHasClaude] = useState(true);
  const [hasCursor, setHasCursor] = useState(false);

  useEffect(() => {
    invoke<string>("get_platform").then((p) => setIsMacOS(p === "macos"));
    invoke<SetupStatus>("check_setup_status").then((s) => {
      const tools = s.detected_tools;
      const claude = tools.cli || tools.vscode || tools.jetbrains || tools.desktop;
      setHasClaude(claude);
      setHasCursor(tools.cursor);
      // If only Cursor is detected, switch default tab
      if (!claude && tools.cursor) {
        setActiveTab("cursor");
        setMountedTabs(new Set(["cursor"]));
      }
    }).catch(() => {});
  }, []);

  async function installCLI() {
    setCliInstallState("installing");
    setCliInstallMsg(null);
    try {
      const path = await invoke<string>("install_fleet_cli");
      setCliInstallState("done");
      setCliInstallMsg(t("account.cli_installed", { path }));
    } catch (e) {
      setCliInstallState("error");
      setCliInstallMsg(String(e));
    }
  }

  return (
    <div className={styles.container}>
      <button
        className={styles.toggle}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.toggle_label}>{t("account.panel_title")}</span>
        <span className={styles.toggle_icon}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className={styles.panel}>
          {/* Tab bar — only show if multiple tools detected */}
          {hasClaude && hasCursor && (
            <div className={styles.tab_bar}>
              <button
                className={`${styles.tab_btn} ${activeTab === "claude" ? styles.tab_active : ""}`}
                onClick={() => { setActiveTab("claude"); setMountedTabs((s) => new Set(s).add("claude")); }}
              >
                Claude Code
              </button>
              <button
                className={`${styles.tab_btn} ${activeTab === "cursor" ? styles.tab_active : ""}`}
                onClick={() => { setActiveTab("cursor"); setMountedTabs((s) => new Set(s).add("cursor")); }}
              >
                Cursor
              </button>
            </div>
          )}

          {/* Tab content — lazy-mount on first visit, then keep alive via CSS display */}
          {hasClaude && (
            <div style={{ display: activeTab === "claude" ? undefined : "none" }}>
              {mountedTabs.has("claude") && <ClaudeCodeTab />}
            </div>
          )}
          {hasCursor && (
            <div style={{ display: activeTab === "cursor" ? undefined : "none" }}>
              {mountedTabs.has("cursor") && <CursorTab />}
            </div>
          )}

          <div className={styles.cli_section}>
            <button
              className={styles.cli_install_btn}
              onClick={() => setShowAiModal(true)}
              title={t("account.ai_btn_hint")}
            >
              {t("account.ai_btn")}
            </button>
          </div>
        </div>
      )}
      {showAiModal && (
        <AiSetupModal
          onClose={() => setShowAiModal(false)}
          isMacOS={isMacOS}
          cliInstallState={cliInstallState}
          cliInstallMsg={cliInstallMsg}
          onInstallCLI={installCLI}
        />
      )}
    </div>
  );
}

// ── AI Setup Modal ────────────────────────────────────────────────────────────

interface DetectedTool {
  name: string;
  skill_path: string;
}

interface SkillInstallResult {
  installed: DetectedTool[];
  errors: string[];
}

interface AiSetupModalProps {
  onClose: () => void;
  isMacOS: boolean;
  cliInstallState: "idle" | "installing" | "done" | "error";
  cliInstallMsg: string | null;
  onInstallCLI: () => void;
}

function AiSetupModal({ onClose, isMacOS, cliInstallState, cliInstallMsg, onInstallCLI }: AiSetupModalProps) {
  const { t } = useTranslation();
  const [detectedTools, setDetectedTools] = useState<DetectedTool[] | null>(null);
  const [skillState, setSkillState] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [installResult, setInstallResult] = useState<SkillInstallResult | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Detect tools on mount
  useEffect(() => {
    invoke<DetectedTool[]>("detect_ai_tools")
      .then(setDetectedTools)
      .catch(() => setDetectedTools([]));
  }, []);

  async function saveSkillFile() {
    setSaveMsg(null);
    try {
      const path = await invoke<string>("save_skill_file");
      setSaveMsg(path);
    } catch (e) {
      if (String(e) !== "cancelled") setSaveMsg("✗ " + String(e));
    }
  }

  async function installSkill() {
    setSkillState("installing");
    try {
      const result = await invoke<SkillInstallResult>("install_fleet_skill");
      setInstallResult(result);
      setSkillState(result.installed.length > 0 ? "done" : "error");
    } catch (e) {
      setInstallResult({ installed: [], errors: [String(e)] });
      setSkillState("error");
    }
  }

  const noToolsDetected = detectedTools !== null && detectedTools.length === 0;

  return (
    <div className={styles.modal_overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modal_header}>
          <span className={styles.modal_icon}>🤖</span>
          <h3 className={styles.modal_title}>{t("account.ai_modal_title")}</h3>
        </div>
        <p className={styles.modal_desc}>{t("account.ai_modal_desc")}</p>

        {/* Step 1: CLI in PATH */}
        <div className={styles.modal_step}>
          <div className={styles.step_label}>
            <span className={styles.step_num}>1</span>
            <span className={styles.step_title}>{t("account.ai_step1_title")}</span>
          </div>
          <p className={styles.step_desc}>{t("account.ai_step1_desc")}</p>
          {isMacOS ? (
            <div className={styles.step_action}>
              <button
                className={styles.step_btn}
                onClick={onInstallCLI}
                disabled={cliInstallState === "installing" || cliInstallState === "done"}
              >
                {cliInstallState === "installing"
                  ? t("account.cli_installing")
                  : cliInstallState === "done"
                  ? "✓ " + t("account.cli_installed_btn")
                  : t("account.cli_install_btn")}
              </button>
              {cliInstallMsg && (
                <span className={cliInstallState === "done" ? styles.step_ok : styles.step_err}>
                  {cliInstallMsg}
                </span>
              )}
            </div>
          ) : (
            <p className={styles.step_hint}>{t("account.ai_step1_other")}</p>
          )}
        </div>

        {/* Step 2: Install skill */}
        <div className={styles.modal_step}>
          <div className={styles.step_label}>
            <span className={styles.step_num}>2</span>
            <span className={styles.step_title}>{t("account.ai_step2_title")}</span>
          </div>
          <p className={styles.step_desc}>{t("account.ai_step2_desc")}</p>

          {/* Results after install */}
          {installResult && (
            <div className={styles.tool_list}>
              {installResult.installed.map((tool) => (
                <div key={tool.name} className={styles.tool_row}>
                  <span className={styles.step_ok}>✓ {tool.name}</span>
                  <span className={styles.tool_path}>{tool.skill_path}</span>
                </div>
              ))}
              {installResult.errors.map((err, i) => (
                <p key={i} className={styles.step_err}>{err}</p>
              ))}
            </div>
          )}

          {!installResult && noToolsDetected && (
            <p className={styles.step_hint}>{t("account.ai_no_tools")}</p>
          )}

          <div className={styles.step_action}>
            <button
              className={styles.step_btn}
              onClick={installSkill}
              disabled={noToolsDetected || skillState === "installing" || skillState === "done"}
            >
              {skillState === "installing"
                ? t("account.ai_skill_installing")
                : skillState === "done"
                ? "✓ " + t("account.ai_skill_installed_btn")
                : t("account.ai_skill_install_btn")}
            </button>
            <button className={styles.step_btn_secondary} onClick={saveSkillFile}>
              {t("account.ai_skill_save_btn")}
            </button>
          </div>
          {saveMsg && (
            <span className={saveMsg.startsWith("✗") ? styles.step_err : styles.step_ok}>
              {saveMsg.startsWith("✗") ? saveMsg : "✓ " + saveMsg}
            </span>
          )}
        </div>

        <div className={styles.modal_footer}>
          <button className={styles.modal_close_btn} onClick={onClose}>
            {t("account.ai_modal_close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.row_label}>{label}</span>
      <span className={styles.row_value}>{value}</span>
    </div>
  );
}
