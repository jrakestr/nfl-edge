-- Site flag from nflverse load_schedules: Home or Neutral. Needed so the sim
-- does not apply full home-field advantage on international / Super Bowl games.

alter table raw.schedules add column if not exists location text;
