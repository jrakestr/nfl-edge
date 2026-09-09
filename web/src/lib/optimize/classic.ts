import { formatUploadCsv } from "@/lib/dfs-upload";
import { opponentOf } from "@/lib/optimize/game-info";
import type { PoolState } from "@/lib/pool-state";
import type { DfsLineup, SlatePlayer } from "@/lib/types";

export const SALARY_CAP = 50_000;
export const MIN_SALARY = 49_200;
export const PROJECTION_MIN = 5;
export const TEAM_LIMIT = 4;
export const CLASSIC_SLOTS = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"] as const;

export type OptPlayer = {
  player_id: string;
  dk_id: string;
  display_name: string;
  position: "QB" | "RB" | "WR" | "TE" | "DST";
  team: string;
  opponent: string | null;
  salary: number;
  fpts: number;
  jitter: number;
};

export type OptimizeInput = {
  locked: string[];
  excluded: string[];
  stacked: string[];
  qbStackTeam: string;
  bringBackTeam: string;
  randomness: number;
  maxExposure: number;
  nLineups: number;
  salaryCap?: number;
  minSalary?: number;
  stackCount?: number;
  bringBackCount?: number;
  teamLimit?: number;
  uniques?: number;
  seed?: number;
  projectionMin?: number;
};

export type OptimizeResult = {
  lineups: DfsLineup[];
  error: string | null;
};

const SKILL = new Set(["RB", "WR", "TE"]);
const STACK_POS = new Set(["WR", "TE"]);
const BRING_POS = new Set(["WR", "TE", "RB"]);

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toOptPlayer(p: SlatePlayer): OptPlayer | null {
  const pos = (p.position ?? "").toUpperCase();
  const mapped = pos === "D" || pos === "DEF" ? "DST" : pos;
  if (mapped !== "QB" && mapped !== "RB" && mapped !== "WR" && mapped !== "TE" && mapped !== "DST") {
    return null;
  }
  const salary = p.salary ?? 0;
  if (salary <= 0) return null;
  const team = (p.team ?? "").toUpperCase();
  if (!team) return null;
  return {
    player_id: p.player_id,
    dk_id: p.dk_id,
    display_name: p.display_name,
    position: mapped,
    team,
    opponent: opponentOf(p.game_info, p.team),
    salary,
    fpts: p.fpts_dk_mean ?? 0,
    jitter: p.fpts_dk_mean ?? 0,
  };
}

export function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function byId(players: OptPlayer[]): Map<string, OptPlayer> {
  return new Map(players.map((p) => [p.player_id, p]));
}

function differs(a: string[], b: Set<string>, uniques: number): boolean {
  let d = 0;
  for (const id of a) if (!b.has(id)) d += 1;
  return d >= uniques;
}

export function assignClassicSlots(players: OptPlayer[]): { slot: string; player: OptPlayer }[] | null {
  const qb = players.filter((p) => p.position === "QB");
  const dst = players.filter((p) => p.position === "DST");
  const rb = players.filter((p) => p.position === "RB").sort((a, b) => b.jitter - a.jitter);
  const wr = players.filter((p) => p.position === "WR").sort((a, b) => b.jitter - a.jitter);
  const te = players.filter((p) => p.position === "TE").sort((a, b) => b.jitter - a.jitter);
  if (qb.length !== 1 || dst.length !== 1) return null;
  if (rb.length < 2 || wr.length < 3 || te.length < 1) return null;
  if (players.length !== 9) return null;
  const used = new Set<string>();
  const take = (list: OptPlayer[], n: number) => {
    const out: OptPlayer[] = [];
    for (const p of list) {
      if (used.has(p.player_id)) continue;
      out.push(p);
      used.add(p.player_id);
      if (out.length === n) break;
    }
    return out;
  };
  used.add(qb[0]!.player_id);
  used.add(dst[0]!.player_id);
  const rbs = take(rb, 2);
  const wrs = take(wr, 3);
  const tes = take(te, 1);
  if (rbs.length < 2 || wrs.length < 3 || tes.length < 1) return null;
  const flex = players.find((p) => !used.has(p.player_id) && SKILL.has(p.position));
  if (!flex) return null;
  return [
    { slot: "QB", player: qb[0]! },
    { slot: "RB", player: rbs[0]! },
    { slot: "RB2", player: rbs[1]! },
    { slot: "WR", player: wrs[0]! },
    { slot: "WR2", player: wrs[1]! },
    { slot: "WR3", player: wrs[2]! },
    { slot: "TE", player: tes[0]! },
    { slot: "FLEX", player: flex },
    { slot: "DST", player: dst[0]! },
  ];
}

