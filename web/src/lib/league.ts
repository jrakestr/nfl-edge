/**
 * League of Champions (ESPN fantasy league) display helpers. SQL-free on purpose: client components
 * import from here, and `queries/league.ts` (which pulls `postgres`) stays server-only.
 * Nothing here derives a statistic: luck, ranks, running totals, margins, and swing are Python or SQL
 * views (fantasy.loc_luck, fantasy.loc_team_week); this file only shapes and labels what they return.
 */
import { CURRENT_SEASON } from "@/lib/config";
import type { Direction, Intensity } from "@/lib/edge";
import { shortStamp } from "@/lib/format";

/** A starter counts as a miss when he scored at least this many points under his ESPN projection. */
export const MISS_POINTS = 10;
/** ESPN team of the person using this app: int3rc3pt. Highlighted in --line on the league pages. */
export const VIEWER_ESPN_TEAM_ID = 19;
export const MISS_ROWS = 12;
/** Luck needs two final weeks (same floor as ingest/espn_luck.py). */
export const MIN_FINAL_WEEKS_FOR_LUCK = 2;

export type LeagueTeamWeek = {
  season: number;
  week: number;
  espn_team_id: number;
  team: string;
  opp_espn_team_id: number;
  opp_team: string;
  is_final: boolean;
  proj_pts: number;
  actual_pts: number;
  opp_proj_pts: number;
  opp_actual_pts: number;
  own_pm: number;
  opp_pm: number;
  proj_margin: number;
  actual_margin: number;
  swing: number;
  win: number;
  week_rank: number;
  league_avg: number;
  league_sd: number | null;
  sd_from_avg: number | null;
  allplay_wins: number;
  allplay_losses: number;
  cum_pf: number;
  cum_pf_rank: number;
  pts_back_of_pf_leader: number;
  cum_pa: number;
  /** actual win minus earned win for this week; null while the week is open or luck is not fitted yet. */
  luck: number | null;
};

export type StandingRow = {
  espn_team_id: number;
  team: string;
  owner: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  proj_pf: number;
  plus_minus: number;
  allplay_wins: number;
  allplay_losses: number;
  pts_back_of_pf_leader: number;
  all_final: boolean;
};

export type LuckRow = {
  espn_team_id: number;
  team: string;
  proj_wins: number;
  earned_wins: number;
  actual_wins: number;
  luck: number;
  luck_allplay: number;
};

export type LuckFit = { bias: number; sd: number; n_team_weeks: number; weeks: number; computed_at: string };

export type TeamInfo = {
  espn_team_id: number;
  team: string;
  abbrev: string;
  owner: string;
  faab_spent: number;
  faab_remaining: number;
  acquisitions: number;
  drops: number;
  trades: number;
  as_of: string;
};

export type WeekState = { week: number; is_final: boolean };

export type StarterRow = {
  espn_team_id: number;
  team: string;
  player: string;
  position: string | null;
  nfl_team: string | null;
  slot: string;
  proj_pts: number | null;
  actual_pts: number | null;
  kickoff: string | null;
  snapshot_status: string | null;
  snapshot_pulled_at: string | null;
  fp_matched: boolean;
  fp_status: string | null;
  practice_1: string | null;
  practice_2: string | null;
  practice_3: string | null;
  probability_of_playing: number | null;
  injury_update_date: string | null;
  known_before_kickoff: boolean | null;
  fp_fetched_at: string | null;
  /** FantasyPros PPR points for the same player-week; null when no row. */
  fp_points: number | null;
};

/** Team-filter value for an available player on the Acquire page. */
export const WIRE_TEAM = "Wire";

export type AcquireRow = {
  source: "roster" | "wire";
  player: string;
  position: string | null;
  nfl_team: string | null;
  espn_team_id: number | null;
  espn_player_id: number | null;
  team: string;
  slot: string | null;
  availability: string | null;
  status_at_pull: string | null;
  season_pts: number | null;
  season_proj: number | null;
  fp_rank: number | null;
  games_played: number;
};

/** Pace gap for the Acquire sort. No projection sorts last when the table is ascending. */
export function acquirePaceSort(
  pts: number | null | undefined,
  proj: number | null | undefined,
  weeksDone: number,
  seasonWeeks: number,
): number {
  const gap = paceGap(pts, proj, weeksDone, seasonWeeks);
  return gap == null ? Number.POSITIVE_INFINITY : gap;
}

