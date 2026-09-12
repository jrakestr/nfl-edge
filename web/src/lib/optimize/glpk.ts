import type { LP } from "glpk.js";
import { getGlpk } from "./glpk-load";

export type Bound =
  | { kind: "eq"; val: number }
  | { kind: "lo"; val: number }
  | { kind: "up"; val: number }
  | { kind: "db"; lo: number; up: number };

export type Constraint = {
  name: string;
  vars: { name: string; coef: number }[];
  bound: Bound;
};

export async function solveMip(
  name: string,
  objective: { name: string; coef: number }[],
  constraints: Constraint[],
  binaries: string[],
): Promise<Record<string, number> | null> {
  const glpk = await getGlpk();
  const subjectTo = constraints.map((c) => {
    const b =
      c.bound.kind === "eq"
        ? { type: glpk.GLP_FX, lb: c.bound.val, ub: c.bound.val }
        : c.bound.kind === "lo"
          ? { type: glpk.GLP_LO, lb: c.bound.val, ub: 0 }
          : c.bound.kind === "up"
            ? { type: glpk.GLP_UP, lb: 0, ub: c.bound.val }
            : { type: glpk.GLP_DB, lb: c.bound.lo, ub: c.bound.up };
    return { name: c.name, vars: c.vars, bnds: b };
  });
  const lp: LP = {
    name,
    objective: { direction: glpk.GLP_MAX, name: "obj", vars: objective },
    subjectTo,
    binaries,
  };
  const res = await glpk.solve(lp, { msglev: glpk.GLP_MSG_OFF, presol: true });
  const status = res.result.status;
  if (status !== glpk.GLP_OPT && status !== glpk.GLP_FEAS) return null;
  return res.result.vars;
}
