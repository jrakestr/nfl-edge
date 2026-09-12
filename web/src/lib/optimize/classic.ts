import type { Constraint } from "./glpk";
import { teamOpponents } from "./pool";
import type { OptPlayer, SolveControls } from "./types";

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
    { name: "rb", vars: vars(byPos("RB").map(({ i }) => i)), bound: { kind: "db", lo: 2, up: 3 } },
    { name: "wr", vars: vars(byPos("WR").map(({ i }) => i)), bound: { kind: "db", lo: 3, up: 4 } },
    { name: "te", vars: vars(byPos("TE").map(({ i }) => i)), bound: { kind: "db", lo: 1, up: 2 } },
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
  }

  return { objective, constraints, binaries };
}

export function addUniqueness(priorIds: string[][], players: OptPlayer[]): Constraint[] {
  return priorIds.map((ids, li) => {
    const set = new Set(ids);
    const vars = players
      .map((p, i) => (set.has(p.player_dk_id) ? { name: `x${i}`, coef: 1 } : null))
      .filter((v): v is { name: string; coef: number } => v != null);
    return { name: `uniq_${li}`, vars, bound: { kind: "up" as const, val: ids.length - 3 } };
  });
}
