-- ESPN season points and season projection for available players, the same two
-- numbers fantasy.loc_rosters already stores. Null when the pull has neither.
-- Not an input to sim/ or priors/.

alter table fantasy.loc_available
  add column if not exists season_pts numeric(7,2),
  add column if not exists season_proj numeric(7,2);
