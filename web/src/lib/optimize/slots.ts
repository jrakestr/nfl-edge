import type { OptPlayer, SolvedLineup, SolvedPlayer } from "./types";

function byProj(a: OptPlayer, b: OptPlayer): number {
  return b.proj - a.proj || a.name.localeCompare(b.name);
}

function toSlot(slot: string, p: OptPlayer): SolvedPlayer {
  return {
    slot,
    name: p.name,
    dk_id: p.player_dk_id,
    team: p.team,
    position: p.position,
    proj_own: p.proj_own,
  };
}

function stackLabel(players: { team: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const p of players) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
  const best = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? `${best[0]} ${best[1]}` : null;
}

function ownershipSum(players: { proj_own: number | null }[]): number | null {
  const vals = players.map((p) => p.proj_own).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

export function assignClassic(selected: OptPlayer[], lineupId: string): SolvedLineup {
  const qb = selected.filter((p) => p.position === "QB");
  const rb = selected.filter((p) => p.position === "RB").sort(byProj);
  const wr = selected.filter((p) => p.position === "WR").sort(byProj);
  const te = selected.filter((p) => p.position === "TE").sort(byProj);
  const dst = selected.filter((p) => p.position === "DST");
  const flex: OptPlayer[] = [];
  const rbs = rb.slice(0, 2);
  flex.push(...rb.slice(2));
  const wrs = wr.slice(0, 3);
  flex.push(...wr.slice(3));
  const tes = te.slice(0, 1);
  flex.push(...te.slice(1));
  const players = [
    toSlot("QB", qb[0]!),
    toSlot("RB", rbs[0]!),
    toSlot("RB2", rbs[1]!),
    toSlot("WR", wrs[0]!),
    toSlot("WR2", wrs[1]!),
    toSlot("WR3", wrs[2]!),
    toSlot("TE", tes[0]!),
    toSlot("FLEX", flex[0]!),
    toSlot("DST", dst[0]!),
  ];
  return {
    lineup_id: lineupId,
    salary_used: selected.reduce((s, p) => s + p.salary, 0),
    proj_fpts: selected.reduce((s, p) => s + p.proj, 0),
    ownership_sum: ownershipSum(selected),
    stack: stackLabel(selected),
    players,
  };
}

export function assignShowdown(cpt: OptPlayer, flex: OptPlayer[], lineupId: string): SolvedLineup {
  const flexSorted = [...flex].sort(byProj);
  const players = [
    toSlot("CPT", cpt),
    ...flexSorted.map((p, i) => toSlot(i === 0 ? "FLEX" : `FLEX${i + 1}`, p)),
  ];
  const salary = Math.round(cpt.salary * 1.5) + flex.reduce((s, p) => s + p.salary, 0);
  const proj = cpt.proj * 1.5 + flex.reduce((s, p) => s + p.proj, 0);
  return {
    lineup_id: lineupId,
    salary_used: salary,
    proj_fpts: proj,
    ownership_sum: ownershipSum([cpt, ...flex]),
    stack: stackLabel([cpt, ...flex]),
    players,
  };
}

export function idsOf(lineup: SolvedLineup): string[] {
  return lineup.players.map((p) => p.dk_id).filter(Boolean);
}
