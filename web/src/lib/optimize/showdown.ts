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

  return { objective, constraints, binaries };
}

export function addShowdownUniqueness(priorIds: string[][], players: OptPlayer[]): Constraint[] {
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
    return { name: `uniq_${li}`, vars, bound: { kind: "up" as const, val: ids.length - 3 } };
  });
}
