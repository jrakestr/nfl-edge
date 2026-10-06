-- League of Champions week-to-week views and the persisted luck table. Descriptive league statistics;
-- nothing in sim/ or priors/ reads them. The web app only selects.
--
--  loc_luck                  written by nfl-edge ingest espn-league (Python: needs a normal CDF).
--                            bias, sd, n_team_weeks repeat on every row so the page can disclose them.
--  loc_team_week             one row per team-week: opponent, +/- vs projection, margins, swing,
--                            weekly rank / league average / SD, all-play, running PF and PA.
--  loc_starter_status_asof   each stored player-week joined to the newest status snapshot taken
--                            before that player's kickoff; null (no snapshot) when none exists.

create table if not exists fantasy.loc_luck (
  season int not null,
  week int not null,
  espn_team_id int not null,
  proj_win_prob double precision not null,
  earned_win_prob double precision not null,
  actual_win double precision not null,     -- 1, 0.5 on a tie, 0
  allplay_share double precision not null,  -- teams with a lower score / (teams - 1)
  bias double precision not null,           -- mean(proj - actual) over final team-weeks
  sd double precision not null,             -- sample SD of (actual - proj)
  n_team_weeks int not null,
  computed_at timestamptz not null,
  primary key (season, week, espn_team_id)
);

create or replace view fantasy.loc_team_week as
with w as (
  select s.season, s.week, s.espn_team_id, s.team, s.opp_espn_team_id, s.opp_team,
         s.proj_pts, s.actual_pts, s.is_final,
         o.proj_pts as opp_proj_pts, o.actual_pts as opp_actual_pts
  from fantasy.loc_weekly_scores s
  join fantasy.loc_weekly_scores o
    on o.season = s.season and o.week = s.week and o.espn_team_id = s.opp_espn_team_id
), x as (
  select w.*,
         w.actual_pts - w.proj_pts as own_pm,
         w.opp_actual_pts - w.opp_proj_pts as opp_pm,
         w.proj_pts - w.opp_proj_pts as proj_margin,
         w.actual_pts - w.opp_actual_pts as actual_margin,
         case when w.actual_pts > w.opp_actual_pts then 1.0
              when w.actual_pts = w.opp_actual_pts then 0.5 else 0.0 end as win,
         rank() over (wk order by w.actual_pts desc) as week_rank,
         avg(w.actual_pts) over wk as league_avg,
         stddev_samp(w.actual_pts) over wk as league_sd,
         rank() over (wk order by w.actual_pts asc) - 1 as allplay_wins,
         rank() over (wk order by w.actual_pts desc) - 1 as allplay_losses,
         sum(w.actual_pts) over (t order by w.week) as cum_pf,
         sum(w.opp_actual_pts) over (t order by w.week) as cum_pa
  from w
  window wk as (partition by w.season, w.week), t as (partition by w.season, w.espn_team_id)
)
select x.season, x.week, x.espn_team_id, x.team, x.opp_espn_team_id, x.opp_team, x.is_final,
       x.proj_pts, x.actual_pts, x.opp_proj_pts, x.opp_actual_pts,
       x.own_pm, x.opp_pm, x.proj_margin, x.actual_margin,
       x.actual_margin - x.proj_margin as swing,
       x.win, x.week_rank, x.league_avg, x.league_sd,
       case when x.league_sd > 0 then (x.actual_pts - x.league_avg) / x.league_sd end as sd_from_avg,
       x.allplay_wins, x.allplay_losses,
       x.cum_pf, rank() over (partition by x.season, x.week order by x.cum_pf desc) as cum_pf_rank,
       max(x.cum_pf) over (partition by x.season, x.week) - x.cum_pf as pts_back_of_pf_leader,
       x.cum_pa
from x;

-- ESPN codes LAR and WSH are LA and WAS in raw.schedules. kickoff is gameday + gametime read as
-- America/New_York (nflverse), null when the schedule has no time. A status counts only if its
-- snapshot was pulled strictly before kickoff; weeks captured before this table existed have none.
create or replace view fantasy.loc_starter_status_asof as
with p as (
  select s.season, s.week, s.espn_team_id, s.player, s.position, s.slot, s.proj_pts, s.actual_pts,
         s.nfl_team,
         case s.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else s.nfl_team end as sched_team
  from fantasy.loc_player_week_scores s
), k as (
  select p.*,
         (select ((g.gameday + g.gametime::time) at time zone 'America/New_York')
            from raw.schedules g
           where g.season = p.season and g.week = p.week and g.game_type = 'REG'
             and p.sched_team in (g.home_team, g.away_team)
           limit 1) as kickoff
  from p
)
select k.season, k.week, k.espn_team_id, k.player, k.position, k.nfl_team, k.slot,
       k.proj_pts, k.actual_pts, k.kickoff,
       n.status as snapshot_status, n.pulled_at as snapshot_pulled_at
from k
left join lateral (
  select ss.status, ss.pulled_at
    from fantasy.loc_status_snapshots ss
   where ss.season = k.season and ss.week = k.week and ss.player = k.player
     and k.kickoff is not null and ss.pulled_at < k.kickoff
   order by ss.pulled_at desc
   limit 1
) n on true;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on fantasy.loc_luck, fantasy.loc_team_week, fantasy.loc_starter_status_asof
      to web_reader;
  end if;
end
$$;
