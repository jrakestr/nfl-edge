-- Staged injury/usage claims. Never written to raw.player_overrides except by a human promote.

create table if not exists model.usage_claims (
  id bigserial primary key,
  season int not null,
  week int not null,
  player_id text not null,
  player_name text not null,
  team text not null,
  status text not null,
  channel text not null,
  usage_multiplier numeric not null,
  source_url text,
  quote text,
  confidence text not null,
  raw_text text not null,
  llm_call_id bigint references model.llm_calls(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists usage_claims_week on model.usage_claims (season, week, created_at desc);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select, insert on model.usage_claims to web_reader;
    grant usage, select on sequence model.usage_claims_id_seq to web_reader;
    grant insert, update on raw.player_overrides to web_reader;
  end if;
end
$$;
