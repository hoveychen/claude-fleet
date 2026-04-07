import { create } from "zustand";
import type { SessionInfo, WaitingAlert } from "../types";

export interface SpeedSample {
  time: number;
  speed: number;
}

const MAX_SPEED_HISTORY = 60;

interface SessionsState {
  sessions: SessionInfo[];
  alerts: WaitingAlert[];
  speedHistory: SpeedSample[];
  lastUpdated: number;
  setSessions: (sessions: SessionInfo[]) => void;
  setAlerts: (alerts: WaitingAlert[]) => void;
  addAlert: (alert: WaitingAlert) => void;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  alerts: [],
  speedHistory: [],
  lastUpdated: 0,

  setSessions: (sessions) =>
    set((state) => {
      const totalSpeed = sessions.reduce((sum, s) => sum + s.tokenSpeed, 0);
      const newSample: SpeedSample = { time: Date.now(), speed: totalSpeed };
      const speedHistory = [...state.speedHistory, newSample].slice(-MAX_SPEED_HISTORY);
      return { sessions, speedHistory, lastUpdated: Date.now() };
    }),

  setAlerts: (alerts) => set({ alerts }),

  addAlert: (alert) =>
    set((state) => {
      if (state.alerts.some((a) => a.sessionId === alert.sessionId)) {
        return state;
      }
      return { alerts: [...state.alerts, alert] };
    }),
}));
