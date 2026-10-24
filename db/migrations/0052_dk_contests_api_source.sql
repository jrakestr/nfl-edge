-- 0052: raw.dk_contests can come from the DraftKings gamecenter API as well as the standings CSV.
-- DK purges the CSV export after ~30 days; the API keeps per-player ownership and points but only
-- exposes the top ~500 entries, so the 99th-percentile line cannot be computed. Those rows carry
-- source = 'api' and null top1_rank / top1_score / dk_contest_players.top1_rate.

alter table raw.dk_contests
  alter column top1_rank drop not null,
  alter column top1_score drop not null,
  add column if not exists source text not null default 'standings'
    check (source in ('standings', 'api'));

comment on column raw.dk_contests.source is
  'standings = full contest-standings CSV; api = gamecenter leaderboard + top-500 rosters (ownership and FPTS are DK''s own totals; top1 columns null).';
