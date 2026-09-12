import { addUniqueness, classicConstraints } from "./classic";
import { solveMip } from "./glpk";
import { jitterProj } from "./pool";
import { addShowdownUniqueness, showdownConstraints } from "./showdown";
import { assignClassic, assignShowdown, idsOf } from "./slots";
import type { OptPlayer, SolveControls, SolvedLineup } from "./types";

function selected(vars: Record<string, number>, players: OptPlayer[], prefix = "x"): OptPlayer[] {
  return players.filter((_, i) => (vars[`${prefix}${i}`] ?? 0) > 0.5);
}

export async function solveClassic(
  players: OptPlayer[],
  controls: SolveControls,
  rng: () => number = Math.random,
): Promise<SolvedLineup[]> {
  const lineups: SolvedLineup[] = [];
  const prior: string[][] = [];
  const counts = new Map<string, number>();
  const maxCount = Math.floor((controls.maxExposure / 100) * Math.max(1, controls.lineups));
  const excludes = new Set(controls.excludes);

  for (let k = 0; k < controls.lineups; k++) {
    const proj = players.map((p) => jitterProj(p.proj, controls.randomness, rng));
    const live = { ...controls, excludes: [...excludes] };
    const model = classicConstraints(players, live, proj);
    model.constraints.push(...addUniqueness(prior, players));
    const vars = await solveMip(`classic_${k}`, model.objective, model.constraints, model.binaries);
    if (!vars) break;
    const picked = selected(vars, players);
    if (picked.length !== 9) break;
    const lineup = assignClassic(picked, String(k));
    lineups.push(lineup);
    const ids = idsOf(lineup);
    prior.push(ids);
    for (const id of ids) {
      const next = (counts.get(id) ?? 0) + 1;
      counts.set(id, next);
      if (next >= maxCount) excludes.add(id);
    }
  }
  return lineups;
}

export async function solveShowdown(
  players: OptPlayer[],
  controls: SolveControls,
  rng: () => number = Math.random,
): Promise<SolvedLineup[]> {
  const lineups: SolvedLineup[] = [];
  const prior: string[][] = [];
  const counts = new Map<string, number>();
  const maxCount = Math.floor((controls.maxExposure / 100) * Math.max(1, controls.lineups));
  const excludes = new Set(controls.excludes);

  for (let k = 0; k < controls.lineups; k++) {
    const proj = players.map((p) => jitterProj(p.proj, controls.randomness, rng));
    const live = { ...controls, excludes: [...excludes] };
    const model = showdownConstraints(players, live, proj);
    model.constraints.push(...addShowdownUniqueness(prior, players));
    const vars = await solveMip(`showdown_${k}`, model.objective, model.constraints, model.binaries);
    if (!vars) break;
    const cpt = selected(vars, players, "c");
    const flex = selected(vars, players, "f");
    if (cpt.length !== 1 || flex.length !== 5) break;
    if (flex.some((p) => p.player_dk_id === cpt[0]!.player_dk_id)) break;
    const lineup = assignShowdown(cpt[0]!, flex, String(k));
    lineups.push(lineup);
    const ids = idsOf(lineup);
    prior.push(ids);
    for (const id of ids) {
      const next = (counts.get(id) ?? 0) + 1;
      counts.set(id, next);
      if (next >= maxCount) excludes.add(id);
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
