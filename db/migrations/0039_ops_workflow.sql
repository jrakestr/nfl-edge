-- Operations log for the /workflow page. The Python CLI (nfl-edge phase, nfl-edge change-check)
-- is the only writer; the web app reads. Nothing in sim/ or priors/ reads this schema.

create schema if not exists ops;

-- One row per phase run: inserted as running when the phase starts, updated once when it ends.
create table if not exists ops.workflow_runs (
  id bigserial primary key,
  phase text not null,                     -- ingest | salaries | sim | lines | props | dfs | grade | refresh
  season int not null,
  week int not null,
  slate text,                              -- dfs only: the salary file's slate key
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  settings jsonb not null default '{}',    -- draws, field_size, iterations, full_field, ...
  run_id uuid,                             -- sim run the phase wrote or read, when there is one
  gh_run_id bigint,                        -- GitHub Actions run, null for a local run
  gh_run_url text,
  host text,                               -- github | local hostname
  message text                             -- last line of output on success, the error on failure
);
create index if not exists workflow_runs_week_idx
  on ops.workflow_runs (season, week, phase, started_at desc);

-- One row per change check: what moved since the newest complete sim of the week.
create table if not exists ops.change_checks (
  id bigserial primary key,
  season int not null,
  week int not null,
  checked_at timestamptz not null default now(),
  sim_run_id uuid,                         -- null when the week has no complete sim
  sim_created_at timestamptz,
  suggest_resim boolean not null default false,
  reasons jsonb not null default '[]',     -- [{player, team, source, before, after, at}]
  info jsonb not null default '[]'         -- line moves etc.: shown, never a re-sim reason
);
create index if not exists change_checks_week_idx
  on ops.change_checks (season, week, checked_at desc);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant usage on schema ops to web_reader;
    grant select on all tables in schema ops to web_reader;
    alter default privileges in schema ops grant select on tables to web_reader;
    revoke create on schema ops from web_reader;
  end if;
end
$$;