export type RosterRow = {
  player: string;
  position: string | null;
  nfl_team: string | null;
  slot: string;
  status_at_pull: string | null;
  season_pts: number | null;
  season_proj: number | null;
  pulled_at: string;
  /** FantasyPros rest-of-season PPR rank at this position. Null when the player does not match one snapshot row. */
  fp_rank: number | null;
};

export type TxnRow = {
  id: number;
  week: number | null;
  espn_ts: string | null;
  espn_team_id: number;
  team: string;
  txn_type: string;
  status: string;
  bid: number | null;
  item_type: string;
  player: string;
  group_key: string;
};

export type TxnGroup = {
  key: string;
  ts: string | null;
  week: number | null;
  teams: string[];
  teamIds: number[];
  txn_type: string;
  status: string;
  bid: number | null;
  items: { item_type: string; player: string; team: string }[];
};

export type PlayerCheckRow = {
  espn_team_id: number;
  team: string;
  player: string;
  position: string | null;
  slot: string;
  comparable: boolean;
  espn_actual: number | null;
  fp_points: number | null;
  diff: number | null;
  no_match: boolean;
};

const ROS_POS: Record<string, string> = { "D/ST": "DST", DST: "DST", DEF: "DST" };

/** Integer FantasyPros ECR at `ECR['ROS-PPR'][position]`. Defense is stored as DST. A missing key or a non-integer is null. */
export function rosPprRank(payload: unknown, position: string | null | undefined): number | null {
  if (!position || payload == null || typeof payload !== "object") return null;
  const ecr = (payload as { ECR?: unknown }).ECR;
  if (ecr == null || typeof ecr !== "object") return null;
  const ros = (ecr as { "ROS-PPR"?: unknown })["ROS-PPR"];
  if (ros == null || typeof ros !== "object") return null;
  const pos = ROS_POS[position] ?? position.trim().toUpperCase();
  const raw = (ros as Record<string, unknown>)[pos];
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isInteger(n) ? n : null;
}

/** ESPN names the flex slot by every position that can fill it. The slot is FLEX; the player's position is separate. */
export function slotLabel(slot: string): string {
  return slot === "RB/WR/TE" ? "FLEX" : slot;
}

export function isViewerTeam(id: number | null | undefined): boolean {
  return id === VIEWER_ESPN_TEAM_ID;
}

/** Row wash for the viewer's team. Names use text-line; this is the row behind them. */
export function viewerRow(id: number | null | undefined): { className?: string; "data-yours"?: "true" } {
  return isViewerTeam(id) ? { className: "bg-line-tint hover:bg-line-tint", "data-yours": "true" } : {};
}

/** Season points as a percent of ESPN's season projection. Blank when there is no projection. */
export function seasonShare(pts: number | null | undefined, proj: number | null | undefined): number | null {
  if (pts == null || proj == null || proj === 0) return null;
  return (pts / proj) * 100;
}

/** One percent for the players on the roster now: summed season points over summed season projection. */
export function rosterShare(rows: { season_pts: number | null; season_proj: number | null }[]): number | null {
  const totals = rosterTotals(rows);
  return totals ? (totals.pts / totals.proj) * 100 : null;
}

/** Summed season points and projection for roster rows that have both. */
export function rosterTotals(
  rows: { season_pts: number | null; season_proj: number | null }[],
): { pts: number; proj: number } | null {
  let pts = 0;
  let proj = 0;
  for (const r of rows) {
    if (r.season_pts == null || r.season_proj == null || r.season_proj === 0) continue;
    pts += r.season_pts;
    proj += r.season_proj;
  }
  return proj === 0 ? null : { pts, proj };
}

/**
 * Season points minus the straight-line pace `projection × weeks done / season length`.
 * Blank when there is no projection or no completed week. A bye is not a separate clock.
 */
export function paceGap(
  pts: number | null | undefined,
  proj: number | null | undefined,
  weeksDone: number,
  seasonWeeks: number,
): number | null {
  if (pts == null || proj == null || proj === 0) return null;
  if (!(weeksDone > 0) || !(seasonWeeks > 0)) return null;
  return pts - proj * (weeksDone / seasonWeeks);
}

/** Percent of ESPN's full-season projection minus `NFL games played / season length`. Zero games is null. Roster weeks are not the clock, and the projection is not changed. */
export function paceShareGap(
  pts: number | null | undefined,
  proj: number | null | undefined,
  gamesPlayed: number,
  seasonWeeks: number,
): number | null {
  const share = seasonShare(pts, proj);
  if (share == null || !(gamesPlayed > 0) || !(seasonWeeks > 0)) return null;
  return share - (gamesPlayed / seasonWeeks) * 100;
}

