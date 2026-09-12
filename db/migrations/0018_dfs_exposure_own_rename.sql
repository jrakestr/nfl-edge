-- Three named ownership columns. sim_own was never our 150-lineup rate;
-- after this persist it is own_ours. own_field_sim is the GPP realized field.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'model' and table_name = 'dfs_exposure' and column_name = 'sim_own'
  ) then
    alter table model.dfs_exposure rename column sim_own to own_ours;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'model' and table_name = 'dfs_exposure' and column_name = 'proj_own'
  ) then
    alter table model.dfs_exposure rename column proj_own to own_field_proj;
  end if;
end $$;

alter table model.dfs_exposure add column if not exists own_field_sim numeric;
