import type { Constraint } from "./glpk";
import type { OptPlayer, SolveControls } from "./types";

const CPT = 1.5;

export function showdownConstraints(
  players: OptPlayer[],
  controls: SolveControls,
  proj: number[],
): { objective: { name: string; coef: number }[]; constraints: Constraint[]; binaries: string[] } {
  const n = players.length;
  const c = (i: number) => `c${i}`;
  const f = (i: number) => `f${i}`;
  const binaries = players.flatMap((_, i) => [c(i), f(i)]);

  const objective = players.flatMap((p, i) => [
    { name: c(i), coef: CPT * proj[i]! + 1e-6 * p.value },
    { name: f(i), coef: proj[i]! + 1e-6 * p.value },
  ]);

  const constraints: Constraint[] = [
    { name: "cpt", vars: players.map((_, i) => ({ name: c(i), coef: 1 })), bound: { kind: "eq", val: 1 } },
    { name: "flex", vars: players.map((_, i) => ({ name: f(i), coef: 1 })), bound: { kind: "eq", val: 5 } },
    {
      name: "salary_hi",
      vars: players.flatMap((p, i) => [
        { name: c(i), coef: CPT * p.salary },
        { name: f(i), coef: p.salary },
      ]),
      bound: { kind: "up", val: controls.salaryCap },
    },
  ];
  if (controls.minSalary > 0) {
    constraints.push({
      name: "salary_lo",
      vars: players.flatMap((p, i) => [
        { name: c(i), coef: CPT * p.salary },
        { name: f(i), coef: p.salary },
      ]),
      bound: { kind: "lo", val: controls.minSalary },
    });
  }

  for (let i = 0; i < n; i++) {
    constraints.push({
      name: `once_${i}`,
      vars: [
        { name: c(i), coef: 1 },
        { name: f(i), coef: 1 },
      ],
      bound: { kind: "up", val: 1 },
    });
  }

  const byPlayer = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const pid = players[i]!.player_id;
    if (!pid) continue;
    const list = byPlayer.get(pid) ?? [];
    list.push(i);
    byPlayer.set(pid, list);
  }
  for (const [pid, idxs] of byPlayer) {
    if (idxs.length < 2) continue;
    constraints.push({
      name: `once_player_${pid}`,
      vars: idxs.flatMap((i) => [
        { name: c(i), coef: 1 },
        { name: f(i), coef: 1 },
      ]),
      bound: { kind: "up", val: 1 },
    });
  }

  const lockSet = new Set(controls.locks);
  const exclSet = new Set(controls.excludes);
  for (let i = 0; i < n; i++) {
    const id = players[i]!.player_dk_id;
    if (lockSet.has(id)) {
      constraints.push({
        name: `lock_${id}`,
        vars: [
          { name: c(i), coef: 1 },
          { name: f(i), coef: 1 },
        ],
        bound: { kind: "eq", val: 1 },
      });
    }
    if (exclSet.has(id)) {
      constraints.push({ name: `excl_c_${id}`, vars: [{ name: c(i), coef: 1 }], bound: { kind: "eq", val: 0 } });
      constraints.push({ name: `excl_f_${id}`, vars: [{ name: f(i), coef: 1 }], bound: { kind: "eq", val: 0 } });
    }
  }

  const sd = controls.showdownScript;
  if (sd === "shootout") {
    const qbs = players.map((p, i) => (p.position === "QB" ? i : -1)).filter((i) => i >= 0);
    if (qbs.length) {
      constraints.push({
        name: "sd_shootout_qb",
        vars: qbs.flatMap((i) => [
          { name: c(i), coef: 1 },
          { name: f(i), coef: 1 },
        ]),
        bound: { kind: "lo", val: 1 },
      });
    }
    const passCatchers = players
      .map((p, i) => (p.position === "WR" || p.position === "TE" ? i : -1))
      .filter((i) => i >= 0);
    if (passCatchers.length >= 3) {
      constraints.push({
        name: "sd_shootout_wrte",
        vars: passCatchers.flatMap((i) => [
          { name: c(i), coef: 1 },
          { name: f(i), coef: 1 },
        ]),
        bound: { kind: "lo", val: 3 },
      });
    }
    const dsts = players.map((p, i) => (p.position === "DST" ? i : -1)).filter((i) => i >= 0);
    if (dsts.length) {
      constraints.push({
        name: "sd_shootout_nodst_cpt",
        vars: dsts.map((i) => ({ name: c(i), coef: 1 })),
        bound: { kind: "eq", val: 0 },
      });
    }
  } else if (sd === "away_control" || sd === "home_control") {
    const leadSide = sd === "home_control" ? "home" : "away";
    const leadIdxs = players.map((p, i) => (p.homeAway === leadSide ? i : -1)).filter((i) => i >= 0);
    if (leadIdxs.length >= 4) {
      constraints.push({
        name: `sd_${sd}_lead`,
        vars: leadIdxs.flatMap((i) => [
          { name: c(i), coef: 1 },
          { name: f(i), coef: 1 },
        ]),
        bound: { kind: "db", lo: 4, up: 5 },
      });
    }
  } else if (sd === "defensive") {
    const rbDst = players
      .map((p, i) => (p.position === "RB" || p.position === "DST" ? i : -1))
      .filter((i) => i >= 0);
    if (rbDst.length >= 2) {
      constraints.push({
        name: "sd_def_rbdst",
        vars: rbDst.flatMap((i) => [
          { name: c(i), coef: 1 },
          { name: f(i), coef: 1 },
        ]),
        bound: { kind: "lo", val: 2 },
      });
    }
  }

  return { objective, constraints, binaries };
}

export function addShowdownUniqueness(
  priorIds: string[][],
  players: OptPlayer[],
  minDiff = 3,
): Constraint[] {
  if (minDiff <= 0) return [];
  return priorIds.map((ids, li) => {
    const set = new Set(ids);
    const vars = players.flatMap((p, i) =>
      set.has(p.player_dk_id)
        ? [
            { name: `c${i}`, coef: 1 },
            { name: `f${i}`, coef: 1 },
          ]
        : [],
    );
    return { name: `uniq_${li}`, vars, bound: { kind: "up" as const, val: ids.length - minDiff } };
  });
}
