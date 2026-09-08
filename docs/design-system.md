# nfl-edge design system

Stack: Next.js + shadcn/ui on Vercel, reading `model.*` from Supabase. v1 surfaces: **Edge board**, **Prop detail**, **Lineup review**. Mockups live in the nfl-edge canvas artifact; this doc is the spec they follow.

Reference products for feel: Outlier.bet for the prop/game detail layout (header, market tabs, stat-vs-line chart, right rail with timeline and matchup), Linear for list-plus-drawer discipline.

## Principles

1. **Plain English first, numbers second.** Every screen leads with a sentence a normal person can read ("Detroit is favored to beat New Orleans by 10.4 points. The book has them by 7."). Numbers support the sentence as chips and columns; a Plain English / Table toggle exposes the dense view. Column headers say what the number means ("Cleared it, last 10", "Chance of over"), never the abbreviation.
2. **Signal only.** Color means one thing: **edge and its direction**, plus **position identity**. Position is a small filled pill next to the name (one token per real position: QB, RB, WR, TE, DST). FLEX slots show the player's actual position, never a FLEX chip. Team colors appear only as an 8px dot next to an abbreviation.
3. **One typeface, no monospace.** Plus Jakarta Sans for everything. Numbers use `font-variant-numeric: tabular-nums` at weight 600–700 so columns align without a mono face.
4. **The summary screams, the table whispers.** One number per screen at display size. Player names, team abbreviations, and every primary number are `--foreground` at weight 600. Labels and column headers use `--muted-foreground`. `--dim` is never used for anything a person needs to read.
5. **Drawer, not page.** Clicking a game or a lineup opens a right-side drawer. Filters, sort, scroll position never reset.
6. **Every number has a run.** A `run_id` badge is visible on every screen. Stale runs are marked; two runs can be compared.
7. **Light, app-shaped.** Light is the only theme. Cool grey field (`#F4F5F7`), white cards with a 1px `#E6E8EC` border and 12px radius, a 216px white sidebar, a 52px top bar with breadcrumb, search and actions. It is a tool, not a landing page: no hero, no marketing copy, no oversized display type.

## Tokens (`globals.css`, shadcn variable names where they exist)

### Color — neutral

| Token | Value | Use |
|---|---|---|
| `--background` | `#F4F5F7` | app field |
| `--card` | `#FFFFFF` | sidebar, top bar, cards |
| `--muted` | `#FAFBFC` | table header |
| `--accent` | `#F7F8FA` | hover row |
| `--border` | `#E6E8EC` | card and bar borders |
| `--border-soft` | `#EEF0F3` | row dividers |
| `--foreground` | `#111318` | text, numbers |
| `--muted-foreground` | `#5B6270` | labels, captions, column headers |
| `--dim` | `#A0A6B1` | decorative punctuation and placeholders only |

Four-step elevation: background → card → muted → accent. Cards get one shadow, `0 1px 2px rgb(27 26 23 / 0.06)`, and a `--border` hairline; nothing else casts a shadow.

### Color — semantic (the only saturated colors)

| Token | Value | Meaning |
|---|---|---|
| `--edge-pos` | `#0B7A4C` (tint `#E5F6EE`) | model likes it (positive edge / over / favorite covers) |
| `--edge-neg` | `#B8342A` (tint `#FCE9E6`) | model fades it |
| `--edge-flat` | `--muted-foreground` | |edge| below threshold |
| `--warn` | `#9A5A00` | stale run, check warning, injury override active |
| `--line` | `#1F56D9` (tint `#EEF3FF`) | market line / market side of any comparison |
| `--model` | `--foreground` | model side of any comparison |

All semantic colors are ≥ 4.5:1 on `--card` and `--background`. Tinted backgrounds for chips use the semantic color at 10% opacity.

### Color — position (identity, not edge)

| Token | Fill / tint | Use |
|---|---|---|
| `--pos-qb` | `#2C4A8C` / `#E6E9F1` | QB pill |
| `--pos-rb` | `#1A5F52` / `#E4ECEA` | RB pill |
| `--pos-wr` | `#8A4B0A` / `#F1E9E2` | WR pill |
| `--pos-te` | `#5A3D8A` / `#EBE8F1` | TE pill |
| `--pos-dst` | `#4A5564` / `#E9EBEC` | DST pill |

`PositionPill`: `h-5`, radius 6, abbreviation, `aria-label`. Text is the position color on the tint. FLEX never has its own token.

Rule: model values are neutral foreground; **market** values are `--line` blue; the **difference** is the only thing that goes green/red. Never color a raw projection.

Edge intensity: weight ramps with |edge|. 0–1% flat (`--muted-foreground`); 1–3% color at weight 500; >3% color at weight 600. Opacity is never used to fade readable numbers (it drops contrast below 4.5:1).

### Typography

Plus Jakarta Sans throughout (Google Fonts), fallback `system-ui`. No second family.

| Role | Size / line | Weight |
|---|---|---|
| Page/tile number | 26/32 | 800, tracking −0.02em |
| Player/game title | 18/24 | 800 |
| Sentence copy (verdicts, callouts) | 14/21 | 400, key facts in 700 |
| Body, table cell | 13/18 | 500 |
| Column header | 11/16 | 600, uppercase, 0.04em |
| Caption | 11–12 | 500, `--muted-foreground` |

Numbers: `tabular-nums`, weight 600–700, right-aligned in tables. Signs always shown (`+3.4`, `−7`). Probabilities as `61%`.

