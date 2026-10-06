-- Per-book Odds API snapshots sit alongside nflverse rows.
-- fetched_at has no default: a now() default would stamp nflverse cron inserts
-- and break that source's unchanged-line dedupe.
alter table raw.market_lines add column if not exists bookmaker text;
alter table raw.market_lines add column if not exists fetched_at timestamptz;

-- fetched_at in the key means every odds_api pull is unique by construction.
-- nflverse rows keep bookmaker/fetched_at null and still collide on line values.
drop index if exists raw.market_lines_dedupe_idx;
create unique index market_lines_dedupe_idx on raw.market_lines (
  game_id,
  coalesce(bookmaker, ''),
  coalesce(fetched_at, '-infinity'::timestamptz),
  coalesce(spread_line, -999),
  coalesce(total_line, -999),
  coalesce(away_moneyline, -99999),
  coalesce(home_moneyline, -99999),
  coalesce(away_spread_odds, -99999),
  coalesce(home_spread_odds, -99999),
  coalesce(over_odds, -99999),
  coalesce(under_odds, -99999)
);
