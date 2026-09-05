# nfl-edge design system

Stack: Next.js + shadcn/ui on Vercel, reading `model.*` from Supabase. v1 surfaces: **Edge board** and **Lineup review**. Everything below exists so those two screens (and the player/props and grading screens that follow) share one language.

## Principles

1. **Signal only.** Color means one thing: edge and its direction. Nothing else is colored. Team colors appear only as a 6px dot next to an abbreviation.
2. **Numbers are the interface.** Labels are quiet sans; every number is monospace, tabular, right-aligned. Columns line up or the screen is wrong.
3. **The summary screams, the table whispers.** One number per screen at display size. Everything repeated per row is at body size, muted, and gains weight only when it crosses a threshold.
4. **Drawer, not page.** Clicking a game or a lineup opens a right-side drawer. Filters, sort, scroll position never reset.
5. **Every number has a run.** A `run_id` badge is visible on every screen. Stale runs are marked; two runs can be compared.
6. **Light, not white.** Light is the only theme in v1. The page is warm off-white, not `#FFF`, so hours on the board don't glare; surfaces separate by hairline and a half-step of tone, not by shadow. No dark mode until someone asks for it.

## Tokens (`globals.css`, shadcn variable names where they exist)

### Color — neutral

| Token | Value | Use |
|---|---|---|
| `--background` | `#F6F5F2` | page (warm off-white; never pure white) |
| `--card` | `#FFFFFF` | app shell, cards, table body |
| `--muted` | `#EFEDE8` | table header, panels, code |
| `--accent` | `#E7E4DD` | hover row, selected row, drawer surface |
| `--border` | `#DAD7CF` | hairlines |
| `--foreground` | `#1B1A17` | primary text, numbers |
| `--muted-foreground` | `#6B685F` | labels, secondary numbers |

Four-step elevation: background → card → muted → accent. Cards get one shadow, `0 1px 2px rgb(27 26 23 / 0.06)`, and a `--border` hairline; nothing else casts a shadow.

### Color — semantic (the only saturated colors)

| Token | Value | Meaning |
|---|---|---|
| `--edge-pos` | `#1A7F5A` | model likes it (positive edge / over / favorite covers) |
| `--edge-neg` | `#C0392B` | model fades it |
| `--edge-flat` | `--muted-foreground` | |edge| below threshold |
| `--warn` | `#B26B00` | stale run, check warning, injury override active |
| `--line` | `#2F5FD0` | market line / market side of any comparison |
| `--model` | `--foreground` | model side of any comparison |

All semantic colors are ≥ 4.5:1 on `--card` and `--background`. Tinted backgrounds for chips use the semantic color at 10% opacity.

Rule: model values are neutral foreground; **market** values are `--line` blue; the **difference** is the only thing that goes green/red. Never color a raw projection.

Edge intensity: opacity ramps with |edge|. 0–1% flat; 1–3% color at 70%; >3% color at 100% and weight 600. This is the "conditional emphasis" rule made concrete.

### Typography

| Role | Family | Size / line | Weight | Notes |
|---|---|---|---|---|
| Display number | `Geist Mono`, fallback `ui-monospace` | 32/36 | 600 | one per screen |
| Table number | `Geist Mono` | 13/20 | 500 | `font-variant-numeric: tabular-nums`; right-aligned |
| Body / label | `Geist Sans`, fallback `system-ui` | 13/20 | 400 | |
| Column header | `Geist Sans` | 11/16 | 500 | uppercase, 0.04em tracking, `--muted-foreground` |
| Caption | `Geist Sans` | 11/16 | 400 | run id, timestamps |

Numbers are always 500 or heavier; labels never above 500. Percentages carry the sign: `+2.4%`, `−0.8%`. Spreads carry sign and half-points: `−3.5`. Probabilities are `62%`, never `0.62`.

### Spacing, radius, motion

- Spacing scale: 4, 8, 12, 16, 24, 32. Table cell padding 8×12. Card padding 16. Drawer padding 24.
- Radius: 4 (chips, cells), 6 (cards, inputs), 8 (drawer). Nothing rounder.
- Motion: 120ms (hover, focus), 200ms (drawer open, row expand), 350ms (page-level). Easing `cubic-bezier(0.2, 0, 0, 1)`. No motion that isn't a response to a click.
- Density toggle: `compact` (row 32px) default; `comfortable` (row 40px).

## Components

shadcn primitives used as-is: `Table`, `Sheet` (drawer), `Badge`, `Tabs`, `Toggle`, `Slider`, `Command` (player search), `Tooltip`, `Select`.

Custom, built on top:

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

### Edge board (`/week/[n]`)
- Header: week selector, `RunBadge`, density toggle, one display number: count of games with |edge| above threshold.
- Table, one row per game, sorted by |max edge| desc. Columns: matchup (dots + abbrs, kickoff), `EdgeCell` spread, `EdgeCell` total, `EdgeCell` ML (as prob), P(cover) at market, `MarketPill`, `CheckStatus`.
- Row click → `Sheet` drawer: score distribution (two-team histogram), fair vs. market history, top-10 player projections with `DistributionSpark`, correlation heat strip for that game.
- Filters (top-left, persistent): slate (main/early/late/primetime), min |edge|, hide flat.

### Lineup review (`/week/[n]/dfs/[site]/[slate]`)
- Header: site/slate tabs, `RunBadge`, build settings summary (randomness, stacks %, max exposure) as read-only chips linking to config.
- Left 2/3: `LineupCard` list, virtualized; sort by proj / win% / ROI; select rows for export.
- Right 1/3: exposure panel: `ExposureBar` per player, sorted by leverage; team stack distribution; salary histogram.
- Row click → drawer with per-player `DistributionSpark`, stack correlation, "why this lineup" (top 3 correlations that drove it).
- Export: DK/FD CSV of selected lineups; the export is stamped with `run_id`.

### Player view and grading (next)
Same tokens and components; `DistributionSpark` becomes a full-width histogram in the player drawer with a prop-line input; grading reuses the edge-board table with an added Actual column and a calibration chart.

## Accessibility

- Color never carries meaning alone: every colored difference also has a sign character, and `CheckStatus` has a label on hover and in the DOM.
- Contrast: all text ≥ 4.5:1 on its surface (semantic colors chosen for that).
- Keyboard: `j/k` row navigation, `Enter` opens drawer, `Esc` closes, `/` focuses player search, `[` `]` change week.
- Drawer is a `Sheet` with focus trap and `aria-labelledby` set to the matchup or lineup id.

## Not in the system

Dark mode, team-color themes, headshots, animated odds tickers, gradient cards, pure-white backgrounds, and anything that colors a number that isn't a difference against the market.
