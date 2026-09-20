import { addUniqueness, classicConstraints, classicForcedInError, flexConstructionError } from "./classic";
import { adjustedFpts, profile, type SlateKind } from "./construction";
import { solveMip } from "./glpk";
import { assertUniquePlayerIds, jitterProj, playerKey } from "./pool";
import { addShowdownUniqueness, showdownConstraints } from "./showdown";
import { assignClassic, assignShowdown, idsOf } from "./slots";
import type { OptPlayer, SolveControls, SolvedLineup } from "./types";

export function playerObjective(
  p: OptPlayer,
  controls: SolveControls,
  kind: SlateKind,
  rng: () => number = () => 0,
): number {
  const prof = profile(kind, controls.construction);
  const raw = adjustedFpts(p.proj, p.p25, p.p90, p.proj_own, prof);
  return jitterProj(raw, controls.randomness, rng);
}

function selected(vars: Record<string, number>, players: OptPlayer[], prefix = "x"): OptPlayer[] {
  return players.filter((_, i) => (vars[`${prefix}${i}`] ?? 0) > 0.5);
}

function requiredIds(players: OptPlayer[], controls: SolveControls, showdown: boolean): Set<string> {
  const inPool = new Set(players.map((p) => p.player_dk_id));
  const required = new Set(controls.locks.filter((id) => inPool.has(id)));
  if (!showdown && controls.requireStack) {
    const stack = controls.stackIds.filter((id) => inPool.has(id));
    if (stack.length >= 2) {
      for (const id of stack) required.add(id);
    }
  }
  return required;
}

function assertLineupPlayerIds(picked: OptPlayer[]): void {
  const seen = new Map<string, OptPlayer>();
  for (const p of picked) {
    const id = playerKey(p);
    const prev = seen.get(id);
    if (prev) {
      throw new Error(`${p.name} appears twice in one lineup; that is a bug, not a lineup.`);
    }
    seen.set(id, p);
  }
}

function assertRequired(lineup: SolvedLineup, players: OptPlayer[], required: Set<string>): void {
  const have = new Set(idsOf(lineup));
  for (const id of required) {
    if (have.has(id)) continue;
    const name = players.find((p) => p.player_dk_id === id)?.name ?? id;
    throw new Error(`Solve dropped ${name}; that is a bug, not a lineup.`);
  }
}

function shortfall(have: number, requested: number): never {
  if (have === 0) throw new Error("No lineup fits these locks and rules.");
  throw new Error(
    `Generated ${have} of ${requested} lineups; no additional lineup fits the remaining pool.`,
  );
}

export async function solveClassic(
  players: OptPlayer[],
  controls: SolveControls,
  rng: () => number = Math.random,
  kind: SlateKind = "classic",
): Promise<SolvedLineup[]> {
  assertUniquePlayerIds(players);
  const conflict = flexConstructionError(controls) ?? classicForcedInError(players, controls);
  if (conflict) throw new Error(conflict);

  const lineups: SolvedLineup[] = [];
  const prior: string[][] = [];
  const counts = new Map<string, number>();
  const maxCount = Math.floor((controls.maxExposure / 100) * Math.max(1, controls.lineups));
  const excludes = new Set(controls.excludes);
  const required = requiredIds(players, controls, false);

  for (let k = 0; k < controls.lineups; k++) {
    const proj = players.map((p) => playerObjective(p, controls, kind, rng));
    const live = { ...controls, excludes: [...excludes] };
    const model = classicConstraints(players, live, proj);
    model.constraints.push(...addUniqueness(prior, players, controls.minPlayerDiff));
    const vars = await solveMip(`classic_${k}`, model.objective, model.constraints, model.binaries);
    const picked = vars ? selected(vars, players) : [];
    if (!vars || picked.length !== 9) shortfall(lineups.length, controls.lineups);
    assertLineupPlayerIds(picked);
    const lineup = assignClassic(picked, String(k));
    assertRequired(lineup, players, required);
    lineups.push(lineup);
    const ids = idsOf(lineup);
    prior.push(ids);
    for (const id of ids) {
      const next = (counts.get(id) ?? 0) + 1;
      counts.set(id, next);
      if (next >= maxCount && !required.has(id)) excludes.add(id);
    }
  }
  return lineups;
}

export async function solveShowdown(
  players: OptPlayer[],
  controls: SolveControls,
  rng: () => number = Math.random,
  kind: SlateKind = "showdown",
): Promise<SolvedLineup[]> {
  const lineups: SolvedLineup[] = [];
  const prior: string[][] = [];
  const counts = new Map<string, number>();
  const maxCount = Math.floor((controls.maxExposure / 100) * Math.max(1, controls.lineups));
  const excludes = new Set(controls.excludes);
  const required = requiredIds(players, controls, true);

  for (let k = 0; k < controls.lineups; k++) {
    const proj = players.map((p) => playerObjective(p, controls, kind, rng));
    const live = { ...controls, excludes: [...excludes] };
    const model = showdownConstraints(players, live, proj);
    model.constraints.push(...addShowdownUniqueness(prior, players, controls.minPlayerDiff));
    const vars = await solveMip(`showdown_${k}`, model.objective, model.constraints, model.binaries);
    const cpt = vars ? selected(vars, players, "c") : [];
    const flex = vars ? selected(vars, players, "f") : [];
    if (!vars || cpt.length !== 1 || flex.length !== 5 || flex.some((p) => playerKey(p) === playerKey(cpt[0]!))) {
      shortfall(lineups.length, controls.lineups);
    }
    assertLineupPlayerIds([cpt[0]!, ...flex]);
    const lineup = assignShowdown(cpt[0]!, flex, String(k));
    assertRequired(lineup, players, required);
    lineups.push(lineup);
    const ids = idsOf(lineup);
    prior.push(ids);
    for (const id of ids) {
      const next = (counts.get(id) ?? 0) + 1;
      counts.set(id, next);
      if (next >= maxCount && !required.has(id)) excludes.add(id);
    }
  }
  return lineups;
}

export async function solveSlate(
  players: OptPlayer[],
  controls: SolveControls,
  showdown: boolean,
  rng: () => number = Math.random,
): Promise<SolvedLineup[]> {
  return showdown ? solveShowdown(players, controls, rng) : solveClassic(players, controls, rng);
}
