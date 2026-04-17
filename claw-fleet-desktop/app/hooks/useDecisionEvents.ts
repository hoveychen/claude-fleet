import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { playDecisionAlert } from "../audio";
import { useDecisionStore } from "../store";
import type { ElicitationRequest, GuardRequest } from "../types";

/**
 * Subscribe to backend decision events and push them into the decision store.
 *
 * Must be mounted at the App root (unconditionally) so events are never
 * dropped while the DecisionPanel itself is unmounted (e.g. lite mode with
 * no pending decisions). Backend emits are one-shot — if no listener is
 * attached at emit time, the event is gone.
 */
export function useDecisionEvents() {
  const addGuardRequest = useDecisionStore((s) => s.addGuardRequest);
  const addElicitationRequest = useDecisionStore((s) => s.addElicitationRequest);

  // Dedup: re-emitted payloads (e.g. after remount / reconnect) shouldn't
  // double-chime.
  const announcedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = listen<GuardRequest>("guard-request", (e) => {
      const r = e.payload;
      if (!announcedIds.current.has(r.id)) {
        announcedIds.current.add(r.id);
        const spoken = [r.workspaceName, r.aiTitle, r.toolName || r.commandSummary]
          .filter((s): s is string => !!s && s.length > 0)
          .join(" ");
        playDecisionAlert("guard", spoken);
      }
      addGuardRequest(r);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addGuardRequest]);

  useEffect(() => {
    const unlisten = listen<ElicitationRequest>("elicitation-request", (e) => {
      const r = e.payload;
      if (!announcedIds.current.has(r.id)) {
        announcedIds.current.add(r.id);
        const header = r.questions[0]?.header?.trim() ?? "";
        const fallback = r.questions[0]?.question ?? "";
        const spoken = [r.workspaceName, r.aiTitle, header || fallback]
          .filter((s): s is string => !!s && s.length > 0)
          .join(" ");
        playDecisionAlert("elicitation", spoken);
      }
      addElicitationRequest(r);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addElicitationRequest]);
}
