-- 0053: raw.defender_weeks, typed defensive events per player-week from raw.player_stats_weekly.
-- The stats jsonb stays the landing format. Positions collapse to the roster groups DL / LB / DB
-- so history joins raw.rosters_weekly.position directly. A missing key reads as 0.

create or replace view raw.defender_weeks with (security_invoker = true) as
select s.season,
       s.week,
       s.player_id,
       s.team,
       s.opponent_team,
       s.stats->>'season_type' as season_type,
       case when s.position in ('DE', 'DT', 'NT', 'DL') then 'DL'
            when s.position in ('LB', 'OLB', 'ILB', 'MLB') then 'LB'
            else 'DB' end as def_group,
       coalesce((s.stats->>'def_sacks')::numeric, 0) as sacks,
       coalesce((s.stats->>'def_interceptions')::numeric, 0) as ints,
       coalesce((s.stats->>'fumble_recovery_opp')::numeric, 0) as fum_rec
from raw.player_stats_weekly s
where s.position in ('DE', 'DT', 'NT', 'DL', 'LB', 'OLB', 'ILB', 'MLB',
                     'CB', 'S', 'SAF', 'FS', 'SS', 'DB');
