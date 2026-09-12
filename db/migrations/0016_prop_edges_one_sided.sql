-- Single-sided market_props: store a conservative floor, not a de-vigged edge.
-- edge stays null so nothing downstream can treat a floor as a two-way number.

alter table model.prop_edges
  add column if not exists one_sided boolean not null default false,
  add column if not exists edge_floor numeric;

comment on column model.prop_edges.one_sided is
  'True when only one of over_odds/under_odds was present. Do not de-vig.';
comment on column model.prop_edges.edge_floor is
  'model_prob minus raw implied probability. One-sided only. Not an edge.';
