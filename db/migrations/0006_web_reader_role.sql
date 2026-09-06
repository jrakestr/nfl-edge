-- Step 4b: a read-only login for the web app so DATABASE_URL on Vercel is never the postgres
-- superuser. The role is created WITHOUT a password on purpose: set it by hand in the SQL editor
-- (`alter role web_reader password '...'`) and put only the pooler URI in Vercel / web/.env.local.
-- The password is never committed. Grants cover model.* and raw.* (the app reads
-- verdicts_latest, edges_latest, proj_games, sim_checks, sim_runs, schedules, players) and
-- default privileges keep future tables/views readable without another migration.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'web_reader') then
    create role web_reader login nosuperuser nocreatedb;
  end if;
end
$$;

grant usage on schema model, raw to web_reader;
grant select on all tables in schema model, raw to web_reader;   -- includes views
alter default privileges in schema model grant select on tables to web_reader;
alter default privileges in schema raw grant select on tables to web_reader;

-- Belt and braces: the app never writes, so make sure the role cannot even if a query slips.
revoke create on schema model, raw from web_reader;
alter role web_reader set statement_timeout = '15s';