/** Weeks still to play in the fantasy season. Blank when the season length is unknown. */
export function weeksLeft(weeksDone: number, seasonWeeks: number): number | null {
  if (!(seasonWeeks > 0)) return null;
  const done = Number.isFinite(weeksDone) ? Math.max(weeksDone, 0) : 0;
  return Math.max(seasonWeeks - done, 0);
}

/** ESPN season projection minus season points so far. Negative means already past the projection. */
export function pointsRemaining(
  pts: number | null | undefined,
  proj: number | null | undefined,
): number | null {
  if (pts == null || proj == null) return null;
  return proj - pts;
}

export type AvailablePlayer = {
  espn_player_id: number;
  player: string;
  position: string | null;
  nfl_team: string | null;
  injury_status: string | null;
  availability: string;
  percent_owned: number | null;
  on_bye: boolean;
  waiver_at: string | null;
  week: number;
  pulled_at: string;
  /** gsis id when exactly one raw.players row matches espn_id. */
  player_id: string | null;
  /** PPR mean from the complete run for the pool's week. */
  ppr: number | null;
  /** DK mean from that same run. Display only. */
  dk: number | null;
};

export type StarterProj = {
  player: string;
  position: string | null;
  slot: string;
  nfl_team: string | null;
  ppr: number | null;
};

export type WaiverSuggestion = {
  add: AvailablePlayer;
  replace: StarterProj;
  gap: number;
};

const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);
const FLEX_SLOT = "RB/WR/TE";
const BENCH_SLOTS = new Set(["BE", "IR"]);
const OUT_STATUSES = new Set(["OUT", "INJURY_RESERVE"]);

/** ESPN lineup position. Defense aliases land on the roster slot D/ST. */
export function lineupPosition(position: string | null | undefined): string | null {
  if (!position) return null;
  const p = position.trim().toUpperCase();
  if (p === "DST" || p === "DEF" || p === "D/ST") return "D/ST";
  return p;
}

export function availabilityLabel(status: string | null | undefined): string {
  if (status === "WAIVERS") return "Waivers";
  if (status === "FREEAGENT") return "Free agent";
  return status?.trim() || "Waivers and free agents";
}

/** Our PPR descending. A player with no sim number sorts last. */
export function sortAvailable<T extends { ppr: number | null; player: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.ppr == null && b.ppr == null) return a.player.localeCompare(b.player);
    if (a.ppr == null) return 1;
    if (b.ppr == null) return -1;
    return b.ppr - a.ppr || a.player.localeCompare(b.player);
  });
}

function lowestProjected<T extends { ppr: number | null }>(rows: T[]): T | null {
  if (rows.length === 0 || rows.some((r) => r.ppr == null)) return null;
  return rows.reduce((m, r) => (r.ppr! < m.ppr! ? r : m));
}

/**
 * Available players whose PPR mean beats the viewer's worst starter at that slot, or the flex
 * starter when that is lower and the player is RB, WR, or TE. OUT, IR, and bye are excluded.
 * The gap is PPR only. A slot with any starter missing a number is not a bar.
 */
export function waiverSuggestions(available: AvailablePlayer[], starters: StarterProj[]): WaiverSuggestion[] {
  const active = starters.filter((s) => !BENCH_SLOTS.has(s.slot));
  const out: WaiverSuggestion[] = [];
  for (const add of available) {
    if (add.on_bye || add.ppr == null || !add.player_id) continue;
    const injury = (add.injury_status ?? "").trim().toUpperCase();
    if (OUT_STATUSES.has(injury)) continue;
    const pos = lineupPosition(add.position);
    if (!pos) continue;
    const slot = lowestProjected(active.filter((s) => s.slot === pos));
    const flex = FLEX_POSITIONS.has(pos) ? lowestProjected(active.filter((s) => s.slot === FLEX_SLOT)) : null;
    const bars = [slot, flex].filter((s): s is StarterProj => s != null);
    if (bars.length === 0) continue;
    const replace = bars.reduce((m, s) => (s.ppr! < m.ppr! ? s : m));
    const gap = add.ppr - replace.ppr!;
    if (!(gap > 0)) continue;
    out.push({ add, replace, gap });
  }
  return out.sort((a, b) => b.gap - a.gap || a.add.player.localeCompare(b.add.player));
}

