-- Live game clock and box scores (latest snapshot only) and the one actuals
-- table both the Lineups page and the Review page read. Derived: rebuildable
-- from nflverse and ESPN. The live job never writes model.dfs_lineups.actual_fpts.
-- web_reader select is covered by the default privileges from 0006.

create table if not exists raw.live_games (
  season          int not null,
  week            int not null,
  espn_event_id   text not null,
  game_id         text,
  home            text not null,
  away            text not null,
  state           text not null check (state in ('pending', 'live', 'final')),
  period          int not null,
  clock_sec       int not null,
  secs_remaining  int not null,
  home_score      int,
  away_score      int,
  stale           boolean not null default false,
  fetched_at      timestamptz not null default now(),
  primary key (season, week, espn_event_id)
);

comment on table raw.live_games is
  'Latest ESPN scoreboard row per game. fetched_at is not part of the key; history is not kept.';

create table if not exists raw.live_player_stats (
  season        int not null,
  week          int not null,
  espn_event_id text not null,
  player_id     text not null,
  stats         jsonb not null,
  primary key (season, week, espn_event_id, player_id)
);

comment on column raw.live_player_stats.stats is
  'nflverse player_stats_weekly keys so score_weekly can score the row.';

create table if not exists raw.live_team_stats (
  season        int not null,
  week          int not null,
  espn_event_id text not null,
  team          text not null,
  stats         jsonb not null,
  primary key (season, week, espn_event_id, team)
);

comment on column raw.live_team_stats.stats is
  'Keys dst_line reads: def_sacks, def_interceptions, fumble_recovery_opp, def_tds, special_teams_tds, def_safeties, def_fg_blocks, def_pat_blocks, def_punt_blocks.';

create table if not exists model.slate_actuals (
  season          int not null,
  week            int not null,
  player_id       text not null,
  dk_pts          numeric,
  state           text not null check (state in ('final', 'live', 'pending', 'dnp')),
  game_id         text,
  secs_remaining  int,
  updated_at      timestamptz not null default now(),
  primary key (season, week, player_id)
);

create index if not exists slate_actuals_week_idx on model.slate_actuals (season, week);

comment on table model.slate_actuals is
  'One DK actual per player-week, shared by the Lineups and Review pages. Not per slate. Pending rows have null dk_pts. DNP is 0.';

create table if not exists model.actuals_recon (
  game_id         text primary key,
  season          int not null,
  week            int not null,
  espn_final_pts  numeric,
  nflverse_pts    numeric,
  diff            numeric,
  flagged         boolean not null default false,
  updated_at      timestamptz not null default now()
);

comment on column model.actuals_recon.flagged is
  'True when abs(espn_final_pts - nflverse_pts) > 0.1 for that game.';

grant select on raw.live_games, raw.live_player_stats, raw.live_team_stats to web_reader;
grant select on model.slate_actuals, model.actuals_recon to web_reader;
