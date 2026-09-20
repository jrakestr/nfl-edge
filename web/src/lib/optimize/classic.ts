import type { Constraint } from "./glpk";
import { teamOpponents } from "./pool";
import {
  DEFAULT_POS_BOUNDS,
  type FlexPos,
  type OptPlayer,
  type SolveControls,
} from "./types";

export function posRange(pos: FlexPos, controls: SolveControls): { lo: number; hi: number } {
  const def = DEFAULT_POS_BOUNDS[pos];
  const override = controls.posBounds?.[pos];
  const lo = override?.min ?? def.min;
  const hi = override?.max ?? def.max;
  if (!controls.flexEligible[pos]) return { lo, hi: lo };
  return { lo, hi };
}

export function posBound(
  pos: FlexPos,
  controls: SolveControls,
): Constraint["bound"] {
  const { lo, hi } = posRange(pos, controls);
  if (lo === hi) return { kind: "eq", val: lo };
  return { kind: "db", lo, up: hi };
}

/** Classic uses 7 non-QB/DST players. Return a message if the chosen bounds cannot make 7. */
export function flexConstructionError(controls: SolveControls): string | null {
  const rb = posRange("RB", controls);
  const wr = posRange("WR", controls);
  const te = posRange("TE", controls);
  const min = rb.lo + wr.lo + te.lo;
  const max = rb.hi + wr.hi + te.hi;
  if (min <= 7 && 7 <= max) return null;
  const fmt = (p: string, r: { lo: number; hi: number }) =>
    `${p} ${r.lo === r.hi ? r.lo : `${r.lo}–${r.hi}`}`;
  const parts = `${fmt("RB", rb)} + ${fmt("WR", wr)} + ${fmt("TE", te)}`;
  if (max < 7) {
    return `FLEX needs 7 skill players; ${parts} only make ${max}. Recheck a FLEX-eligible position.`;
  }
  return `FLEX needs 7 skill players; ${parts} need at least ${min}. Lower a position minimum.`;
}

const SKILL_WORD: Record<FlexPos, string> = {
  RB: "running backs",
  WR: "wide receivers",
  TE: "tight ends",
};

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** Locks, plus the stacked group when requireStack is on and the group has 2+ pool members. */
export function forcedInPlayers(players: OptPlayer[], controls: SolveControls): OptPlayer[] {
  const want = new Set(controls.locks);
  const stack = controls.stackIds.filter((id) => players.some((p) => p.player_dk_id === id));
  if (controls.requireStack && stack.length >= 2) {
    for (const id of stack) want.add(id);
  }
  return players.filter((p) => want.has(p.player_dk_id));
}

/** Plain-language conflict for an impossible classic pick set. Null if the set can be built. */
export function classicForcedInError(players: OptPlayer[], controls: SolveControls): string | null {
  const forced = forcedInPlayers(players, controls);
  const qbs = forced.filter((p) => p.position === "QB").length;
  if (qbs > 1) return `${qbs} quarterbacks selected; a classic lineup has room for 1`;
  const dsts = forced.filter((p) => p.position === "DST").length;
  if (dsts > 1) return `${dsts} defenses selected; a classic lineup has room for 1`;
  if (forced.length > 9) return `${forced.length} players selected; a classic lineup has room for 9`;
  const sal = forced.reduce((s, p) => s + p.salary, 0);
  if (sal > controls.salaryCap) {
    return `Forced-in players cost ${usd(sal)}; the cap is ${usd(controls.salaryCap)}`;
  }
  for (const pos of ["RB", "WR", "TE"] as FlexPos[]) {
    const n = forced.filter((p) => p.position === pos).length;
    const { hi } = posRange(pos, controls);
    if (n > hi) return `${n} ${SKILL_WORD[pos]} selected; a classic lineup has room for ${hi}`;
  }
  const skill = forced.filter((p) => p.position === "RB" || p.position === "WR" || p.position === "TE").length;
  if (skill > 7) return `${skill} skill players selected; a classic lineup has room for 7`;
  return null;
}

