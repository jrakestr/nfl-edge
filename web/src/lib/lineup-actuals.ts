/** Lineup actuals from model.slate_actuals. No database access. */

import { signedPts } from "@/lib/player-actual";

export type GameState = "final" | "live" | "pending" | "dnp";

export type PlayerActual = {
  pts: number | null;
  state: GameState;
  secsRemaining: number | null;
};

/** One slot. playerId null means the salary row never matched a player. */
export type SlotActualInput = {
  dkId: string | null;
  playerId: string | null;
  actual: PlayerActual | null;
};

export type SlotActualView = {
  dkId: string | null;
  label: string;
  secsRemaining: number | null;
  counts: boolean;
};

export type LineupActual = {
  /** Set only when every slot is final (including DNP) and none are unmapped. */
  total: number | null;
  /** Sum of slots that have a number. Null when a slot is unmapped. */
  soFar: number | null;
  finalCount: number;
  slots: number;
  /** Longest game clock still running, in seconds. Null when every game is final. */
  maxSecs: number | null;
  incomplete: boolean;
  diff: number | null;
  anyLive: boolean;
  perSlot: SlotActualView[];
};

const DASH = "\u2014";

type SlotCalc = SlotActualView & { pts: number | null; final: boolean };

function viewFor(slot: SlotActualInput): SlotCalc {
  if (slot.playerId == null) {
    return { dkId: slot.dkId, label: DASH, secsRemaining: null, counts: false, pts: null, final: false };
  }
  const actual = slot.actual;
  if (!actual || actual.state === "pending") {
    return {
      dkId: slot.dkId,
      label: DASH,
      secsRemaining: actual?.secsRemaining ?? 3600,
      counts: false,
      pts: null,
      final: false,
    };
  }
  if (actual.state === "dnp") {
    return { dkId: slot.dkId, label: "DNP", secsRemaining: 0, counts: true, pts: 0, final: true };
  }
  if (actual.pts == null) {
    return {
      dkId: slot.dkId,
      label: DASH,
      secsRemaining: actual.secsRemaining,
      counts: false,
      pts: null,
      final: false,
    };
  }
  const final = actual.state === "final";
  return {
    dkId: slot.dkId,
    label: actual.pts.toFixed(1),
    secsRemaining: final ? 0 : actual.secsRemaining,
    counts: true,
    pts: actual.pts,
    final,
  };
}

/** So-far total, players final, longest game clock, and diff against the projection. */
export function lineupActual(slots: SlotActualInput[], proj: number | null): LineupActual {
  const views = slots.map(viewFor);
  const unmapped = slots.some((s) => s.playerId == null);
  const missingFinal = slots.some((s) => s.playerId != null && s.actual?.state === "final" && s.actual.pts == null);
  const blocked = unmapped || missingFinal;
  const numbered = views.filter((v) => v.pts != null);
  const soFar = blocked || numbered.length === 0 ? null : numbered.reduce((sum, v) => sum + (v.pts ?? 0), 0);
  const finalCount = views.filter((v) => v.final).length;
  const allFinal = slots.length > 0 && !blocked && finalCount === slots.length;
  const total = allFinal ? soFar : null;
  const clocks = views.filter((v) => !v.final && v.secsRemaining != null).map((v) => v.secsRemaining ?? 0);
  const maxSecs = clocks.length ? Math.max(...clocks) : null;
  const diff = total != null && proj != null ? total - proj : null;
  return {
    total,
    soFar,
    finalCount,
    slots: slots.length,
    maxSecs,
    incomplete: blocked,
    diff,
    anyLive: slots.some((s) => s.actual?.state === "live"),
    perSlot: views.map(({ dkId, label, secsRemaining, counts }) => ({ dkId, label, secsRemaining, counts })),
  };
}

export function formatDiff(diff: number | null): string {
  return diff == null ? DASH : signedPts(diff);
}

/** Whole minutes, rounded up, so a running clock does not show 0 until it is 0. */
export function gameMinLeft(secs: number | null): string {
  if (secs == null) return DASH;
  if (secs <= 0) return "0";
  return String(Math.ceil(secs / 60));
}
