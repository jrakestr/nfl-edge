-- Research Lab v2: DFS questions answered by Jev (TypeSafe System One). DISPLAY ONLY (docs/agents/
-- data-sources.md gate): nothing here feeds the sim, priors or any model table.
--
-- 1. research_fields gains the player's opponent and game for the target week (from the schedule).
-- 2. research_jev_answers caches ONE answer per (season, week, question_hash, model, player_id).
--    question_hash fingerprints the question kind, text, rubric levels and the exact field list
--    sent as state. It excludes weights: re-weighting a profile re-scores from the cache for free.
--    `value` is the Score position 0..4 or the Noul probability 0..1.
-- 3. The profile-level cache from 0045 (research_jev_scores) is replaced; it held no rows.

alter table model.research_fields add column if not exists opponent text;
alter table model.research_fields add column if not exists game_id text;

create table if not exists model.research_jev_answers (
  season int not null,
  week int not null,
  question_hash text not null,
  model text not null,
  player_id text not null,
  kind text not null check (kind in ('score', 'noul')),
  value double precision not null,
  confidence double precision,
  created_at timestamptz not null default now(),
  primary key (season, week, question_hash, model, player_id)
);

do $$
begin
  if (select count(*) from model.research_jev_scores) = 0 then
    drop table model.research_jev_scores;
  end if;
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select, insert on model.research_jev_answers to web_reader;
  end if;
end
$$;