export function classicConstraints(
  players: OptPlayer[],
  controls: SolveControls,
  proj: number[],
): { objective: { name: string; coef: number }[]; constraints: Constraint[]; binaries: string[] } {
  const n = players.length;
  const x = (i: number) => `x${i}`;
  const binaries = players.map((_, i) => x(i));
  const byPos = (pos: string) =>
    players.map((p, i) => ({ i, p })).filter(({ p }) => p.position === pos);
  const vars = (idxs: number[], coef = 1) => idxs.map((i) => ({ name: x(i), coef }));

  const objective = players.map((p, i) => ({
    name: x(i),
    coef: proj[i]! + 1e-6 * p.value,
  }));

  const constraints: Constraint[] = [
    { name: "size", vars: vars([...Array(n).keys()]), bound: { kind: "eq", val: 9 } },
    { name: "qb", vars: vars(byPos("QB").map(({ i }) => i)), bound: { kind: "eq", val: 1 } },
    { name: "rb", vars: vars(byPos("RB").map(({ i }) => i)), bound: posBound("RB", controls) },
    { name: "wr", vars: vars(byPos("WR").map(({ i }) => i)), bound: posBound("WR", controls) },
    { name: "te", vars: vars(byPos("TE").map(({ i }) => i)), bound: posBound("TE", controls) },
    { name: "dst", vars: vars(byPos("DST").map(({ i }) => i)), bound: { kind: "eq", val: 1 } },
    {
      name: "salary_hi",
      vars: players.map((p, i) => ({ name: x(i), coef: p.salary })),
      bound: { kind: "up", val: controls.salaryCap },
    },
    {
      name: "salary_lo",
      vars: players.map((p, i) => ({ name: x(i), coef: p.salary })),
      bound: { kind: "lo", val: controls.minSalary },
    },
  ];

  const teams = [...new Set(players.map((p) => p.team))];
  for (const team of teams) {
    const idxs = players.map((p, i) => (p.team === team ? i : -1)).filter((i) => i >= 0);
    constraints.push({
      name: `team_${team}`,
      vars: vars(idxs),
      bound: { kind: "up", val: controls.maxPerTeam },
    });
  }

  const opp = teamOpponents(players);
  for (const team of teams) {
    const qbIdx = players.map((p, i) => (p.position === "QB" && p.team === team ? i : -1)).filter((i) => i >= 0);
    if (!qbIdx.length) continue;
    if (controls.stackN > 0) {
      const wrte = players
        .map((p, i) => ((p.position === "WR" || p.position === "TE") && p.team === team ? i : -1))
        .filter((i) => i >= 0);
      constraints.push({
        name: `stack_${team}`,
        vars: [...vars(wrte, 1), ...vars(qbIdx, -controls.stackN)],
        bound: { kind: "lo", val: 0 },
      });
    }
    const oppTeam = opp.get(team);
    if (oppTeam && controls.bringBack > 0) {
      const bring = players
        .map((p, i) => (p.team === oppTeam && p.position !== "DST" ? i : -1))
        .filter((i) => i >= 0);
      constraints.push({
        name: `bring_${team}`,
        vars: [...vars(bring, 1), ...vars(qbIdx, -controls.bringBack)],
        bound: { kind: "lo", val: 0 },
      });
    }
    if (controls.noQbVsDst && oppTeam) {
      const dst = players
        .map((p, i) => (p.position === "DST" && p.team === oppTeam ? i : -1))
        .filter((i) => i >= 0);
      if (dst.length) {
        constraints.push({
          name: `qbdst_${team}`,
          vars: [...vars(qbIdx, 1), ...vars(dst, 1)],
          bound: { kind: "up", val: 1 },
        });
      }
    }
  }

  const lockSet = new Set(controls.locks);
  const exclSet = new Set(controls.excludes);
  for (let i = 0; i < n; i++) {
    const id = players[i]!.player_dk_id;
    if (lockSet.has(id)) {
      constraints.push({ name: `lock_${id}`, vars: vars([i]), bound: { kind: "eq", val: 1 } });
    }
    if (exclSet.has(id)) {
      constraints.push({ name: `excl_${id}`, vars: vars([i]), bound: { kind: "eq", val: 0 } });
    }
  }

  const stack = controls.stackIds.filter((id) => players.some((p) => p.player_dk_id === id));
  if (stack.length >= 2) {
    const first = players.findIndex((p) => p.player_dk_id === stack[0]);
    for (const id of stack.slice(1)) {
      const j = players.findIndex((p) => p.player_dk_id === id);
      constraints.push({
        name: `stk_${stack[0]}_${id}`,
        vars: [
          { name: x(first), coef: 1 },
          { name: x(j), coef: -1 },
        ],
        bound: { kind: "eq", val: 0 },
      });
    }
    if (controls.requireStack) {
      constraints.push({
        name: `stk_req_${stack[0]}`,
        vars: vars([first]),
        bound: { kind: "eq", val: 1 },
      });
    }
  }

  return { objective, constraints, binaries };
}

export function addUniqueness(
  priorIds: string[][],
  players: OptPlayer[],
  minDiff = 3,
): Constraint[] {
  if (minDiff <= 0) return [];
  return priorIds.map((ids, li) => {
    const set = new Set(ids);
    const vars = players
      .map((p, i) => (set.has(p.player_dk_id) ? { name: `x${i}`, coef: 1 } : null))
      .filter((v): v is { name: string; coef: number } => v != null);
    return { name: `uniq_${li}`, vars, bound: { kind: "up" as const, val: ids.length - minDiff } };
  });
}
