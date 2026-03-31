import { invoke } from "@tauri-apps/api/core";
import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { RemoteConnection } from "./components/ConnectionDialog";
import type { AuditAlert, RawMessage, SessionInfo, WaitingAlert } from "./types";
import { getItem, setItem } from "./storage";

// ── Connection store ──────────────────────────────────────────────────────────

export type Connection =
  | { type: "local" }
  | { type: "remote"; connection: RemoteConnection };

interface ConnectionState {
  /** `null` = not yet connected (dialog is shown) */
  connection: Connection | null;
  setConnection: (conn: Connection) => void;
  disconnect: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connection: null,
  setConnection: (conn) => set({ connection: conn }),
  disconnect: async () => {
    await invoke("disconnect_remote").catch(() => {});
    useSessionsStore.getState().setScanReady(false);
    set({ connection: null });
  },
}));

// ── Theme store ───────────────────────────────────────────────────────────────

export type Theme = "dark" | "light" | "system";
export type ViewMode = "list" | "gallery" | "audit";

interface UIState {
  theme: Theme;
  viewMode: ViewMode;
  setTheme: (t: Theme) => void;
  setViewMode: (m: ViewMode) => void;
}

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): "dark" | "light" {
  return theme === "system" ? getSystemTheme() : theme;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (getItem("theme") as Theme) ?? "system",
  viewMode: (getItem("viewMode") as ViewMode) ?? "gallery",
  setTheme: (t) => {
    setItem("theme", t);
    emit("overlay-theme-changed", t).catch(() => {});
    set({ theme: t });
  },
  setViewMode: (m) => {
    setItem("viewMode", m);
    set({ viewMode: m });
  },
}));

// ── Sessions store ───────────────────────────────────────────────────────────

export interface SpeedSample {
  time: number;
  speed: number;
}

interface SessionsState {
  sessions: SessionInfo[];
  speedHistory: SpeedSample[];
  scanReady: boolean;
  setSessions: (sessions: SessionInfo[]) => void;
  setScanReady: (ready: boolean) => void;
  refresh: () => Promise<void>;
}

const MAX_SPEED_HISTORY = 60;

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  speedHistory: [],
  scanReady: false,
  setSessions: (sessions) =>
    set((state) => {
      const totalSpeed = sessions.reduce((sum, s) => sum + s.tokenSpeed, 0);
      const newSample: SpeedSample = { time: Date.now(), speed: totalSpeed };
      const speedHistory = [...state.speedHistory, newSample].slice(-MAX_SPEED_HISTORY);
      return { sessions, speedHistory };
    }),
  setScanReady: (ready) => set({ scanReady: ready }),
  refresh: async () => {
    const sessions = await invoke<SessionInfo[]>("list_sessions");
    useSessionsStore.getState().setSessions(sessions);
  },
}));

// ── Session detail store ─────────────────────────────────────────────────────

interface DetailState {
  session: SessionInfo | null;
  messages: RawMessage[];
  isLoading: boolean;
  open: (session: SessionInfo) => Promise<void>;
  close: () => Promise<void>;
  appendMessages: (msgs: RawMessage[]) => void;
}

let tailUnlisten: UnlistenFn | null = null;

export const useDetailStore = create<DetailState>((set, get) => ({
  session: null,
  messages: [],
  isLoading: false,

  open: async (session) => {
    await get().close();

    set({ session, messages: [], isLoading: true });

    const rawMessages = await invoke<RawMessage[]>("get_messages", {
      jsonlPath: session.jsonlPath,
    });

    await invoke("start_watching_session", { jsonlPath: session.jsonlPath });

    tailUnlisten = await listen<RawMessage[]>("session-tail", (event) => {
      get().appendMessages(event.payload);
    });

    set({ messages: rawMessages, isLoading: false });
  },

  close: async () => {
    if (tailUnlisten) {
      tailUnlisten();
      tailUnlisten = null;
    }
    await invoke("stop_watching_session");
    set({ session: null, messages: [], isLoading: false });
  },

  appendMessages: (msgs) => {
    set((state) => ({ messages: [...state.messages, ...msgs] }));
  },
}));

// ── Waiting alerts store ────────────────────────────────────────────────────

