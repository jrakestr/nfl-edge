-- Research Lab: user-defined player metrics and the as-of player fields they score.
--
-- model.research_fields: one row per player for target (season, week), built by
--   `nfl-edge research build` from rows with season < S or (season = S and week < W) only.
--   `fields` is a flat jsonb of numeric (or null) values; the web scoring engine reads it as-is.
--   A (season, week) is replaced in one transaction, so a week is either complete or absent.
-- model.research_metrics: the user's metrics. `terms` = [{field, weight}]. `normalize` = 'none'
--   (weighted sum of raw values) or 'zscore' (weighted sum of position z-scores).
--   Display-only: nothing here feeds the sim or priors.

create table if not exists model.research_fields (
  season int not null,
  week int not null,
  player_id text not null,
  full_name text not null,
  team text not null,
  position text not null,
  fields jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, week, player_id)
);

create table if not exists model.research_metrics (
  id bigserial primary key,
  name text not null,
  terms jsonb not null,
  normalize text not null default 'none' check (normalize in ('none', 'zscore')),
  created_at timestamptz not null default now(),
  constraint research_metrics_terms_nonempty check (jsonb_typeof(terms) = 'array' and jsonb_array_length(terms) > 0)
);
create unique index if not exists research_metrics_name_key on model.research_metrics (lower(name));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.research_fields to web_reader;
    grant select, insert, delete on model.research_metrics to web_reader;
    grant usage, select on sequence model.research_metrics_id_seq to web_reader;
  end if;
end
$$;
