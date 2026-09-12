export type TeamInput = {
  team: string;
  off_ppd_raw: number | null;
  off_ppd_adj: number | null;
  def_ppd_allowed: number | null;
  drives_mean: number | null;
  league_off_ppd: number | null;
  league_def_ppd_allowed: number | null;
  qb_starter_id: string | null;
  qb_starter_name: string | null;
  qb_lookback_id: string | null;
  qb_lookback_name: string | null;
  qb_lookback_att: number | null;
  qb_starter_att: number | null;
  qb_pass_factor: number | null;
};

export function starterDiffers(row: TeamInput): boolean {
  return Boolean(row.qb_starter_id && row.qb_lookback_id && row.qb_starter_id !== row.qb_lookback_id);
}

export function inputsForMatchup(
  all: Record<string, TeamInput>,
  away: string,
  home: string,
): Record<string, TeamInput> {
  const out: Record<string, TeamInput> = {};
  if (all[away]) out[away] = all[away];
  if (all[home]) out[home] = all[home];
  return out;
}
