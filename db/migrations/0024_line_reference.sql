-- Reference book lives in model.line_reference (seed must match config/line_reference.yaml).
-- Views join that row; they do not name draftkings. Games kicking off before
-- effective_from stay on nflverse.

create table model.line_reference (
  source text not null,
  bookmaker text not null,
  fallback_source text not null,
  effective_from timestamptz not null,
  primary key (source, bookmaker)
);

insert into model.line_reference (source, bookmaker, fallback_source, effective_from)
values ('odds_api', 'draftkings', 'nflverse', '2026-09-20T00:00:00Z');

create or replace view model.market_lines_latest as
with ref as (
  select source, bookmaker, fallback_source, effective_from
  from model.line_reference
),
kick as (
  select s.game_id,
    case
      when s.location = 'Neutral' then (s.gameday::timestamp at time zone 'America/New_York')
      when s.gametime is null or s.gametime = '' then ((s.gameday + time '23:59') at time zone 'America/New_York')
      else ((s.gameday::timestamp + s.gametime::time) at time zone 'America/New_York')
    end as kickoff
  from raw.schedules s
),
cand as (
  select m.id, m.game_id, m.captured_at, m.source, m.bookmaker, m.fetched_at,
         m.spread_line, m.total_line,
         m.home_moneyline, m.away_moneyline,
         m.home_spread_odds, m.away_spread_odds, m.over_odds, m.under_odds,
         case
           when m.source = r.source and m.bookmaker = r.bookmaker
                and m.spread_line is not null and m.total_line is not null
           then 0
           else 1
         end as pref
  from raw.market_lines m
  join kick k on k.game_id = m.game_id
  cross join ref r
  where (
    k.kickoff < r.effective_from
    and m.source = r.fallback_source
  ) or (
    k.kickoff >= r.effective_from
    and (
      (m.source = r.source and m.bookmaker = r.bookmaker
       and m.spread_line is not null and m.total_line is not null)
      or m.source = r.fallback_source
    )
  )
)
select distinct on (game_id)
  id, game_id, captured_at, source, bookmaker, fetched_at,
  spread_line, total_line, home_moneyline, away_moneyline,
  home_spread_odds, away_spread_odds, over_odds, under_odds
from cand
order by game_id, pref, captured_at desc, id desc;

create or replace view model.edges_latest as
select e.*
from model.edges e
join model.market_lines_latest m on m.id = e.market_line_id;

create or replace view model.verdicts_latest as
select v.*
from model.verdicts v
join model.market_lines_latest m on m.id = v.market_line_id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.line_reference to web_reader;
    grant select on model.market_lines_latest to web_reader;
    grant select on model.edges_latest to web_reader;
    grant select on model.verdicts_latest to web_reader;
  end if;
end
$$;