function stackLabel(players: OptPlayer[]): string | null {
  const counts = new Map<string, number>();
  for (const p of players) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
  const ranked = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return null;
  const [team, n] = ranked[0]!;
  const bring = ranked[1];
  return bring ? `${team} ${n} + ${bring[0]} ${bring[1]}` : `${team} ${n}`;
}

export function toDfsLineup(players: OptPlayer[], lineupId: string): DfsLineup | null {
  const slots = assignClassicSlots(players);
  if (!slots) return null;
  return {
    lineup_id: lineupId,
    salary_used: players.reduce((s, p) => s + p.salary, 0),
    stack: stackLabel(players),
    proj_fpts: Math.round(players.reduce((s, p) => s + p.fpts, 0) * 10) / 10,
    sim_win_pct: null,
    sim_roi: null,
    players: slots.map((s) => ({
      slot: s.slot,
      name: s.player.display_name,
      dk_id: s.player.dk_id,
      player_id: s.player.player_id,
    })),
  };
}

function eligible(p: OptPlayer, slot: string): boolean {
  if (slot === "FLEX") return SKILL.has(p.position);
  if (slot === "QB") return p.position === "QB";
  if (slot === "DST") return p.position === "DST";
  if (slot === "TE") return p.position === "TE";
  if (slot.startsWith("RB")) return p.position === "RB";
  if (slot.startsWith("WR")) return p.position === "WR";
  return false;
}

function remainingNeeds(placed: OptPlayer[]): Record<string, number> {
  const n = { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1, FLEX: 1 };
  for (const p of placed) {
    if (p.position === "QB") n.QB -= 1;
    else if (p.position === "DST") n.DST -= 1;
    else if (p.position === "RB" && n.RB > 0) n.RB -= 1;
    else if (p.position === "WR" && n.WR > 0) n.WR -= 1;
    else if (p.position === "TE" && n.TE > 0) n.TE -= 1;
    else n.FLEX -= 1;
  }
  return n;
}

function slotOrder(needs: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [slot, n] of Object.entries(needs)) {
    for (let i = 0; i < n; i++) out.push(slot);
  }
  const rank: Record<string, number> = { QB: 0, DST: 1, TE: 2, RB: 3, WR: 4, FLEX: 5 };
  out.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
  return out;
}

type FillCtx = {
  cap: number;
  minSalary: number;
  teamLimit: number;
  allowQbVsDst: boolean;
  maxRbWithQb: number;
  qbTeam: string;
  qbOpp: string | null;
};

function rbWithQb(placed: OptPlayer[], qbTeam: string): number {
  return placed.filter((p) => p.position === "RB" && p.team === qbTeam).length;
}

function canAdd(p: OptPlayer, placed: OptPlayer[], ctx: FillCtx): boolean {
  if (placed.some((x) => x.player_id === p.player_id)) return false;
  const salary = placed.reduce((s, x) => s + x.salary, 0) + p.salary;
  if (salary > ctx.cap) return false;
  const teamN = placed.filter((x) => x.team === p.team).length + 1;
  if (teamN > ctx.teamLimit) return false;
  if (p.position === "DST" && !ctx.allowQbVsDst && ctx.qbOpp && p.team === ctx.qbOpp) return false;
  if (p.position === "RB" && p.team === ctx.qbTeam && rbWithQb(placed, ctx.qbTeam) >= ctx.maxRbWithQb) {
    return false;
  }
  return true;
}

function fillSlots(
  placed: OptPlayer[],
  pool: OptPlayer[],
  ctx: FillCtx,
  nodeBudget: { n: number },
): OptPlayer[] | null {
  const needs = remainingNeeds(placed);
  const slots = slotOrder(needs);
  if (slots.length === 0) {
    const sal = placed.reduce((s, p) => s + p.salary, 0);
    if (sal < ctx.minSalary || sal > ctx.cap) return null;
    if (placed.length !== 9) return null;
    return placed;
  }
  if (nodeBudget.n <= 0) return null;
  nodeBudget.n -= 1;
  const slot = slots[0]!;
  const cands = pool
    .filter((p) => eligible(p, slot) && canAdd(p, placed, ctx))
    .sort((a, b) => b.jitter - a.jitter)
    .slice(0, slot === "DST" ? 8 : 12);
  let best: OptPlayer[] | null = null;
  let bestPts = -Infinity;
  for (const p of cands) {
    const next = fillSlots([...placed, p], pool, ctx, nodeBudget);
    if (!next) continue;
    const pts = next.reduce((s, x) => s + x.jitter, 0);
    if (pts > bestPts) {
      best = next;
      bestPts = pts;
    }
  }
  return best;
}

