-- The web app now reads the fantasy schema (League of Champions: /league). Same shape as 0006:
-- select-only, default privileges for tables and views added later, no create. The app never
-- writes to fantasy.*; the ESPN ingest (nfl-edge ingest espn-league) is the only writer.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant usage on schema fantasy to web_reader;
    grant select on all tables in schema fantasy to web_reader;   -- includes views
    alter default privileges in schema fantasy grant select on tables to web_reader;
    revoke create on schema fantasy from web_reader;
  end if;
end
$$;
