/**
 * useMood — shared mood derivation hook for all mascot components.
 *
 * Improvements over the original inline deriveMood:
 * 1. In busy state, also considers outcome moods from non-busy sessions
 * 2. Random variation: busy state occasionally shows satisfied/excited
 * 3. Lower excited threshold: speed > 30 or busy >= 2
 * 4. Outcome mood persists for 30s even when new busy sessions appear
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionInfo, SessionOutcome } from "../types";
import type { MascotMood } from "./MascotEyes";

// ── Outcome → mood mapping ──────────────────────────────────────────────────

const OUTCOME_MOOD_MAP: Record<SessionOutcome, MascotMood> = {
  needs_input:   "attentive",
  bug_fixed:     "proud",
  feature_added: "proud",
  stuck:         "frustrated",
  apologizing:   "embarrassed",
  show_off:      "satisfied",
  concerned:     "anxious",
  confused:      "anxious",
  celebrating:   "excited",
  quick_fix:     "satisfied",
  overwhelmed:   "frustrated",
  scheming:      "focused",
  reporting:     "satisfied",
};

// ── Promotion (deduplicated from MascotEyes) ────────────────────────────────

function promoteSessions(sessions: SessionInfo[]): SessionInfo[] {
  const activeSubagentParentIds = new Set(
    sessions
      .filter(
        (s) =>
          s.isSubagent && s.parentSessionId &&
          ["thinking", "executing", "streaming", "processing", "waitingInput", "active"].includes(s.status)
      )
      .map((s) => s.parentSessionId!)
  );
  return sessions.map((s) =>
    !s.isSubagent &&
    ["idle", "active", "waitingInput", "processing"].includes(s.status) &&
    activeSubagentParentIds.has(s.id)
      ? { ...s, status: "delegating" as const }
      : s
  );
}

// ── Outcome mood picker ─────────────────────────────────────────────────────

function pickOutcomeMood(sessions: SessionInfo[]): MascotMood | null {
  const allTags: SessionOutcome[] = sessions
    .flatMap((s) => (s.lastOutcome ?? []) as SessionOutcome[]);
  if (allTags.length === 0) return null;

  if (allTags.includes("needs_input")) return "attentive";

  const hash = allTags.reduce((h, t) => h + t.charCodeAt(0), 0);
  const tag = allTags[hash % allTags.length];
  return OUTCOME_MOOD_MAP[tag] ?? null;
}

// ── Random variation moods for busy state ───────────────────────────────────

const BUSY_VARIATION_MOODS: MascotMood[] = [
  "satisfied", "excited", "proud", "attentive",
];

// How long an outcome-based mood persists even when busy sessions exist
const OUTCOME_PERSIST_MS = 30_000;

// How often the random variation can trigger (cycle interval)
const VARIATION_INTERVAL_MS = 15_000;

// Chance (0–1) that a busy cycle picks a variation instead of "focused"
const VARIATION_CHANCE = 0.25;

// ── Core derivation (pure, no persistence) ──────────────────────────────────

function deriveBaseMood(sessions: SessionInfo[]): {
  mood: MascotMood;
  isOutcomeBased: boolean;
} {
  if (sessions.length === 0) return { mood: "lonely", isOutcomeBased: false };

  const promoted = promoteSessions(sessions);
  const busyStatuses = ["thinking", "executing", "streaming", "processing", "active", "delegating"];
  const busy = promoted.filter((s) => busyStatuses.includes(s.status));
  const waiting = promoted.filter((s) => s.status === "waitingInput");
  const idle = promoted.filter((s) => s.status === "idle");
  const totalSpeed = promoted.reduce((sum, s) => sum + s.tokenSpeed, 0);

  // No busy / no waiting → bored or sleepy
  if (busy.length === 0 && waiting.length === 0) {
    const outcomeMood = pickOutcomeMood([...idle, ...waiting]);
    if (outcomeMood) return { mood: outcomeMood, isOutcomeBased: true };
    return { mood: idle.length > 3 ? "sleepy" : "bored", isOutcomeBased: false };
  }

  // Lower excited threshold: speed > 30 or busy >= 2
  if (totalSpeed > 30 || busy.length >= 2) return { mood: "excited", isOutcomeBased: false };

  // Busy state — also check outcome moods from non-busy sessions
  if (busy.length >= 1) {
    const nonBusy = [...waiting, ...idle];
    const outcomeMood = pickOutcomeMood(nonBusy);
    if (outcomeMood) return { mood: outcomeMood, isOutcomeBased: true };
    return { mood: "focused", isOutcomeBased: false };
  }

  // Only waiting sessions remain
  if (waiting.length > 0) {
    const outcomeMood = pickOutcomeMood(waiting);
    if (outcomeMood) return { mood: outcomeMood, isOutcomeBased: true };
    return { mood: "anxious", isOutcomeBased: false };
  }

  return { mood: "satisfied", isOutcomeBased: false };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMood(sessions: SessionInfo[], forceMood?: MascotMood): MascotMood {
  // Persistent outcome mood with timestamp
  const outcomeMoodRef = useRef<{ mood: MascotMood; at: number } | null>(null);
  // Random variation state
  const [variationMood, setVariationMood] = useState<MascotMood | null>(null);
  const variationTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { mood: baseMood, isOutcomeBased } = useMemo(
    () => deriveBaseMood(sessions),
    [sessions],
  );

  // Update persistent outcome mood
  useEffect(() => {
    if (isOutcomeBased) {
      outcomeMoodRef.current = { mood: baseMood, at: Date.now() };
    }
  }, [baseMood, isOutcomeBased]);

  // Random variation timer for busy/focused state
  useEffect(() => {
    if (variationTimer.current) clearTimeout(variationTimer.current);

    if (baseMood === "focused") {
      const scheduleVariation = () => {
        variationTimer.current = setTimeout(() => {
          if (Math.random() < VARIATION_CHANCE) {
            const pick = BUSY_VARIATION_MOODS[Math.floor(Math.random() * BUSY_VARIATION_MOODS.length)];
            setVariationMood(pick);
            // Clear variation after one cycle
            setTimeout(() => setVariationMood(null), VARIATION_INTERVAL_MS * 0.6);
          }
          scheduleVariation();
        }, VARIATION_INTERVAL_MS);
      };
      scheduleVariation();
    } else {
      setVariationMood(null);
    }

    return () => {
      if (variationTimer.current) clearTimeout(variationTimer.current);
    };
  }, [baseMood]);

  if (forceMood) return forceMood;

  // If base mood is focused, check for persistent outcome mood first
  if (baseMood === "focused") {
    const persisted = outcomeMoodRef.current;
    if (persisted && Date.now() - persisted.at < OUTCOME_PERSIST_MS) {
      return persisted.mood;
    }
    // Then check random variation
    if (variationMood) return variationMood;
  }

  return baseMood;
}
