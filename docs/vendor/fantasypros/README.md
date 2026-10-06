# FantasyPros public API v2 (reference)

Documentation only. No ingest code exists for this API.

| File | What |
|---|---|
| `fantasypros_v2_public.yml` | OpenAPI 3.1 spec, verbatim from the vendor (canonical) |
| `api-docs.md` | Rendered reference scraped with Firecrawl on 2026-10-05 from https://api.fantasypros.com/public/v2/docs |

## Access

- Base URL: `https://api.fantasypros.com/public/v2/json`
- Auth: header `x-api-key: <key>`
- Free limited tier. Key request: https://secure.fantasypros.com/api-keys/request/
- Terms: https://api.fantasypros.com/public/v2/terms-of-use
- `{sport}` enum: `nfl`, `mlb`, `nba`, `nhl`, `pga`, `ncaaf`
- Colon-delimited list params (`players=7354:6880`, `team_id=SF:MIN`)

## Endpoints

| Path | Purpose | NFL use |
|---|---|---|
| `/{sport}/players` | Player roster, metadata, optional external IDs (`external_ids=draftkings:...`) | yes |
| `/{sport}/news` | Player news updates (`limit` <= 100) | yes |
| `/{sport}/injuries` | Player injury details | yes |
| `/{sport}/compare-players` | Compare 2-4 players on rankings | no |
| `/{sport}/{season}/rankings` | Expert rankings by type and position | yes |
| `/{sport}/{season}/consensus-rankings` | Consensus rankings (ECR) by type and position | yes |
| `/{sport}/{season}/rankings/experts` | Expert profiles | no |
| `/nfl/{season}/projections` | NFL player projections | yes |
| `/mlb/{season}/projections` | MLB projections | no |
| `/nba/{season}/projections` | NBA projections | no |
| `/nfl/{season}/player-points` | NFL fantasy points scored | yes |
| `/mlb/lineups` | MLB batting orders | no |

## In this repo

- Env var: `FANTASY_PROS_API_KEY` (`.env`, CLI only).
- Client: `src/nfl_edge/ingest/fantasypros.py`. Commands and behavior: `docs/ops.md` (FantasyPros API).
- Observed 2026-10-05: projections `stats` keys `points` (STD), `points_ppr`, `points_half`, `pass_*`, `rush_*`, `rec_rec`, `rec_yds`, `rec_tds`; no DK scoring, no targets. Team codes `JAC`/`LAR` (mapped by `names.TEAM_ALIASES`). Injury `status_short` values seen: `IR`, `PUP`, `O`, `Q`, `S`. The `scoring` query param did not change the response (`STD`). No rate-limit headers were returned.

## Repo constraints

- FantasyPros output is a display benchmark until promoted; promotion gate is in AGENTS.md. Availability enters only via source-scoped `raw.player_overrides`.
- Free tier is limited: single explicit pulls, no polling.
- Key lives in `.env` only. Never print it or the request headers.
- Any ingest module needs its own plan; print actual response fields before writing code.