interface WaitingAlertsState {
  alerts: WaitingAlert[];
  /** Session IDs the user has acknowledged (dismissed) in this app session */
  dismissedIds: Set<string>;
  setAlerts: (alerts: WaitingAlert[]) => void;
  dismiss: (sessionId: string) => void;
  refresh: () => Promise<void>;
}

export const useWaitingAlertsStore = create<WaitingAlertsState>((set) => ({
  alerts: [],
  dismissedIds: new Set(),
  setAlerts: (alerts) => set({ alerts }),
  dismiss: (sessionId) =>
    set((state) => {
      const next = new Set(state.dismissedIds);
      next.add(sessionId);
      return { dismissedIds: next };
    }),
  refresh: async () => {
    const alerts = await invoke<WaitingAlert[]>("get_waiting_alerts");
    set({ alerts });
  },
}));

// ── Audit alerts store (critical event notifications) ───────────────────────

interface AuditAlertsState {
  alerts: AuditAlert[];
  dismissedKeys: Set<string>;
  addAlert: (alert: AuditAlert) => void;
  dismiss: (key: string) => void;
}

export const useAuditAlertsStore = create<AuditAlertsState>((set) => ({
  alerts: [],
  dismissedKeys: new Set(),
  addAlert: (alert) =>
    set((state) => {
      if (state.alerts.some((a) => a.key === alert.key)) return state;
      return { alerts: [...state.alerts, alert] };
    }),
  dismiss: (key) =>
    set((state) => {
      const next = new Set(state.dismissedKeys);
      next.add(key);
      return { dismissedKeys: next };
    }),
}));

// ── Audit read-state store ──────────────────────────────────────────────────

function auditEventKey(e: { sessionId: string; timestamp: string; toolName: string }): string {
  return `${e.sessionId}|${e.timestamp}|${e.toolName}`;
}

function loadReadKeys(): Set<string> {
  try {
    const raw = localStorage.getItem("audit-read-keys");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadKeys(keys: Set<string>) {
  localStorage.setItem("audit-read-keys", JSON.stringify([...keys]));
}

interface AuditState {
  readKeys: Set<string>;
  /** Count of unread critical events (updated when audit data is fetched) */
  unreadCriticalCount: number;
  /** All critical events from the last fetch */
  criticalEvents: Array<{ sessionId: string; timestamp: string; toolName: string }>;
  markAsRead: (key: string) => void;
  markAllCriticalAsRead: () => void;
  isRead: (e: { sessionId: string; timestamp: string; toolName: string }) => boolean;
  getEventKey: (e: { sessionId: string; timestamp: string; toolName: string }) => string;
  /** Called after fetching audit data to update critical event list & unread count */
  setCriticalEvents: (events: Array<{ sessionId: string; timestamp: string; toolName: string }>) => void;
}

export const useAuditStore = create<AuditState>((set, get) => ({
  readKeys: loadReadKeys(),
  unreadCriticalCount: 0,
  criticalEvents: [],
  markAsRead: (key) =>
    set((state) => {
      const next = new Set(state.readKeys);
      next.add(key);
      saveReadKeys(next);
      const unreadCriticalCount = state.criticalEvents.filter(
        (e) => !next.has(auditEventKey(e))
      ).length;
      return { readKeys: next, unreadCriticalCount };
    }),
  markAllCriticalAsRead: () =>
    set((state) => {
      const next = new Set(state.readKeys);
      for (const e of state.criticalEvents) {
        next.add(auditEventKey(e));
      }
      saveReadKeys(next);
      return { readKeys: next, unreadCriticalCount: 0 };
    }),
  isRead: (e) => get().readKeys.has(auditEventKey(e)),
  getEventKey: (e) => auditEventKey(e),
  setCriticalEvents: (events) =>
    set((state) => {
      const unreadCriticalCount = events.filter(
        (e) => !state.readKeys.has(auditEventKey(e))
      ).length;
      return { criticalEvents: events, unreadCriticalCount };
    }),
}));

// ── Overlay store ───────────────────────────────────────────────────────────

interface OverlayState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  enabled: getItem("overlay-enabled") === "true",
  setEnabled: (enabled) => {
    setItem("overlay-enabled", enabled ? "true" : "false");
    invoke("toggle_overlay", { visible: enabled }).catch(() => {});
    set({ enabled });
  },
}));
