-- League of Champions (ESPN league 79530409, 12-team full PPR) weekly scores.
-- Not nfl-edge data: nothing in sim/, priors, or the web app reads this schema.
-- One row per team per week; each game appears twice (once from each side).
-- Team names match ESPN exactly, trailing spaces removed.
-- proj_pts = sum of starters' ESPN projections from screenshots.
-- is_final = false means the score was recorded before that team's last game ended.

create schema if not exists fantasy;

create table if not exists fantasy.loc_weekly_scores (
  season int not null,
  week int not null,
  team text not null,
  opp_team text not null,
  proj_pts numeric(6,2) not null,
  actual_pts numeric(6,2) not null,
  is_final boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (season, week, team)
);

insert into fantasy.loc_weekly_scores
  (season, week, team, opp_team, proj_pts, actual_pts, is_final) values
  (2026, 1, 'int3rc3pt', 'FuPayme', 127.59, 109.7, true),
  (2026, 1, 'FuPayme', 'int3rc3pt', 134.53, 143.1, true),
  (2026, 1, 'Big Nobody', 'B B Q SKINS 🏆🏆', 143.46, 117.6, true),
  (2026, 1, 'B B Q SKINS 🏆🏆', 'Big Nobody', 149.12, 154.0, true),
  (2026, 1, 'Team Wheeler', 'Terrell big dog', 142.02, 129.1, true),
  (2026, 1, 'Terrell big dog', 'Team Wheeler', 132.31, 129.5, true),
  (2026, 1, 'Put Da 🔨 down', 'Mr. BigPlayEnergy', 138.12, 165.7, true),
  (2026, 1, 'Mr. BigPlayEnergy', 'Put Da 🔨 down', 151.97, 132.8, true),
  (2026, 1, 'The Yungeen🥷🏾🖤', 'Jb 4sho', 142.26, 117.0, true),
  (2026, 1, 'Jb 4sho', 'The Yungeen🥷🏾🖤', 135.10, 167.8, true),
  (2026, 1, 'Team Murdz Da Winner', 'BBW Lover', 138.06, 177.8, true),
  (2026, 1, 'BBW Lover', 'Team Murdz Da Winner', 145.21, 175.9, true),
  (2026, 2, 'Terrell big dog', 'int3rc3pt', 134.18, 131.5, true),
  (2026, 2, 'int3rc3pt', 'Terrell big dog', 133.72, 97.5, true),
  (2026, 2, 'Team Wheeler', 'Big Nobody', 151.84, 129.3, true),
  (2026, 2, 'Big Nobody', 'Team Wheeler', 149.95, 123.4, true),
  (2026, 2, 'B B Q SKINS 🏆🏆', 'Put Da 🔨 down', 153.42, 121.2, true),
  (2026, 2, 'Put Da 🔨 down', 'B B Q SKINS 🏆🏆', 142.44, 153.7, true),
  (2026, 2, 'Mr. BigPlayEnergy', 'The Yungeen🥷🏾🖤', 144.39, 165.4, true),
  (2026, 2, 'The Yungeen🥷🏾🖤', 'Mr. BigPlayEnergy', 144.03, 90.2, true),
  (2026, 2, 'FuPayme', 'Team Murdz Da Winner', 144.90, 113.4, true),
  (2026, 2, 'Team Murdz Da Winner', 'FuPayme', 143.68, 184.7, true),
  (2026, 2, 'Jb 4sho', 'BBW Lover', 136.67, 159.3, true),
  (2026, 2, 'BBW Lover', 'Jb 4sho', 124.92, 123.0, true),
  (2026, 3, 'int3rc3pt', 'Team Wheeler', 136.23, 165.0, true),
  (2026, 3, 'Team Wheeler', 'int3rc3pt', 151.06, 117.2, true),
  (2026, 3, 'Big Nobody', 'Put Da 🔨 down', 144.42, 132.4, true),
  (2026, 3, 'Put Da 🔨 down', 'Big Nobody', 148.62, 183.5, true),
  (2026, 3, 'The Yungeen🥷🏾🖤', 'B B Q SKINS 🏆🏆', 147.06, 81.6, true),
  (2026, 3, 'B B Q SKINS 🏆🏆', 'The Yungeen🥷🏾🖤', 149.39, 153.3, true),
  (2026, 3, 'Team Murdz Da Winner', 'Terrell big dog', 144.73, 139.2, true),
  (2026, 3, 'Terrell big dog', 'Team Murdz Da Winner', 135.72, 111.9, true),
  (2026, 3, 'BBW Lover', 'Mr. BigPlayEnergy', 134.15, 134.6, true),
  (2026, 3, 'Mr. BigPlayEnergy', 'BBW Lover', 150.78, 107.0, true),
  (2026, 3, 'Jb 4sho', 'FuPayme', 141.29, 91.7, true),
  (2026, 3, 'FuPayme', 'Jb 4sho', 136.68, 153.9, true),
  (2026, 4, 'int3rc3pt', 'Big Nobody', 141.28, 164.6, false),
  (2026, 4, 'Big Nobody', 'int3rc3pt', 128.66, 93.6, true),
  (2026, 4, 'Put Da 🔨 down', 'The Yungeen🥷🏾🖤', 153.45, 110.1, false),
  (2026, 4, 'The Yungeen🥷🏾🖤', 'Put Da 🔨 down', 136.28, 117.6, false),
  (2026, 4, 'Team Wheeler', 'Team Murdz Da Winner', 154.87, 157.5, true),
  (2026, 4, 'Team Murdz Da Winner', 'Team Wheeler', 156.50, 123.7, true),
  (2026, 4, 'B B Q SKINS 🏆🏆', 'BBW Lover', 154.13, 137.9, false),
  (2026, 4, 'BBW Lover', 'B B Q SKINS 🏆🏆', 143.12, 199.5, true),
  (2026, 4, 'Terrell big dog', 'Jb 4sho', 124.38, 107.9, false),
  (2026, 4, 'Jb 4sho', 'Terrell big dog', 143.68, 149.8, true),
  (2026, 4, 'Mr. BigPlayEnergy', 'FuPayme', 150.78, 114.1, true),
  (2026, 4, 'FuPayme', 'Mr. BigPlayEnergy', 133.49, 167.0, true);
