/** Unified season game log (DraftKings scored, Sim DK, FantasyPros DK, and counting stats) for one player-week.

As-of: a page for week W of season S shows history only for that season's weeks
before W, plus W itself when a final stat line is already in the log (or as an
upcoming projection row when projections exist for W). Missing projections stay
blank. This module does not score and does not read another source.
*/

import { signedPts } from "@/lib/player-actual";
import type { PlayerActualWeek } from "@/lib/player-actuals";
import { weeklyValue } from "@/lib/prop-stats";
import type { PlayerWeek } from "@/lib/types";

export type StatColumn = { id: string; header: string };

export type FpWeek = {
  season: number;
  week: number;
  fpts_dk: number;
  opponent: string | null;
  stats?: Record<string, number | null>;
};

export type SimWeek = {
  season: number;
  week: number;
  fpts_dk: number;
  opponent: string | null;
  stats?: Record<string, number | null>;
};

export type WeekRow = {
  key: string;
  season: number;
  week: number;
  opponent: string | null;
  gameday: string | null;
  /** DraftKings points from the stored actual. Null when the week is not scored. */
  scored: number | null;
  /** Our simulation's DraftKings projection (fpts_dk_mean). Null when that week was not simulated. */
  simProjected: number | null;
  /** FantasyPros projection already stored as DraftKings. Null when that week was not pulled. */
  projected: number | null;
  /** Scored minus (simProjected ?? projected). Null when scored is missing, both projections are missing, or DNP. */
  delta: number | null;
  /** The page week, shown as a projection because no final stat line exists. */
  upcoming: boolean;
  dnp: boolean;
  /** Position counting stat values keyed by StatColumn.id. */
  values: Record<string, number | null>;
};

export type PointsRow = WeekRow;

export type PlayerAnalysisModel = {
  columns: StatColumn[];
  rows: WeekRow[];
  empty: string | null;
  /** Set when some scored weeks have no stored projection row. */
  gap: string | null;
};

type Col = StatColumn & { stat?: string; key?: string };

const QB: Col[] = [
  { id: "passYds", header: "Pass yds", stat: "pass_yds" },
  { id: "passTd", header: "Pass TD", stat: "pass_td" },
  { id: "int", header: "INT", stat: "int" },
  { id: "rushYds", header: "Rush yds", stat: "rush_yds" },
  { id: "rushTd", header: "Rush TD", stat: "rush_td" },
];

const RB: Col[] = [
  { id: "carries", header: "Carries", key: "carries" },
  { id: "rushYds", header: "Rush yds", stat: "rush_yds" },
  { id: "rushTd", header: "Rush TD", stat: "rush_td" },
  { id: "rec", header: "Rec", stat: "rec" },
  { id: "recYds", header: "Rec yds", stat: "rec_yds" },
];

const RECEIVER: Col[] = [
  { id: "targets", header: "Targets", key: "targets" },
  { id: "rec", header: "Rec", stat: "rec" },
  { id: "recYds", header: "Rec yds", stat: "rec_yds" },
  { id: "recTd", header: "Rec TD", stat: "rec_td" },
  { id: "carries", header: "Carries", key: "carries" },
  { id: "rushYds", header: "Rush yds", stat: "rush_yds" },
];

const DASH = "\u2014";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function countingColumns(position: string | null | undefined): Col[] {
  const p = (position ?? "").toUpperCase();
  if (p === "QB") return QB;
  if (p === "RB") return RB;
  if (p === "WR" || p === "TE") return RECEIVER;
  return [];
}

function cell(stats: Record<string, unknown>, col: Col): number | null {
  if (col.stat) return weeklyValue(stats, col.stat);
  if (!col.key) return null;
  return num(stats[col.key]);
}

function projCell(
  simStats: Record<string, unknown> | undefined,
  fpStats: Record<string, unknown> | undefined,
  col: Col,
): number | null {
  const k = col.stat ?? col.key;
  if (!k) return null;
  return num(simStats?.[k]) ?? num(fpStats?.[k]);
}

function weekKey(season: number, week: number): string {
  return `${season}-${week}`;
}

/** A stored stat row for this season at or before the page week is a final line. */
function finalWeeks(log: PlayerWeek[], season: number, week: number): Set<number> {
  const out = new Set<number>();
  for (const row of log) {
    if (row.season === season && row.week <= week) out.add(row.week);
  }
  return out;
}

