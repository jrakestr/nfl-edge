-- Research Lab: cache of Jev (TypeSafe System One) rubric scores. DISPLAY ONLY (docs/agents/
-- data-sources.md gate): nothing here feeds the sim, priors or any model table.
--
-- One row per (season, week, metric_hash, model, player_id). `metric_hash` fingerprints the
-- metric's fields + weights + rubric text (not its name), so editing a metric misses the cache
-- and an identical metric re-uses it. `answers` = {field: {score, confidence}} per atomic Score
-- question; `score` is the weighted combination computed in code. A run writes all its players
-- in one transaction, so a run is complete or absent.

create table if not exists model.research_jev_scores (
  season int not null,
  week int not null,
  metric_hash text not null,
  model text not null,
  player_id text not null,
  score double precision not null,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  primary key (season, week, metric_hash, model, player_id)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select, insert on model.research_jev_scores to web_reader;
  end if;
end
$$;
