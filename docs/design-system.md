# nfl-edge design system

Stack: Next.js + shadcn/ui on Vercel, reading `model.*` from Supabase. v1 surfaces: **Edge board**, **Prop detail**, **Lineup review**. Mockups live in the nfl-edge canvas artifact; this doc is the spec they follow.

Reference products for feel: Outlier.bet for the prop/game detail layout (header, market tabs, stat-vs-line chart, right rail with timeline and matchup), Linear for list-plus-drawer discipline.

## Principles

1. **Plain English first, numbers second.** Every screen leads with a sentence a normal person can read ("Detroit is favored to beat New Orleans by 10.4 points. The book has them by 7."). Numbers support the sentence as chips and columns; a Plain English / Table toggle exposes the dense view. Column headers say what the number means ("Cleared it, last 10", "Chance of over"), never the abbreviation.
2. **Signal only.** Color means one thing: **edge and its direction**, plus **position identity**. Position is a small filled pill next to the name (one token per real position: QB, RB, WR, TE, DST). FLEX slots show the player's actual position, never a FLEX chip. Logos on card surfaces (`TeamLogo` + abbr); 8px color dots in dense tables. `Matchup` defaults to dots.
3. **One typeface, no monospace.** Plus Jakarta Sans for everything. Numbers use `font-variant-numeric: tabular-nums` at weight 600–700 so columns align without a mono face.
4. **The summary screams, the table whispers.** One number per screen at display size. Player names, team abbreviations, and every primary number are `--foreground` at weight 600. Labels and column headers use `--muted-foreground`.
5. **Drawer, not page.** Clicking a game or a lineup opens a right-side drawer. Filters, sort, scroll position never reset.
6. **Every number has a run.** A `run_id` badge is visible on every screen. Stale runs are marked; two runs can be compared.
7. **Dual theme, app-shaped.** Theme lives in tokens: light on bare `:root`; dark on `[data-theme="dark"]` and on `:root:not([data-theme="light"])` when the OS prefers dark. A stored `nfl-edge.theme` of `light` or `dark` sets `data-theme` before paint. No component color forks. Field gradient uses `--field-cool` / `--field-mid` / `--field-warm` (light cool-to-warm; dark stays dark). Cards are solid `--card` with a structural `--border` — no card shadow, no `backdrop-blur`. Glass is the overlay layer only. It is a tool, not a landing page: no hero, no marketing copy, no oversized display type.

## Tokens (`globals.css`, shadcn variable names where they exist)

### Color — neutral

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#F4F5F7` | `#12141A` | mid-tone fill; field is the gradient |
| `--field-cool` | `#E8ECF2` | `#0E1016` | field gradient top |
| `--field-mid` | `#F4F5F7` | `#12141A` | field gradient mid |
| `--field-warm` | `#F3F1EC` | `#16140F` | field gradient bottom |
| `--glass` | `rgb(255 255 255 / 0.72)` | `rgb(28 30 38 / 0.72)` | overlay fill only |
| `--glass-border` | `#B8BCC4` | `#4A5060` | edge on glass overlays |
| `--card` | `#FFFFFF` | `#1C1E26` | cards and any table surface (never glass) |
| `--muted` | `#FAFBFC` | `#2A2E38` | table header; GapTrack rail |
| `--accent` | `#F7F8FA` | `#242832` | hover row |
| `--border` | `#B8BCC4` | `#4A5060` | structural: card edge, ledger header underline, rule after a market+sentence |
| `--border-soft` | `#E4E7EC` | `#2E323C` | intra-row only (the two vertical group rails) |
| `--foreground` | `#111318` | `#F2F3F6` | text, numbers |
| `--muted-foreground` | `#5B6270` | `#A8AFBC` | labels, captions, column headers, leftover punctuation |

Field is deeper than the card in light; the card is lighter than the field in dark. Cards are solid `--card` plus `--border`. No card shadow. `--border` is the structural line (~1.5–2:1 vs field and card). `--border-soft` stays quieter and is only used inside a row.

### Color — semantic (the only saturated colors)

