-- 0050: Foreign key leading-column indexes and query lookup indexes.
-- Covers all remaining unindexed foreign keys in model.* plus hot lookup paths on
-- raw.dk_player_crosswalk, raw.dk_salaries, raw.players, model.market_props, and raw.schedules.

create index if not exists dfs_lineups_run_slate_idx
  on model.dfs_lineups (run_id, site, slate_id, construction);

create index if not exists edges_market_line_idx
  on model.edges (market_line_id);

create index if not exists results_market_line_idx
  on model.results (market_line_id);

create index if not exists results_close_market_line_idx
  on model.results (close_market_line_id)
  where close_market_line_id is not null;

create index if not exists verdicts_market_line_idx
  on model.verdicts (market_line_id);

create index if not exists usage_claims_llm_call_idx
  on model.usage_claims (llm_call_id)
  where llm_call_id is not null;

create index if not exists dk_player_crosswalk_gsis_idx
  on raw.dk_player_crosswalk (gsis_id)
  where gsis_id is not null;

create index if not exists dk_salaries_player_site_idx
  on raw.dk_salaries (player_id, site, slate_id)
  where player_id is not null;

create index if not exists players_espn_idx
  on raw.players (espn_id)
  where espn_id is not null;

create index if not exists market_props_week_player_stat_idx
  on model.market_props (season, week, player_id, stat, captured_at desc, id desc);

create index if not exists schedules_season_week_idx
  on raw.schedules (season, week, game_type);