function stackOk(players: OptPlayer[], qbTeam: string, stackCount: number): boolean {
  if (!qbTeam) return true;
  const n = players.filter((p) => p.team === qbTeam && STACK_POS.has(p.position)).length;
  return n >= stackCount;
}

function bringOk(players: OptPlayer[], bringTeam: string, count: number): boolean {
  if (!bringTeam || count <= 0) return true;
  const n = players.filter((p) => p.team === bringTeam && BRING_POS.has(p.position)).length;
  return n >= count;
}

function solveOne(
  pool: OptPlayer[],
  required: OptPlayer[],
  settings: Required<Pick<OptimizeInput, "qbStackTeam" | "bringBackTeam">> & {
    stackCount: number;
    bringBackCount: number;
    cap: number;
    minSalary: number;
    teamLimit: number;
    banned: Set<string>;
    prev: Set<string>[];
    uniques: number;
  },
): OptPlayer[] | null {
  const avail = pool.filter((p) => !settings.banned.has(p.player_id));
  for (const r of required) {
    if (settings.banned.has(r.player_id)) return null;
    if (!avail.some((p) => p.player_id === r.player_id)) return null;
  }
  const qbTeam = settings.qbStackTeam;
  const qbs = avail.filter((p) => p.position === "QB" && (!qbTeam || p.team === qbTeam));
  const qbCands = required.find((p) => p.position === "QB")
    ? qbs.filter((p) => required.some((r) => r.player_id === p.player_id))
    : qbs.sort((a, b) => b.jitter - a.jitter).slice(0, 4);
  if (!qbCands.length) return null;

  let best: OptPlayer[] | null = null;
  let bestPts = -Infinity;

  for (const qb of qbCands) {
    const bringTeam = settings.bringBackTeam || qb.opponent || "";
    const corePlaced = [qb, ...required.filter((p) => p.player_id !== qb.player_id)];
    if (new Set(corePlaced.map((p) => p.player_id)).size !== corePlaced.length) continue;

    const haveStack = corePlaced.filter((p) => p.team === qb.team && STACK_POS.has(p.position));
    const needStack = Math.max(0, settings.stackCount - haveStack.length);
    const stackPool = avail.filter(
      (p) =>
        p.team === qb.team &&
        STACK_POS.has(p.position) &&
        !corePlaced.some((x) => x.player_id === p.player_id),
    );
    const stackCombos = combinations(
      stackPool.sort((a, b) => b.jitter - a.jitter).slice(0, 8),
      needStack,
    );
    if (!stackCombos.length && needStack > 0) continue;

    const haveBring = corePlaced.filter((p) => p.team === bringTeam && BRING_POS.has(p.position));
    const needBring = bringTeam ? Math.max(0, settings.bringBackCount - haveBring.length) : 0;
    const bringPool = avail.filter(
      (p) =>
        p.team === bringTeam &&
        BRING_POS.has(p.position) &&
        !corePlaced.some((x) => x.player_id === p.player_id),
    );

    const ctx: FillCtx = {
      cap: settings.cap,
      minSalary: settings.minSalary,
      teamLimit: settings.teamLimit,
      allowQbVsDst: false,
      maxRbWithQb: 1,
      qbTeam: qb.team,
      qbOpp: qb.opponent,
    };

    for (const extraStack of stackCombos.length ? stackCombos : [[]]) {
      const afterStack = [...corePlaced, ...extraStack];
      const bringCombos = combinations(
        bringPool.sort((a, b) => b.jitter - a.jitter).slice(0, 8),
        needBring,
      );
      if (!bringCombos.length && needBring > 0) continue;
      for (const extraBring of bringCombos.length ? bringCombos : [[]]) {
        const core = [...afterStack, ...extraBring];
        if (core.reduce((s, p) => s + p.salary, 0) > settings.cap) continue;
        const teamCounts = new Map<string, number>();
        let teamOk = true;
        for (const p of core) {
          const n = (teamCounts.get(p.team) ?? 0) + 1;
          if (n > settings.teamLimit) {
            teamOk = false;
            break;
          }
          teamCounts.set(p.team, n);
        }
        if (!teamOk) continue;
        if (rbWithQb(core, qb.team) > 1) continue;
        const filled = fillSlots(core, avail, ctx, { n: 40_000 });
        if (!filled) continue;
        if (!stackOk(filled, qb.team, settings.stackCount)) continue;
        if (!bringOk(filled, bringTeam, settings.bringBackCount)) continue;
        const ids = filled.map((p) => p.player_id);
        if (settings.prev.some((prev) => !differs(ids, prev, settings.uniques))) continue;
        const pts = filled.reduce((s, p) => s + p.jitter, 0);
        if (pts > bestPts) {
          best = filled;
          bestPts = pts;
        }
      }
    }
  }
  return best;
}

