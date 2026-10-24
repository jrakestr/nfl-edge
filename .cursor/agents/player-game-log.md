---
name: player-game-log
description: Specialist for the Player Detail (/props/[game]/[player]) unified Season Game Log table. Use proactively when modifying PropDetail.tsx, PlayerAnalysis.tsx, player-history.ts, or queries/props.ts.
---

You are the `player-game-log` subagent for `nfl-edge`.

## Strict File Ownership Boundary
You may ONLY read/modify:
- `web/src/components/prop/PropDetail.tsx`
- `web/src/components/prop/PropDetail.test.tsx`
- `web/src/components/players/PlayerAnalysis.tsx`
- `web/src/lib/player-history.ts`
- `web/src/lib/player-history.test.ts`
- `web/src/lib/queries/props.ts`
- `web/src/app/props/[game]/[player]/page.tsx`

Do NOT touch `PlayersList.tsx`, `player-edit.ts`, or `queries/players.ts`.

## Requirements
1. In `web/src/components/prop/PropDetail.tsx`:
   - Remove the `<ul className="mt-1 flex flex-col gap-0.5">` plain-text weekly dump from the header card (keep the single summary line `{realized.season} DK · {realized.ppg.toFixed(1)} /g · {realized.gp} gp`).
2. In `web/src/lib/queries/props.ts` & `web/src/app/props/[game]/[player]/page.tsx`:
   - Add `playerSimProjections(playerId: string, season: number): Promise<SimWeek[]>` querying our simulation's weekly DK projection (`proj_dk_mean` from `model.player_proj_actual` for graded weeks, plus latest run `fpts_dk_mean` from `model.proj_players` joined to `model.sim_runs` for ungraded/upcoming weeks in `season`).
   - Pass `simProjections` into `PropDetail` and `PlayerAnalysis`.
3. In `web/src/lib/player-history.ts` & `web/src/components/players/PlayerAnalysis.tsx`:
   - Remove the two separate cards (`Season stats` and `Scored vs projected`), the separate paired bar chart, and the confusing `"160.7 DraftKings points over 5 games. Versus FantasyPros, +17.2 across 1 week."` sentence.
   - Replace with a single card (`Season game log`) and a single unified `DataTable` with one row per week (`week <= pageWeek`) combining:
     - `Week` (with `Projection` tag on upcoming week)
     - `Opp`
     - `Scored DK` (`actual.fpts_dk`, `DNP` when `!had_opportunity`, `—` when upcoming)
     - `Sim DK` (our sim's projected DK points for that week)
     - `FP DK` (FantasyPros projected DK points for that week)
     - `Delta` (`Scored DK - Sim DK`, fallback `Scored DK - FP DK` if Sim DK is null; colored with `deltaTone`)
     - Position counting stat columns (`countingColumns(position)`: e.g. `Carries`, `Rush yds`, `Rush TD`, `Rec`, `Rec yds` for RB; `Pass yds`, `Pass TD`, `INT`, `Rush yds`, `Rush TD` for QB; `Targets`, `Rec`, `Rec yds`, `Rec TD`, `Carries`, `Rush yds` for WR/TE).
4. Update unit and component tests in `web/src/lib/player-history.test.ts` and `web/src/components/prop/PropDetail.test.tsx` and ensure `npx vitest run src/lib/player-history.test.ts src/components/prop/PropDetail.test.tsx` passes.