Dark values are lifted, not inverted. `#0B7A4C` / `#1F56D9` fail ~3:1 on a dark card.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--edge-pos` | `#0B7A4C` (tint `#E5F6EE`) | `#3DCC8A` (tint `#1A3D2E`) | model likes it (positive edge / over / favorite covers) |
| `--edge-neg` | `#B8342A` (tint `#FCE9E6`) | `#F07167` (tint `#3D2422`) | model fades it |
| `--edge-flat` | `--muted-foreground` | `--muted-foreground` | \|edge\| below threshold |
| `--warn` | `#9A5A00` | `#E8A040` | stale run, check warning, injury override active |
| `--line` | `#1F56D9` (tint `#EEF3FF`) | `#7B9CFF` (tint `#1A2744`) | market line / market side of any comparison |
| `--model` | `--foreground` | `--foreground` | model side of any comparison |

All readable roles are ≥ 4.5:1 on every surface in both themes. GapTrack tints must stay visible as a band on `--card` — named hexes, not implied by “semantics get a counterpart.”

### Color — position (identity, not edge)

| Token | Fill / tint | Use |
|---|---|---|
| `--pos-qb` | `#1F3D99` / `#E4E8F5` | QB pill |
| `--pos-rb` | `#2F6A14` / `#E8EFE3` | RB pill |
| `--pos-wr` | `#A31D4C` / `#F6E6ED` | WR pill |
| `--pos-te` | `#7A14A8` / `#F2E6F8` | TE pill |
| `--pos-dst` | `#B84400` / `#F9EFE8` | DST pill |

`PositionPill`: `h-7` (carries `t-body` 15/22), radius 6, abbreviation, `aria-label`. Ink is `--pos-ink` (`#FFFFFF` in both themes) on the fill (not tint-on-tint, never `--card` — a dark card would fail). Fills keep the same hex in both themes. FLEX never has its own token. Caption chips (`StatusPill`, `StackChip`) stay `h-6`.

Rule: model values are neutral foreground; **market** values are `--line` blue; the **difference** is the only thing that goes green/red. Never color a raw projection.

Edge intensity: weight ramps with |edge|. 0–1% flat (`--muted-foreground`); 1–3% color at weight 500; >3% color at weight 600. Opacity is never used to fade readable numbers (it drops contrast below 4.5:1).

### Typography

Plus Jakarta Sans throughout (Google Fonts), fallback `system-ui`. No second family.

| Role | Size / line | Weight |
|---|---|---|
| Page/tile number | 32/40 | 800, tracking −0.02em |
| Player/game title | 22/28 | 800 |
| Sentence copy (verdicts, callouts) | 16/24 | 400, key facts in 700 |
| Body, table cell | 15/22 | 500; `.t-body.tnum` 600 |
| Column header | 14/20 | 600, uppercase, 0.04em |
| Caption | 14/20 | 500, `--muted-foreground` |

Numbers: `tabular-nums`, weight 600 on `.t-body.tnum` so 15px numbers read heavier than 14px labels. Right-aligned in tables. Signs always shown (`+3.4`, `−7`). Probabilities as `61%`. Nothing renders below 14px.

### Spacing, radius, motion

- Spacing scale: 4, 8, 12, 16, 24, 32. Table cell padding 8×12. Card padding 16. Drawer padding 24.
- Radius: 6 (pills, segmented controls), 8 (buttons, sidebar items), 12 (cards).
- Motion: 120ms (hover, focus), 200ms (drawer open, row expand), 350ms (page-level). Easing `cubic-bezier(0.2, 0, 0, 1)`. No motion that isn't a response to a click.
- Rows: 48px in tables and compact logs. Sidebar items 36px.

## Components

shadcn primitives used as-is: `Table`, `Sheet` (drawer), `Badge`, `Tabs`, `Toggle`, `Slider`, `Command` (player search), `Tooltip`, `Select`.

Custom, built on top:

### `MetricIcon`
Lucide only, 14px, `strokeWidth={1.5}`. Map in `web/src/lib/icons.ts`: projection `Target`, salary `CircleDollarSign`, value `Ratio`, ownership `Users`, leverage `UnfoldVertical`, win% `Trophy`, ROI `Percent`, edge `Crosshair`, stack `Layers`, lock `Lock`, exclude `CircleSlash`. Sits immediately before the matching column header or tile label. Never emoji. Sidebar nav: Edge board `LayoutDashboard`, Games `Calendar`, Players `Users`, Optimize `Wand2`, Props `Crosshair`, Lineups `Layers`, Grading `ClipboardCheck`, Claims `ClipboardList`, LOC league `Trophy`.