export type TxnTeamSummary = {
  espn_team_id: number;
  team: string;
  waivers: number;
  faab: number;
  failed: number;
  pending: number;
  freeAgents: number;
  trades: number;
  added: number;
  dropped: number;
};

/**
 * One row per team from the transaction log. A waiver claim is one group (its add and drop share a
 * bid, counted once). FAAB is bids on claims that executed. The draft is left out.
 */
export function txnSummary(rows: TxnRow[]): TxnTeamSummary[] {
  const teams = new Map<number, TxnTeamSummary>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.txn_type === "DRAFT") continue;
    let s = teams.get(r.espn_team_id);
    if (!s) {
      s = {
        espn_team_id: r.espn_team_id,
        team: r.team,
        waivers: 0,
        faab: 0,
        failed: 0,
        pending: 0,
        freeAgents: 0,
        trades: 0,
        added: 0,
        dropped: 0,
      };
      teams.set(r.espn_team_id, s);
    }
    const key = `${r.espn_team_id}:${r.group_key}`;
    if (!seen.has(key)) {
      seen.add(key);
      if (r.txn_type === "WAIVER" && r.status === "EXECUTED") {
        s.waivers += 1;
        s.faab += r.bid ?? 0;
      } else if (r.txn_type === "WAIVER" && r.status.startsWith("FAILED")) {
        s.failed += 1;
      } else if (r.txn_type === "WAIVER" && r.status === "PENDING") {
        s.pending += 1;
      } else if (r.txn_type === "FREEAGENT" && r.status === "EXECUTED") {
        s.freeAgents += 1;
      } else if (r.txn_type === "TRADE" && r.status === "EXECUTED") {
        s.trades += 1;
      }
    }
    if (r.status !== "EXECUTED") continue;
    if (r.item_type === "ADD" || r.item_type === "TRADE_RECEIVED") s.added += 1;
    else if (r.item_type === "DROP" || r.item_type === "TRADE_SENT") s.dropped += 1;
  }
  return [...teams.values()].sort((a, b) => b.faab - a.faab || b.waivers - a.waivers || a.team.localeCompare(b.team));
}

