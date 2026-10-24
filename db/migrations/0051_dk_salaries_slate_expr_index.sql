-- 0051: Expression index on raw.dk_salaries (season, week) parsed from slate_id.
-- Supports predicates:
--   split_part(slate_id, '_', 1)::int = season
--   and split_part(slate_id, '_', 2)::int = week

create index if not exists dk_salaries_slate_year_month_idx
  on raw.dk_salaries (
    (split_part(slate_id, '_', 1)::int),
    (split_part(slate_id, '_', 2)::int)
  );
