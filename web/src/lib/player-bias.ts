/** Display of persisted player bias cells (model.player_bias). Sql-free; the gate is Python's. */
import { signed } from "@/lib/edge";

export type BiasCell = {
  ord: number;
  dimension: string;
  label: string;
  n: number;
  projected: number | null;
  actual: number | null;
  meanResid: number | null;
  meanPct: number | null;
  mae: number | null;
  se: number | null;
  weeksGraded: number;
  state: string;
  reason: string;
  owner: string | null;
};

export type PlayerBiasData = {
  cells: BiasCell[];
  /** Weeks present in the per-player table. */
  weeks: number[];
  compared: number;
  didNotPlay: number;
};

export const DIMENSION_TITLES: Record<string, string> = {
  position: "By position",
  tier: "By projection tier",
  "position and tier": "By position and tier",
  targets: "Targets",
  carries: "Carries",
  attempts: "Pass attempts",
  "yards per touch": "Yards per touch",
  "team volume": "Team volume per game",
};

export const TIER_NOTE = "Star is the top 12 QB, 24 RB, 36 WR and 12 TE by projected points that week.";

export const GATE_TEXT =
  "A cell passes the gate with at least 30 players, at least two graded weeks, the same direction every week, and a gap larger than one standard error. Passing only makes it eligible for a separate, backtested prior change; nothing here changes the model.";

const DASH = "\u2014";

export function groupByDimension(cells: BiasCell[]): { dimension: string; title: string; cells: BiasCell[] }[] {
  const out: { dimension: string; title: string; cells: BiasCell[] }[] = [];
  for (const c of [...cells].sort((a, b) => a.ord - b.ord)) {
    let g = out.find((x) => x.dimension === c.dimension);
    if (!g) {
      g = { dimension: c.dimension, title: DIMENSION_TITLES[c.dimension] ?? c.dimension, cells: [] };
      out.push(g);
    }
    g.cells.push(c);
  }
  return out;
}

/** Gate state in plain words: "Passes the gate" or "Not enough evidence: only 29 players, need 30". */
export function gateText(c: Pick<BiasCell, "state" | "reason">): string {
  if (c.state === "candidate") return "Passes the gate";
  const reason = c.reason ? c.reason.charAt(0).toUpperCase() + c.reason.slice(1) : "";
  return reason ? `Not enough evidence. ${reason}` : "Not enough evidence";
}

export function fixed(v: number | null, digits = 2): string {
  return v == null ? DASH : v.toFixed(digits);
}

export function resid(v: number | null, digits = 2): string {
  return v == null ? DASH : signed(v, digits);
}

export function residPct(v: number | null): string {
  return v == null ? DASH : `${signed(v, 1)}%`;
}

/** Graded weeks (from games) with no per-player comparison yet. */
export function weeksMissing(compared: number[], graded: number[]): number[] {
  const have = new Set(compared);
  return graded.filter((w) => !have.has(w)).sort((a, b) => a - b);
}

export function weeksText(weeks: number[]): string {
  return weeks.length === 0 ? "none" : weeks.join(", ");
}