export function recordLabel(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

/** "Week 4 in progress" while any week is open, else "Final through week N". */
export function progressLabel(weeks: WeekState[]): string | null {
  if (weeks.length === 0) return null;
  const open = weeks.filter((w) => !w.is_final).map((w) => w.week);
  if (open.length > 0) return `Week ${Math.min(...open)} in progress`;
  return `Final through week ${Math.max(...weeks.map((w) => w.week))}`;
}

export function parseSeason(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isInteger(n) && n > 2000 ? n : CURRENT_SEASON;
}

export function parseTeamId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** /league hrefs keep `season` only off the default and drop empty params. No games= or slate=. */
export function leagueHref(path: string, season: number, params: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams();
  if (season !== CURRENT_SEASON) q.set("season", String(season));
  for (const [k, v] of Object.entries(params)) {
    if (!v || k === "games" || k === "slate") continue;
    q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export type Tone = { dir: Direction; inten: Intensity };

function tone(x: number | null | undefined, flat: number, strong: number): Tone {
  if (x == null || Math.abs(x) < flat) return { dir: "flat", inten: "flat" };
  return { dir: x > 0 ? "pos" : "neg", inten: Math.abs(x) < strong ? "mid" : "strong" };
}

/** Points above or below projection, margin, or swing. Same three-step ramp as edge, in points. */
export function pointsTone(x: number | null | undefined): Tone {
  return tone(x, 5, 15);
}

export type ShareLevel = "flat" | "low" | "mid" | "high";

/** Four steps of percent versus the season clock. Cuts are percentage points: 6, 14, 24. */
export function shareTone(gap: number | null | undefined): { dir: Direction; level: ShareLevel } {
  if (gap == null || Math.abs(gap) < 6) return { dir: "flat", level: "flat" };
  const dir: Direction = gap > 0 ? "pos" : "neg";
  const a = Math.abs(gap);
  const level: ShareLevel = a < 14 ? "low" : a < 24 ? "mid" : "high";
  return { dir, level };
}

/** Wins above or below what the scores earned. */
export function winsTone(x: number | null | undefined): Tone {
  return tone(x, 0.25, 0.75);
}

const ESPN_STATUS: Record<string, string | null> = {
  ACTIVE: null,
  NORMAL: null,
  QUESTIONABLE: "Q",
  DOUBTFUL: "D",
  OUT: "OUT",
  INJURY_RESERVE: "IR",
  DAY_TO_DAY: "DTD",
  SUSPENSION: "SUSP",
};

/** Short ESPN status; null for healthy (ACTIVE, NORMAL) and unknown-empty. */
export function espnStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  const k = status.trim().toUpperCase();
  return k in ESPN_STATUS ? ESPN_STATUS[k]! : k;
}

/** "Q as of Sun 08:00" from the last snapshot before kickoff, or the plain no-snapshot sentence. */
export function asOfCaption(status: string | null | undefined, pulledAt: string | null | undefined): string {
  if (!pulledAt) return "no snapshot before kickoff";
  const label = espnStatusLabel(status) ?? "Healthy";
  return `${label} as of ${shortStamp(pulledAt).replace(",", "")}`;
}

export function practiceLine(
  p1: string | null | undefined,
  p2: string | null | undefined,
  p3: string | null | undefined,
): string | null {
  const days = [p1, p2, p3].filter((p): p is string => !!p);
  return days.length > 0 ? days.join(", ") : null;
}

/** The report counts as known before kickoff only when its update date proves it. */
export function fpTiming(known: boolean | null | undefined): string {
  if (known === true) return "reported before kickoff";
  if (known === false) return "updated after kickoff";
  return "no update time on the report";
}

/** Starters (not bench or IR) at least MISS_POINTS under projection, worst first. */
export function starterMisses(rows: StarterRow[], limit = MISS_ROWS): StarterRow[] {
  return rows
    .filter((r) => r.slot !== "BE" && r.slot !== "IR" && r.proj_pts != null && r.actual_pts != null)
    .map((r) => ({ r, short: r.proj_pts! - r.actual_pts! }))
    .filter((x) => x.short >= MISS_POINTS)
    .sort((a, b) => b.short - a.short)
    .slice(0, limit)
    .map((x) => x.r);
}

export type WeekGrid = {
  weeks: number[];
  teams: { espn_team_id: number; team: string; cells: Map<number, LeagueTeamWeek> }[];
};

/** One row per team, one cell per week. Teams keep first-seen order (the query sorts them). */
export function buildWeekGrid(rows: LeagueTeamWeek[]): WeekGrid {
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
  const teams = new Map<number, WeekGrid["teams"][number]>();
  for (const r of rows) {
    let t = teams.get(r.espn_team_id);
    if (!t) {
      t = { espn_team_id: r.espn_team_id, team: r.team, cells: new Map() };
      teams.set(r.espn_team_id, t);
    }
    t.cells.set(r.week, r);
  }
  return { weeks, teams: [...teams.values()] };
}

/** Each team's running points against through its latest week, highest (toughest schedule) first. */
export function paRanking(rows: LeagueTeamWeek[]): { espn_team_id: number; team: string; cum_pa: number; weeks: number }[] {
  const last = new Map<number, LeagueTeamWeek>();
  for (const r of rows) {
    const prev = last.get(r.espn_team_id);
    if (!prev || r.week > prev.week) last.set(r.espn_team_id, r);
  }
  return [...last.values()]
    .map((r) => ({ espn_team_id: r.espn_team_id, team: r.team, cum_pa: r.cum_pa, weeks: r.week }))
    .sort((a, b) => b.cum_pa - a.cum_pa);
}

export type TxnWeekTab = { key: string; label: string; groups: TxnGroup[] };

/**
 * One tab per week, plus Draft when week 0 is only the draft and Trades when a move has no week.
 * Empty weeks stay, so the list is the weeks rather than one mixed log.
 */
export function transactionWeekTabs(groups: TxnGroup[], weeks: number[]): TxnWeekTab[] {
  const numbered = new Set(weeks.filter((w) => Number.isInteger(w) && w > 0));
  for (const g of groups) {
    if (g.week != null && g.week > 0) numbered.add(g.week);
  }
  const tabs: TxnWeekTab[] = [...numbered]
    .sort((a, b) => a - b)
    .map((week) => ({
      key: String(week),
      label: `Week ${week}`,
      groups: groups.filter((g) => g.week === week),
    }));
  const period0 = groups.filter((g) => g.week === 0);
  if (period0.length > 0) {
    const draftOnly = period0.every((g) => g.txn_type === "DRAFT");
    tabs.unshift({ key: "0", label: draftOnly ? "Draft" : "Week 0", groups: period0 });
  }
  const undated = groups.filter((g) => g.week == null);
  if (undated.length > 0) {
    const tradesOnly = undated.every((g) => g.txn_type === "TRADE");
    tabs.push({ key: "undated", label: tradesOnly ? "Trades" : "Undated", groups: undated });
  }
  return tabs;
}

/** Latest numbered week. Draft and undated trades stay available, but the open week is the landing tab. */
export function defaultTxnWeek(tabs: TxnWeekTab[]): string | null {
  const numbered = tabs.filter((t) => /^\d+$/.test(t.key) && t.key !== "0");
  return (numbered.at(-1) ?? tabs[0])?.key ?? null;
}

/** Items of one ESPN transaction share a group key. Newest first; undated groups last. */
export function groupTransactions(rows: TxnRow[]): TxnGroup[] {
  const groups = new Map<string, TxnGroup>();
  for (const r of rows) {
    let g = groups.get(r.group_key);
    if (!g) {
      g = {
        key: r.group_key,
        ts: r.espn_ts,
        week: r.week,
        teams: [],
        teamIds: [],
        txn_type: r.txn_type,
        status: r.status,
        bid: r.bid,
        items: [],
      };
      groups.set(r.group_key, g);
    }
    if (!g.teamIds.includes(r.espn_team_id)) {
      g.teamIds.push(r.espn_team_id);
      g.teams.push(r.team);
    }
    g.items.push({ item_type: r.item_type, player: r.player, team: r.team });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.ts == null && b.ts == null) return 0;
    if (a.ts == null) return 1;
    if (b.ts == null) return -1;
    return b.ts.localeCompare(a.ts);
  });
}