### `VerdictCard`
One game on the edge board in Plain English mode. Three-row ledger — spread, total, moneyline — not a paragraph plus a chip stack. Columns once per card: Pick, Ours, Book, Needs, Gap, Price, Edge. Ledger header is solid `--card` with a `--border` underline — not sticky, not glass. Vertical `--border-soft` rails sit only between the three groups: Pick | Ours Book Needs Gap | Price Edge. The sentence is indented under its own market row; the `--border` divider is after the sentence. No zebra. Ours is `--foreground`; Book is `--line`; Needs is `americanToProb(price)` (the price break-even, never the de-vigged market prob); only the gap/edge is green or red. Gap is a `GapTrack`: spread on a fixed −14…+14 home-book domain (clamped; fill width comparable across cards); total and moneyline on 0–1. Sentences stay persisted: `[0]` (and `[1]` when kept) on spread, `[2]` on total, optional `[3]` on moneyline. Team abbreviations only — never “Home”. Warning captions sit once in the header. Grammar is Python; the UI never invents it.

### `GapTrack`
144px recessed rail (`--muted`, `--border-soft` hairline). Two 2×10px ticks: model `--foreground`, book `--line`. Fill between them is `--edge-pos-tint` or `--edge-neg-tint`. Dark rail is `#2A2E38`; dark fills are `#1A3D2E` / `#3D2422` — visible bands on the dark card. No axis labels. Spread domain is shared (−14…+14); do not self-scale to the two marks.

### `PropCallout`
Tinted `--line` block under a player header: "Gibbs goes over 89.5 rush + receiving yards in 61% of our 20,000 simulated games. At −115 the book is pricing it like a 53% shot..." with a Lean over/under pill. Generated from `proj_players.stat_summary` and the entered line.

### `StatBars`
Outlier-style bar chart: one bar per recent game, green if it cleared the current line, red if not, dashed `--line` rule at the line. Header strip: line pill, over/under prices, "Cleared it, last 10", average, typical sim game, chance of over.

### `EdgeCell`
The atom of the edge board. Shows model value, market value, and their difference.
Props: `model: number`, `market: number`, `kind: 'spread'|'total'|'prob'|'pct'`, `threshold?: number`.
Renders model, market, and difference (no middot) with market in `--line`, difference colored by sign and scaled by intensity ramp. Tooltip shows P(cover) at market and the draw count.

### `MarketPill`
Market line as a compact chip: `SEA −3.5 (−110)`. Always `--line`. Click opens line-movement sparkline (from `raw.market_lines` snapshots).

### `DistributionSpark`
40×16 inline density of a stat's draws with p10/p50/p90 ticks and an optional vertical marker for a prop line. Used in player rows and drawers. Neutral foreground; marker in `--line`.

### `RunBadge`
`run 7f3a · Tue 09:14 · 20k` in caption type. `--warn` border if a newer run exists for the week. Click: switch run or diff two runs.

### `LineupCard`
One lineup: 9 slots as a single row (`QB RB RB WR WR WR TE FLEX DST`), salary used, proj, sim win%, ROI, stack chips. Compact by default; expands inline to per-player rows.

### `StackChip`
`SEA 3` / `SEA 2 + NE 1` — team abbreviation, count, bring-back marker. Neutral; hover reveals the players.

### `ExposureBar`
Player exposure across the build vs. projected field ownership: two thin bars, mine in foreground, field in `--line`. Leverage (mine − field) as an `EdgeCell` of kind `pct`. This is the Stokastic "exposure vs. field on every build" idea as one component.

### `CheckStatus`
Invariant/warning results for a run: green dot = all invariants passed; `--warn` = warnings present; `--edge-neg` = invariant failed (screen shows a banner and refuses to display edges from that run).

## Patterns

