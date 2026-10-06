-- Latest-row consumers stay on nflverse. Reconstructing a verdict after kickoff uses a
-- pre-kickoff snapshot and sets backfilled so live vs reconstructed rows stay distinct.

alter table model.verdicts
  add column if not exists backfilled boolean not null default false;

create or replace view model.edges_latest as
select e.*
from model.edges e
join raw.market_lines m on m.id = e.market_line_id
where m.source = 'nflverse'
  and m.captured_at = (
    select max(captured_at) from raw.market_lines
    where game_id = m.game_id and source = 'nflverse'
  );

create or replace view model.verdicts_latest as
select v.*
from model.verdicts v
join raw.market_lines m on m.id = v.market_line_id
where m.source = 'nflverse'
  and m.captured_at = (
    select max(captured_at) from raw.market_lines
    where game_id = m.game_id and source = 'nflverse'
  );
