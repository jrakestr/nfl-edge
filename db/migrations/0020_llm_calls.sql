-- Audit log for every Gemini call. Input and output are jsonb; nothing is invisible.

create table if not exists model.llm_calls (
  id bigserial primary key,
  phase text not null,
  run_id uuid references model.sim_runs(run_id) on delete set null,
  ref_id text,
  model text not null,
  input jsonb not null,
  output jsonb,
  created_at timestamptz not null default now()
);
create index if not exists llm_calls_explain_cache
  on model.llm_calls (run_id, ref_id, created_at desc) where phase = 'explain';
create index if not exists llm_calls_phase_created on model.llm_calls (phase, created_at desc);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select, insert on model.llm_calls to web_reader;
    grant usage, select on sequence model.llm_calls_id_seq to web_reader;
  end if;
end
$$;