export function countLabel(v: number | null): string {
  if (v == null) return DASH;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function pointsLabel(v: number | null): string {
  if (v == null) return DASH;
  return v.toFixed(1);
}

export function scoredLabel(row: Pick<WeekRow, "dnp" | "upcoming" | "scored">): string {
  if (row.dnp) return "DNP";
  if (row.upcoming) return DASH;
  return pointsLabel(row.scored);
}

export function deltaLabel(v: number | null): string {
  if (v == null) return DASH;
  return signedPts(v);
}

/** Color only a non-zero delta. A tenth that rounds to 0.0 stays neutral. */
export function deltaTone(v: number | null): "pos" | "neg" | "flat" {
  if (v == null) return "flat";
  const rounded = Math.round(v * 10) / 10;
  if (rounded > 0) return "pos";
  if (rounded < 0) return "neg";
  return "flat";
}

export function buildPlayerAnalysis(input: {
  position: string | null | undefined;
  season: number;
  week: number;
  log: PlayerWeek[];
  actuals: PlayerActualWeek[];
  projections: FpWeek[];
  simProjections?: SimWeek[];
}): PlayerAnalysisModel {
  const { position, season, week, log, actuals, projections, simProjections = [] } = input;
  const columns = countingColumns(position);

  const statRows = log
    .filter((row) => row.season === season && row.week <= week)
    .sort((a, b) => a.week - b.week);

  const finals = finalWeeks(log, season, week);
  const actualByWeek = new Map<number, PlayerActualWeek>();
  for (const row of actuals) {
    if (row.season !== season || row.week > week) continue;
    // The page week counts as scored only when its stat line is already stored.
    if (row.week === week && !finals.has(week)) continue;
    actualByWeek.set(row.week, row);
  }

  const storedSim = simProjections.filter((p) => p.season === season && p.week <= week);
  const storedProj = projections.filter((p) => p.season === season && p.week <= week);
  const simByWeek = new Map(storedSim.map((p) => [p.week, p]));
  const projByWeek = new Map(storedProj.map((p) => [p.week, p]));
  const logByWeek = new Map(statRows.map((row) => [row.week, row]));

  const weeks = new Set<number>([
    ...logByWeek.keys(),
    ...actualByWeek.keys(),
    ...simByWeek.keys(),
    ...projByWeek.keys(),
  ]);

  if (weeks.size === 0) {
    return {
      columns,
      rows: [],
      empty: columns.length
        ? `No ${season} stats before week ${week}.`
        : "No counting stats for this position.",
      gap: null,
    };
  }

  const rows: WeekRow[] = [...weeks]
    .sort((a, b) => a - b)
    .map((wk) => {
      const actual = actualByWeek.get(wk);
      const sim = simByWeek.get(wk);
      const proj = projByWeek.get(wk);
      const played = logByWeek.get(wk);
      const hasFinal = finals.has(wk) || actual != null;
      const upcoming = wk === week && !hasFinal;
      const dnp = !upcoming && actual != null && !actual.had_opportunity;
      const scored = !upcoming && !dnp && actual != null ? actual.fpts_dk : null;
      const simProjected = sim?.fpts_dk ?? null;
      const projected = proj?.fpts_dk ?? null;
      const refProjected = simProjected ?? projected;
      const delta =
        scored != null && refProjected != null
          ? scored - refProjected
          : upcoming && simProjected != null && projected != null
            ? simProjected - projected
            : null;
      const values = Object.fromEntries(
        columns.map((col) => [
          col.id,
          played
            ? cell(played.stats, col)
            : upcoming
              ? projCell(sim?.stats, proj?.stats, col)
              : null,
        ]),
      );
      return {
        key: weekKey(season, wk),
        season,
        week: wk,
        opponent: actual?.opponent ?? played?.opponent ?? sim?.opponent ?? proj?.opponent ?? null,
        gameday: played?.gameday ?? actual?.gameday ?? null,
        scored,
        simProjected,
        projected,
        delta,
        upcoming,
        dnp,
        values,
      };
    });

  const hasAnyProj = storedSim.length > 0 || storedProj.length > 0;
  const gap =
    hasAnyProj && rows.some((row) => row.scored != null && row.simProjected == null && row.projected == null)
      ? "Projection is not stored for every scored week."
      : null;

  return {
    columns,
    rows,
    empty: null,
    gap,
  };
}
