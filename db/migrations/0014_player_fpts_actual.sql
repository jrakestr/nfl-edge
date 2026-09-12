-- Realized DK/FD/PPR from raw.player_stats_weekly via score_offense.
-- Derived from raw, not a sim run. REG rows only in this pass; season_type is
-- on the key so a later postseason write does not collide.
-- had_opportunity: attempts + carries + targets >= 1. Games played is that
-- count, not the row count.

create table if not exists model.player_fpts_actual (
  season int not null,
  week int not null,
  player_id text not null,
  season_type text not null,
  team text,
  position text,
  opponent text,
  fpts_dk double precision not null,
  fpts_fd double precision not null,
  fpts_ppr double precision not null,
  had_opportunity boolean not null,
  primary key (season, week, player_id, season_type)
);