### App shell
Sidebar (216px expanded / 64px collapsed **solid** `--card` rail; Edge board, Games, Players, Optimize, Props, Lineups, Grading, Claims, LOC league; `RunBadge` pinned at bottom) + glass top bar (breadcrumb, theme toggle, search with `/`, page actions). Breadcrumbs use `›` and product labels (`Week 1 › Lineups › DK Main`); nested week routes skip a redundant “Edge board” prefix; the current page is weight 600, not a link. Players and Optimize point at `/week/{n}/players|optimize/dk/main` via `/players` and `/optimize` redirects. Content is a 16px-gapped grid inside 20px padding. **LOC league** (`/league`, season-long fantasy) is outside the NFL week: its sidebar href is plain `/league`, it has no week selector, slate, or game strip, and its sections (Standings, Season, Matchups, Acquire, Wire, Transactions) are a link tab strip. Luck is a table on Season. Only differences are colored (actual minus projected, luck); scores, projections, and win counts stay foreground.

**Glass on the overlay layer, solid cards.** `backdrop-filter: blur` only on surfaces that overlay moving content:

- TopBar
- WeekHeader (`sticky top-[var(--topbar-height)]`)
- Players pick-summary bar
- Players filter bar (when it exists)
- Sheet drawer

Each glass surface keeps a `--glass-border` (or `--border`) edge. The Edge ledger header is **not** on this list — it is solid `--card` with a `--border` underline. Cards, sidebar, DataTable, and the optimizer settings panel are solid `--card`. Forbidden to add blur to cards or stacked panels.

### Mobile (under `md`, 768px)

- The sidebar is hidden. A 36px menu button at the left of the top bar opens a left sheet with the same nav links and the pinned run badge; following a link closes it.
- Top bar: 12px side padding, breadcrumb truncates, search becomes an icon that opens a full-width bar over the top bar (Escape or blur closes it). Content padding is 12px.
- The game drawer is full width under `sm`, 520px from `sm` up.
- Tables scroll inside their own card; the page body never scrolls sideways.
- Type stays on the 14px floor; touch targets grow in height/padding, not smaller type.
- Not yet done: card-per-row board, and an unsticky week header (it wraps and stays sticky).

### Game strip
Horizontally scrollable kickoff-grouped chips on the Edge board (below WeekHeader), Games, Players, Optimize, and Props — not Lineups, Grading, or Claims. Solid, in-flow, not sticky and not glass. Each chip is away logo, `@`, home logo, and kickoff (or `{away}–{home} Final`). Selected chips invert (`bg-foreground text-background`). Window headers toggle that group. **Clear games** sits next to the strip; Players pick-bar **Clear picks** is a different control. URL is `games=` comma-separated full `game_id`s.

### Edge board (`/week/[n]`)
- Week summary sentence card with Plain English / Table toggle. Plain English also has Full / Compact (`?density=compact`; omitted when Full).
- Plain English: stack of `VerdictCard`s sorted by |max edge|. Compact collapses each game to one 48px row (matchup, three market edges, warning dot) that expands on click. Table: four summary tiles then the dense table below.
- Table, one row per game, sorted by |max edge| desc. Columns: matchup (dots + abbrs, kickoff), `EdgeCell` spread, `EdgeCell` total, `EdgeCell` ML (as prob), P(cover) at market, `MarketPill`, `CheckStatus`.
- Row click → `Sheet` drawer: score distribution (two-team histogram), fair vs. market history, top-10 player projections with `DistributionSpark`, correlation heat strip for that game.
- Filters (top-left, persistent): slate (main/early/late/primetime), min |edge|, hide flat.

