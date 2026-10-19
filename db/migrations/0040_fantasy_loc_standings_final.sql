-- Wins, losses, points, and all-play count only weeks whose scores are final.
-- An open week (Thursday points already in, Sunday still to play) was being
-- scored as a result, so a 3-2 team sitting ahead on partial points showed 4-2.
-- all_final stays false while any stored week for that team is still open.
-- Not an input to sim/ or priors/.

create or replace view fantasy.loc_standings as
with s as (
  select w.season, w.week, w.team, w.actual_pts, w.proj_pts, w.is_final,
         o.actual_pts as opp_pts,
         (select count(*) from fantasy.loc_weekly_scores x
           where x.season = w.season and x.week = w.week and x.team <> w.team
             and x.actual_pts < w.actual_pts) as allplay_w,
         (select count(*) from fantasy.loc_weekly_scores x
           where x.season = w.season and x.week = w.week and x.team <> w.team
             and x.actual_pts > w.actual_pts) as allplay_l
  from fantasy.loc_weekly_scores w
  join fantasy.loc_weekly_scores o
    on o.season = w.season and o.week = w.week and o.team = w.opp_team
),
open as (
  select season, team, bool_and(is_final) as all_final
  from s
  group by season, team
)
select s.season, s.team,
       count(*) filter (where s.actual_pts > s.opp_pts) as wins,
       count(*) filter (where s.actual_pts < s.opp_pts) as losses,
       count(*) filter (where s.actual_pts = s.opp_pts) as ties,
       sum(s.actual_pts) as pf,
       sum(s.opp_pts) as pa,
       sum(s.proj_pts) as proj_pf,
       sum(s.actual_pts) - sum(s.proj_pts) as plus_minus,
       sum(s.allplay_w) as allplay_wins,
       sum(s.allplay_l) as allplay_losses,
       max(sum(s.actual_pts)) over (partition by s.season) - sum(s.actual_pts) as pts_back_of_pf_leader,
       o.all_final
from s
join open o on o.season = s.season and o.team = s.team
where s.is_final
group by s.season, s.team, o.all_final;