### Spacing, radius, motion

- Spacing scale: 4, 8, 12, 16, 24, 32. Table cell padding 8×12. Card padding 16. Drawer padding 24.
- Radius: 6 (pills, segmented controls), 8 (buttons, sidebar items), 12 (cards).
- Motion: 120ms (hover, focus), 200ms (drawer open, row expand), 350ms (page-level). Easing `cubic-bezier(0.2, 0, 0, 1)`. No motion that isn't a response to a click.
- Rows: 44px in tables, 40px in compact logs. Sidebar items 36px.

## Components

shadcn primitives used as-is: `Table`, `Sheet` (drawer), `Badge`, `Tabs`, `Toggle`, `Slider`, `Command` (player search), `Tooltip`, `Select`.

Custom, built on top:

### `VerdictCard`
One game on the edge board in Plain English mode. Three lines generated from `proj_games` + `market_lines`: (1) who is favored and by how much vs the book, (2) whether the market side covers often enough to pay (needs ~52% at −110), (3) expected total vs line with over/under hit rate. Right column: `Side`, `Total`, `Home wins` chips. Grammar handles plural nicknames ("The Rams are").

### `PropCallout`
Tinted `--line` block under a player header: "Gibbs goes over 89.5 rush + receiving yards in 61% of our 20,000 simulated games. At −115 the book is pricing it like a 53% shot..." with a Lean over/under pill. Generated from `proj_players.stat_summary` and the entered line.

### `StatBars`
Outlier-style bar chart: one bar per recent game, green if it cleared the current line, red if not, dashed `--line` rule at the line. Header strip: line pill, over/under prices, "Cleared it, last 10", average, typical sim game, chance of over.

### `EdgeCell`
The atom of the edge board. Shows model value, market value, and their difference.
Props: `model: number`, `market: number`, `kind: 'spread'|'total'|'prob'|'pct'`, `threshold?: number`.
Renders: `−4.1 · −3.5 · +0.6` with market in `--line`, difference colored by sign and scaled by intensity ramp. Tooltip shows P(cover) at market and the draw count.

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
Sidebar (Edge board, Games, Players, Props, Lineups, Grading; `RunBadge` pinned at bottom) + top bar (breadcrumb, search with `/`, page actions). Content is a 16px-gapped grid inside 20px padding.

### Edge board (`/week/[n]`)
- Week summary sentence card with Plain English / Table toggle.
- Plain English: stack of `VerdictCard`s sorted by |max edge|. Table: four summary tiles then the dense table below.
- Table, one row per game, sorted by |max edge| desc. Columns: matchup (dots + abbrs, kickoff), `EdgeCell` spread, `EdgeCell` total, `EdgeCell` ML (as prob), P(cover) at market, `MarketPill`, `CheckStatus`.
- Row click → `Sheet` drawer: score distribution (two-team histogram), fair vs. market history, top-10 player projections with `DistributionSpark`, correlation heat strip for that game.
- Filters (top-left, persistent): slate (main/early/late/primetime), min |edge|, hide flat.

### Lineup review (`/week/[n]/dfs/[site]/[slate]`)
- Header: site/slate tabs, `RunBadge`, build settings summary (randomness, stacks %, max exposure) as read-only chips linking to config.
- Left 2/3: `LineupCard` list, virtualized; sort by proj / win% / ROI; select rows for export.
- Right 1/3: exposure panel: `ExposureBar` per player, sorted by leverage; team stack distribution; salary histogram.
- Row click → drawer with per-player `DistributionSpark`, stack correlation, "why this lineup" (top 3 correlations that drove it).
- Export: DK/FD CSV of selected lineups; the export is stamped with `run_id`.

### Prop detail (`/props/[game]/[player]`)
- Header card: avatar, name, position pill, game context, `Enter a line`, market tabs (Rush yds, Rec yds, Rush + Rec, Receptions, Anytime TD), L5/L10/L20/season/H2H segment, `PropCallout`.
- Main: `StatBars` card, then a game-log card (date, opp, result, carries, rush yds, targets, catches, rec yds, total, vs line).
- Right rail (340px): "Where his yards land" (sim histogram with 1-in-10 markers and fair price), "How the line has moved" (manual snapshots with model P(over) at each), "Up against" (defense/offense toggle, five plain-language rows), "When X goes over, who else does" (correlations as usually up / slightly up / usually down).

### Grading (next)
Same tokens and components; `DistributionSpark` becomes a full-width histogram in the player drawer with a prop-line input; grading reuses the edge-board table with an added Actual column and a calibration chart.

## Accessibility

- Color never carries meaning alone: every colored difference also has a sign character, and `CheckStatus` has a label on hover and in the DOM.
- Contrast: all text ≥ 4.5:1 on its surface. Player names, team abbreviations, and primary numbers are `--foreground` at 600. `--muted-foreground` is labels only. `--dim` is decorative only. The test suite fails the build on any readable pair below 4.5:1.
- Keyboard: `j/k` row navigation, `Enter` opens drawer, `Esc` closes, `/` focuses player search, `[` `]` change week.
- Drawer is a `Sheet` with focus trap and `aria-labelledby` set to the matchup or lineup id.

## Not in the system

Dark mode, team-color themes, headshots, animated odds tickers, gradient cards, pure-white backgrounds, and anything that colors a number that isn't a difference against the market.