export function optimizeClassic(players: SlatePlayer[], input: OptimizeInput): OptimizeResult {
  const converted = players.map(toOptPlayer).filter((p): p is OptPlayer => p != null);
  const excluded = new Set(input.excluded);
  const locked = input.locked.filter((id) => !excluded.has(id));
  const stacked = input.stacked.filter((id) => !excluded.has(id));
  const requiredIds = [...new Set([...locked, ...stacked])];
  const index = byId(converted);
  const required = requiredIds.map((id) => index.get(id)).filter((p): p is OptPlayer => p != null);
  if (required.length !== requiredIds.length) {
    return { lineups: [], error: "A locked or stacked player is not on this slate." };
  }

  const pool = converted.filter((p) => {
    if (excluded.has(p.player_id)) return false;
    if (requiredIds.includes(p.player_id)) return true;
    if (p.position === "DST") return true;
    return p.fpts >= (input.projectionMin ?? PROJECTION_MIN);
  });

  const rng = mulberry32(input.seed ?? 1);
  const n = Math.max(1, Math.min(50, input.nLineups));
  const capN = Math.max(1, Math.floor(input.maxExposure * n));
  const exposure = new Map<string, number>();
  const prev: Set<string>[] = [];
  const lineups: DfsLineup[] = [];
  const r = (input.randomness ?? 0) / 100;

  const applyJitter = () => {
    for (const p of pool) {
      p.jitter = r <= 0 ? p.fpts : p.fpts * (1 + (rng() * 2 - 1) * r);
    }
  };

  for (let i = 0; i < n; i++) {
    applyJitter();
    const atCap = new Set<string>();
    for (const [id, c] of exposure) {
      if (c >= capN && !requiredIds.includes(id)) atCap.add(id);
    }
    let built = solveOne(pool, required, {
      qbStackTeam: input.qbStackTeam.toUpperCase(),
      bringBackTeam: input.bringBackTeam.toUpperCase(),
      stackCount: input.stackCount ?? 2,
      bringBackCount: input.bringBackCount ?? 1,
      cap: input.salaryCap ?? SALARY_CAP,
      minSalary: input.minSalary ?? MIN_SALARY,
      teamLimit: input.teamLimit ?? TEAM_LIMIT,
      banned: atCap,
      prev,
      uniques: input.uniques ?? 1,
    });
    if (!built) {
      built = solveOne(pool, required, {
        qbStackTeam: input.qbStackTeam.toUpperCase(),
        bringBackTeam: input.bringBackTeam.toUpperCase(),
        stackCount: input.stackCount ?? 2,
        bringBackCount: input.bringBackCount ?? 1,
        cap: input.salaryCap ?? SALARY_CAP,
        minSalary: input.minSalary ?? MIN_SALARY,
        teamLimit: input.teamLimit ?? TEAM_LIMIT,
        banned: new Set(),
        prev,
        uniques: input.uniques ?? 1,
      });
    }
    if (!built) break;
    const lu = toDfsLineup(built, String(i));
    if (!lu) break;
    lineups.push(lu);
    prev.push(new Set(built.map((p) => p.player_id)));
    for (const p of built) exposure.set(p.player_id, (exposure.get(p.player_id) ?? 0) + 1);
  }

  if (lineups.length === 0) {
    return { lineups: [], error: "No lineup satisfied the locks, stack rules, and salary cap." };
  }
  if (lineups.length < n) {
    return { lineups, error: `Built ${lineups.length} of ${n} lineups.` };
  }
  return { lineups, error: null };
}

export function optimizeFromPool(players: SlatePlayer[], pool: PoolState, seed?: number): OptimizeResult {
  return optimizeClassic(players, {
    locked: pool.locked,
    excluded: pool.excluded,
    stacked: pool.stacked,
    qbStackTeam: pool.qbStackTeam,
    bringBackTeam: pool.bringBackTeam,
    randomness: pool.randomness,
    maxExposure: pool.maxExposure,
    nLineups: pool.nLineups,
    seed,
  });
}

export function exportBuiltLineups(runId: string, slateId: string, lineups: DfsLineup[]): string {
  return formatUploadCsv(runId, slateId, lineups);
}

export function dkIdsInCsv(csv: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) return out;
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const nameI = header.indexOf("name");
  const idI = header.indexOf("id");
  if (nameI < 0 || idI < 0) return out;
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const name = (cols[nameI] ?? "").trim();
    const id = (cols[idI] ?? "").trim();
    if (name && id) out.set(name.toLowerCase(), id);
  }
  return out;
}
