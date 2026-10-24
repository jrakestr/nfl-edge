-- FantasyPros player news + Jev semantic lineup audit judgments.
-- DISPLAY ONLY (docs/agents/data-sources.md gate): nothing in sim/, priors/,
-- overrides, or the optimizer reads these tables.

create table if not exists raw.fantasypros_news (
  news_id bigint primary key,
  fp_player_id text,
  player_id text,
  team text,
  created_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  title text not null,
  description text not null,
  impact text not null,
  categories text[] not null default '{}',
  author text,
  link text
);

create index if not exists fantasypros_news_player_created_idx
  on raw.fantasypros_news (player_id, created_at desc);

create index if not exists fantasypros_news_fp_player_created_idx
  on raw.fantasypros_news (fp_player_id, created_at desc);

create table if not exists model.jev_judgments (
  id bigserial primary key,
  season int not null,
  week int not null,
  slate text not null,
  player_id text not null,
  question_id text not null,
  question_hash text not null,
  state_hash text not null,
  model_requested text not null,
  model_resolved text not null,
  kind text not null check (kind in ('score', 'noul', 'choice', 'no_read')),
  value double precision,
  confidence double precision,
  probabilities jsonb,
  news_asof timestamptz,
  input_tokens int not null default 0,
  created_at timestamptz not null default now(),
  unique (state_hash, question_hash, model_resolved, player_id)
);

create index if not exists jev_judgments_week_slate_player_idx
  on model.jev_judgments (season, week, slate, player_id, created_at desc);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'model' and table_name = 'research_jev_answers'
  ) then
    if (select count(*) from model.research_jev_answers) = 0 then
      drop table model.research_jev_answers;
    end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on raw.fantasypros_news to web_reader;
    grant select on model.jev_judgments to web_reader;
  end if;
end
$$;