### Lineup review (`/week/[n]/dfs/[site]/[slate]`)
- Header: site/slate tabs, `RunBadge`, build settings summary (randomness, stacks %, max exposure) as read-only chips linking to config.
- Left 2/3: `LineupCard` list, virtualized; sort by proj / win% / ROI; select rows for export.
- Right 1/3: exposure panel: `ExposureBar` per player, sorted by leverage; team stack distribution; salary histogram.
- Row click → drawer with per-player `DistributionSpark`, stack correlation, "why this lineup" (top 3 correlations that drove it).
- Pick one: Cash ranks by floor (sum of each player's p10) and hides Win % / ROI. Tournament ranks by simulated ROI among lineups within 4 points of the top projection that stack the quarterback with a same-team receiver or tight end, and shows summed field ownership. Screens (out, doubtful, usage cut, projected before the injury report, leftover salary, same player twice) each name a reason. RTS is a side-by-side total when `raw.external_players` source=rts is loaded; otherwise an em dash — never blended into our projection. Export this lineup writes `dk_upload_<slate_id>_<run_id first 8>_single.csv`.
- Export: DK/FD CSV of selected lineups. Filename `dk_upload_<slate_id>_<run_id first 8>_sim.csv`; line 1 is the DK header.

### Player library (`/week/[n]/players/[site]/[slate]`)
- `SlateSelector` from ingested slates. Rows from `slatePlayers` (one DK id; real position, never FLEX).
- Columns: name + `PositionPill` + injury, team, opponent, kickoff, salary, DK pts, Pts rk, ceiling (`fpts_ppr` p90), ownership, value, typical game. No DK id, Floor, Val rk, or Ceil rk — dropped so the 15px scale fits. Ranks are position-relative `tnum` text over the slate, not badges. No Leverage column until `parse_exposure_csv` reads by position. Game filter is the strip (`games=`), not a table select.
- Row actions: Lock, Exclude, Add to stack. Persisted as comma-separated `player_dk_id`s in URL (`lock`, `excl`, `stack`) and `localStorage` key `nfl-edge.slate:{slateId}`. URL wins on load.
- Stale OUT/D (override after the run) grey the projection and drop from the optimizer pool. Q stays in.

### Optimizer (`/week/[n]/optimize/[site]/[slate]`)
- Solid `--card` settings panel (no table on glass): lineups 1–20, cap, min salary, max exposure, max per team, randomness, QB+n WR/TE, bring-back, no-QB-vs-DST (default on). Showdown hides stack rules. With one or more locks, a suggestions panel lists same-game partners ranked by `corr × fpts_dk_sd`. Add-to-stack requires both players in every lineup while Require stacked group is on. Suggestions are additive to `stackN` / `bringBack`.
- Classic: 1 QB, 2–3 RB, 3–4 WR, 1–2 TE, 1 DST, 9 players. Stack / bring-back / no-QB-vs-DST are per-team (`Σ WR/TE_T ≥ n·QB_T`, `Σ opp_T ≥ k·QB_T`, `QB_T + DST_opp ≤ 1`). Showdown: CPT ≠ FLEX; CPT is 1.5× points and salary.
- Tabs: **Yours** (`LineupCard` with salary, projection, ownership sum, stack chips; Win%/ROI are —) and **Sim 150** (`model.dfs_lineups`). “Start from this lineup” writes those DK ids into locks.
- Export selected: filename `dk_upload_<slate_id>_<run_id first 8>_user-optimized.csv`. Line 1 is the DK header. IDs are `player_dk_id` only.

### Prop detail (`/props/[game]/[player]`)
- Header card: avatar, name, position pill, game context, `Enter a line`, market tabs (Rush yds, Rec yds, Rush + Rec, Receptions, Anytime TD), L5/L10/L20/season/H2H segment, `PropCallout`.
- Main: `StatBars` card, then a game-log card (date, opp, result, carries, rush yds, targets, catches, rec yds, total, vs line).
- Right rail (340px): "Where his yards land" (sim histogram with 1-in-10 markers and fair price), "How the line has moved" (manual snapshots with model P(over) at each), "Up against" (defense/offense toggle, five plain-language rows), "When X goes over, who else does" (correlations as usually up / slightly up / usually down).

### Grading (next)
Same tokens and components; `DistributionSpark` becomes a full-width histogram in the player drawer with a prop-line input; grading reuses the edge-board table with an added Actual column and a calibration chart.

## Accessibility

- Color never carries meaning alone: every colored difference also has a sign character, and `CheckStatus` has a label on hover and in the DOM.
- Contrast: all text ≥ 4.5:1 on its surface in **both** themes. Player names, team abbreviations, and primary numbers are `--foreground` at 600. `--muted-foreground` is labels only. The test suite fails the build on any readable pair below 4.5:1.
- Keyboard: `j/k` row navigation, `Enter` opens drawer, `Esc` closes, `/` focuses player search, `[` `]` change week.
- Drawer is a `Sheet` with focus trap and `aria-labelledby` set to the matchup or lineup id.

## Not in the system

Team-color themes, headshots, animated odds tickers, gradient cards, a pure-white app field, glass on cards or stacked panels, and anything that colors a number that isn't a difference against the market. Dual theme is tokens only. A field gradient is allowed; glass is the overlay layer only.
