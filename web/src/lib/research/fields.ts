/**
 * Research Lab field catalog: plain-English label, one-line explanation, display unit and the
 * data source a field needs. SQL-free so client components can import it.
 *
 * `scale` converts a stored fraction to a percent for display and for the state sent to Jev.
 * `needs` is what the weekly build must have for the field to exist ("needs data: <needs>").
 */

export type FieldMeta = {
  label: string;
  explain: string;
  needs: string;
  /** Multiply the stored value by this before showing or sending (shares are stored as 0..1). */
  scale?: number;
  /** Decimal places for display and the state sent to Jev. */
  digits?: number;
};

const SALARY = "DK salaries for this week";
const SIM = "a sim run for this week made before kickoff";
const DRAWS = "sim draws for this week (they are deleted after grading)";
const RESULTS = "results from weeks before this one";
const LINES = "market lines for this week's games";
const INJURY = "injury and override rows for this week";
const OWN = "FantasyPros projected ownership for this week";
const USAGE = "usage history from before this week";

export const FIELD_META: Record<string, FieldMeta> = {
  // price
  dk_salary: { label: "DK salary ($)", explain: "His DraftKings classic salary this week.", needs: SALARY, digits: 0 },
  salary_pos_rank: {
    label: "Salary rank at position (1 = priciest)",
    explain: "Where his salary sits among players at his position.",
    needs: SALARY,
    digits: 0,
  },
  // sim projection
  sim_dk_mean: {
    label: "Sim projection (DK points)",
    explain: "Average DraftKings points across 20,000 simulated games.",
    needs: SIM,
    digits: 1,
  },
  sim_dk_sd: {
    label: "Sim spread of outcomes (DK points)",
    explain: "How far his simulated scores typically sit from the average.",
    needs: SIM,
    digits: 1,
  },
  sim_dk_p10: {
    label: "Sim bad game, 1 in 10 (DK points)",
    explain: "He scores at least this much in 9 of 10 simulated games.",
    needs: DRAWS,
    digits: 1,
  },
  sim_dk_p50: {
    label: "Sim typical game (DK points)",
    explain: "The middle simulated outcome.",
    needs: DRAWS,
    digits: 1,
  },
  sim_dk_p90: {
    label: "Sim big game, 1 in 10 (DK points)",
    explain: "He beats this in 1 of 10 simulated games.",
    needs: DRAWS,
    digits: 1,
  },
  sim_p_3x: {
    label: "Chance of 3x salary (%)",
    explain: "Share of simulated games where he scores 3 points per $1,000 of salary, the usual cash target.",
    needs: DRAWS,
    scale: 100,
    digits: 0,
  },
  sim_p_5x: {
    label: "Chance of 5x salary (%)",
    explain: "Share of simulated games where he scores 5 points per $1,000 of salary, the usual tournament target.",
    needs: DRAWS,
    scale: 100,
    digits: 0,
  },
  sim_value_x: {
    label: "Projected points per $1,000",
    explain: "Sim projection divided by salary in thousands.",
    needs: SIM,
    digits: 2,
  },
  // matchup
  opp_dk_allowed_pos: {
    label: "DK points the opponent allows to this position, per game",
    explain: "What the defense he faces has given up to his position group in each game so far.",
    needs: RESULTS,
    digits: 1,
  },
  opp_dk_allowed_pos_vs_league: {
    label: "Opponent vs league average at this position (%)",
    explain: "Positive means the defense gives up more than average to his position.",
    needs: RESULTS,
    scale: 100,
    digits: 0,
  },
  opp_dk_allowed_pos_rank: {
    label: "Opponent rank at this position (1 = most generous)",
    explain: "Where the defense ranks for points allowed to his position.",
    needs: RESULTS,
    digits: 0,
  },
  opp_games: {
    label: "Games in the opponent sample",
    explain: "How many games the opponent numbers above are based on.",
    needs: RESULTS,
    digits: 0,
  },
  opp_def_ppd_allowed: {
    label: "Opponent points allowed per drive (sim input)",
    explain: "The defense's strength as the simulator rated it.",
    needs: SIM,
    digits: 2,
  },
  opp_def_ppd_vs_league: {
    label: "Opponent defense vs league average (%)",
    explain: "Positive means the simulator rates the defense worse than average.",
    needs: SIM,
    scale: 100,
    digits: 0,
  },
  // game environment
  team_spread: {
    label: "His team's point spread (negative = favorite)",
    explain: "The betting line on his team before kickoff.",
    needs: LINES,
    digits: 1,
  },
  game_total: {
    label: "Game total (points)",
    explain: "The betting line for combined points in his game.",
    needs: LINES,
    digits: 1,
  },
  team_implied_total: {
    label: "His team's implied points",
    explain: "Points the betting market expects his team to score.",
    needs: LINES,
    digits: 1,
  },
  sim_team_drives: {
    label: "Sim drives for his team",
    explain: "How many possessions the simulator expects his team to get.",
    needs: SIM,
    digits: 1,
  },
  sim_team_plays_per_drive: {
    label: "Sim plays per drive for his team",
    explain: "The simulator's pace: more plays per drive means more volume.",
    needs: SIM,
    digits: 1,
  },
  sim_team_neutral_pass_rate: {
    label: "Sim pass rate when the game is close (%)",
    explain: "How pass-heavy his team is when the score is not forcing the issue.",
    needs: SIM,
    scale: 100,
    digits: 0,
  },
  // opportunity
  teammates_out_target_share: {
    label: "Targets freed by teammates ruled out (% of team)",
    explain: "Share of team targets that belong to teammates listed out or doubtful this week.",
    needs: INJURY,
    scale: 100,
    digits: 1,
  },
  teammates_out_carry_share: {
    label: "Carries freed by teammates ruled out (% of team)",
    explain: "Share of team carries that belong to teammates listed out or doubtful this week.",
    needs: INJURY,
    scale: 100,
    digits: 1,
  },
  listed_out: { label: "Listed out (1 = yes)", explain: "Ruled out for this week.", needs: INJURY, digits: 0 },
  listed_doubtful: {
    label: "Listed doubtful (1 = yes)",
    explain: "Doubtful to play this week.",
    needs: INJURY,
    digits: 0,
  },
  listed_questionable: {
    label: "Listed questionable (1 = yes)",
    explain: "Questionable to play this week.",
    needs: INJURY,
    digits: 0,
  },
  // ownership
  own_pct_est: {
    label: "Projected ownership (%)",
    explain: "Middle of FantasyPros' projected roster-percent range.",
    needs: OWN,
    digits: 1,
  },
  own_pct_low: { label: "Projected ownership, low end (%)", explain: "Bottom of the projected range.", needs: OWN, digits: 0 },
  own_pct_high: { label: "Projected ownership, high end (%)", explain: "Top of the projected range.", needs: OWN, digits: 0 },
  // usage and form
  target_share: {
    label: "Target share (% of team targets)",
    explain: "Share of his team's passes thrown his way, weighted toward recent games.",
    needs: USAGE,
    scale: 100,
    digits: 1,
  },
  carry_share: {
    label: "Carry share (% of team carries)",
    explain: "Share of his team's rushes he takes, weighted toward recent games.",
    needs: USAGE,
    scale: 100,
    digits: 1,
  },
  rz_target_share: {
    label: "Red-zone target share (%)",
    explain: "Share of his team's expected receiving touchdowns.",
    needs: USAGE,
    scale: 100,
    digits: 1,
  },
  rz_carry_share: {
    label: "Red-zone carry share (%)",
    explain: "Share of his team's expected rushing touchdowns.",
    needs: USAGE,
    scale: 100,
    digits: 1,
  },
  snap_pct: {
    label: "Snap share, recent seasons (%)",
    explain: "Share of team offensive snaps, weighted toward recent games.",
    needs: USAGE,
    scale: 100,
    digits: 0,
  },
  games_played: {
    label: "Games played this season",
    explain: "How many games the season numbers are based on.",
    needs: USAGE,
    digits: 0,
  },
  targets_l3: {
    label: "Targets, last 3 games",
    explain: "Average targets per game over his last three games.",
    needs: USAGE,
    digits: 1,
  },
  receptions_l3: {
    label: "Receptions, last 3 games",
    explain: "Average catches per game over his last three games.",
    needs: USAGE,
    digits: 1,
  },
  rec_yds_l3: {
    label: "Receiving yards, last 3 games",
    explain: "Average receiving yards per game over his last three games.",
    needs: USAGE,
    digits: 1,
  },
  carries_l3: {
    label: "Carries, last 3 games",
    explain: "Average rushes per game over his last three games.",
    needs: USAGE,
    digits: 1,
  },
  rush_yds_l3: {
    label: "Rushing yards, last 3 games",
    explain: "Average rushing yards per game over his last three games.",
    needs: USAGE,
    digits: 1,
  },
  dk_pts_l3: {
    label: "DK points, last 3 games",
    explain: "Average DraftKings points per game over his last three games.",
    needs: USAGE,
    digits: 1,
  },
  dk_pts_season: {
    label: "DK points per game, this season",
    explain: "Average DraftKings points per game before this week.",
    needs: USAGE,
    digits: 1,
  },
  dk_pts_sd: {
    label: "Game-to-game swing in DK points",
    explain: "How much his weekly DraftKings score has bounced around this season.",
    needs: "two or more games this season",
    digits: 1,
  },
  dk_pts_min: {
    label: "Worst game this season (DK points)",
    explain: "His lowest DraftKings score so far this season.",
    needs: "two or more games this season",
    digits: 1,
  },
  snap_pct_l3: {
    label: "Snap share, last 3 games (%)",
    explain: "Average share of team offensive snaps over his last three games.",
    needs: "snap counts from before this week",
    scale: 100,
    digits: 0,
  },
  snap_pct_last: {
    label: "Snap share, last game (%)",
    explain: "Share of team offensive snaps in his most recent game.",
    needs: "snap counts from before this week",
    scale: 100,
    digits: 0,
  },
};

/** Plain-English field name. Unknown keys are spelled out; snake_case never reaches the screen. */
export function fieldLabel(key: string): string {
  const known = FIELD_META[key]?.label;
  if (known) return known;
  const words = key.replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : key;
}

/** One-line explanation of a field. */
export function fieldExplain(key: string): string {
  return FIELD_META[key]?.explain ?? "";
}

/** The value as shown to people and sent to Jev: scaled and rounded, null stays null. */
export function fieldValue(key: string, value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const m = FIELD_META[key];
  const scaled = value * (m?.scale ?? 1);
  const d = m?.digits ?? 2;
  return Number(scaled.toFixed(d));
}

export function fieldNeeds(key: string): string {
  return FIELD_META[key]?.needs ?? "this field's source data";
}
