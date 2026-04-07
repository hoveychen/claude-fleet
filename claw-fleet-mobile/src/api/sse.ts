import type { SessionInfo, WaitingAlert } from "../types";

interface SSEHandlers {
  onSessionsUpdated?: (sessions: SessionInfo[]) => void;
  onWaitingAlert?: (alert: WaitingAlert) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * SSE is not available in React Native — polling handles real-time updates.
 * This hook is a no-op placeholder.
 */
export function useSSE(
  _sseUrl: string | null,
  _handlers: SSEHandlers,
) {
  // No-op — polling in tab layout handles updates
}