const STATUS_LABEL: Record<string, string> = {
  EXECUTED: "Executed",
  PENDING: "Pending",
  CANCELED: "Canceled",
  FAILED_INVALIDPLAYERSOURCE: "Failed: player no longer available",
  FAILED_PLAYERALREADYDROPPED: "Failed: player already dropped",
  FAILED_POSITIONLIMIT: "Failed: position limit",
  FAILED_ROSTERLIMIT: "Failed: roster limit",
};

export function txnStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase();
}

const TYPE_LABEL: Record<string, string> = {
  FREEAGENT: "Free agent",
  WAIVER: "Waiver",
  TRADE: "Trade",
  DRAFT: "Draft",
};

export function txnTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export const TXN_TYPES = ["DRAFT", "WAIVER", "FREEAGENT", "TRADE"] as const;

/** Keep whole transactions: a team filter matches a trade from either side and keeps both sides. */
export function filterTransactions(
  rows: TxnRow[],
  f: { team: number | null; type: string | null },
): TxnRow[] {
  if (f.team == null && !f.type) return rows;
  const keep = new Set<string>();
  for (const r of rows) {
    if (f.type && r.txn_type !== f.type) continue;
    if (f.team != null && r.espn_team_id !== f.team) continue;
    keep.add(r.group_key);
  }
  return rows.filter((r) => keep.has(r.group_key));
}

/** One plain line per item. A trade lists what each team gets once (the sent side is the same move). */
export function txnItemLines(g: TxnGroup): string[] {
  const out: string[] = [];
  for (const i of g.items) {
    if (i.item_type === "ADD") out.push(`Add ${i.player}`);
    else if (i.item_type === "DROP") out.push(`Drop ${i.player}`);
    else if (i.item_type === "DRAFTED") out.push(`Drafted ${i.player}`);
    else if (i.item_type === "TRADE_RECEIVED") out.push(`${i.team} gets ${i.player}`);
  }
  return out;
}

/** Both sides of each matchup, once, lowest team id first. A side with no opponent row is dropped. */
export function weekMatchups(rows: LeagueTeamWeek[]): { a: LeagueTeamWeek; b: LeagueTeamWeek }[] {
  const byId = new Map(rows.map((r) => [r.espn_team_id, r]));
  const out: { a: LeagueTeamWeek; b: LeagueTeamWeek }[] = [];
  for (const r of rows) {
    if (r.espn_team_id > r.opp_espn_team_id) continue;
    const b = byId.get(r.opp_espn_team_id);
    if (b) out.push({ a: r, b });
  }
  return out.sort((x, y) => x.a.espn_team_id - y.a.espn_team_id);
}
