#!/bin/bash
# Saturday 20:00 / Sunday 08:40 MST. Week from raw.schedules.
# Sunday: sim must finish by 08:50 or Saturday stays live. lines/props/dfs run to
# completion; log if past 09:30. DK slates from files on disk; Status merge after salaries.
# DB or github.com unreachable: one line, exit 0.
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"
# shellcheck source=unreachable.sh
. "$ROOT/ops/unreachable.sh"

NFL="$ROOT/.venv/bin/nfl-edge"
SEASON=2026
TZ_PHX=America/Phoenix

capture() {
  local out code
  set +e
  out=$("$@" 2>&1)
  code=$?
  set -e
  if [ "$code" -ne 0 ]; then
    if is_unreachable "$out"; then
      echo "unreachable, skipped"
      exit 0
    fi
    printf '%s\n' "$out"
    exit "$code"
  fi
  printf '%s\n' "$out"
}

phx_today() { TZ=$TZ_PHX date "+%Y-%m-%d"; }
phx_at() { TZ=$TZ_PHX date -j -f "%Y-%m-%d %H:%M:%S" "$(phx_today) $1" "+%s"; }
is_sunday() { [ "$(TZ=$TZ_PHX date "+%u")" = "7" ]; }

run_until() {
  local deadline=$1
  shift
  "$@" &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 5
  done
  wait "$pid"
}

keep_saturday() {
  capture /usr/bin/env -u DATABASE_URL "$NFL" drop-incomplete \
    --season "$SEASON" --week "$WEEK" --after "$JOB_START_ISO"
  echo "sun-inactives: sim not complete by 08:50, Saturday run kept"
  exit 0
}

soft_note() {
  if is_sunday && [ "$(date +%s)" -ge "$(phx_at "09:30:00")" ]; then
    echo "soft ceiling 09:30 passed, continuing"
  fi
}

JOB_START_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
NOTE=sat-final
if is_sunday; then
  NOTE=sun-inactives
fi

WEEK=$(capture /usr/bin/env -u DATABASE_URL "$NFL" current-week --season "$SEASON")
if [ -z "${WEEK// }" ]; then
  echo "no week in raw.schedules for today"
  exit 1
fi
WW=$(printf '%02d' "$WEEK")
PROPS_CSV="$ROOT/data/props/props_${SEASON}_wk${WW}.csv"
shopt -s nullglob
DK_CSVS=("$ROOT/data/dk/DKSalaries_${SEASON}_wk${WW}_"*.csv)
if [ ${#DK_CSVS[@]} -eq 0 ]; then
  echo "no DKSalaries_${SEASON}_wk${WW}_*.csv in data/dk/"
  exit 1
fi
SLATES=()
prefix="DKSalaries_${SEASON}_wk${WW}_"
for f in "${DK_CSVS[@]}"; do
  base=$(basename "$f")
  slate=${base#"$prefix"}
  slate=${slate%.csv}
  SLATES+=("$slate")
done

capture /usr/bin/env -u DATABASE_URL "$NFL" ingest --season "$SEASON" --week "$WEEK"
for slate in "${SLATES[@]}"; do
  capture /usr/bin/env -u DATABASE_URL "$NFL" dk-salaries \
    --season "$SEASON" --week "$WEEK" --slate "$slate" --salaries-only
done
capture /usr/bin/env -u DATABASE_URL "$NFL" dk-salaries \
  --season "$SEASON" --week "$WEEK" --merge-status

OV_CSV="$ROOT/data/overrides/${SEASON}_wk${WW}.csv"
if [ -f "$OV_CSV" ]; then
  capture /usr/bin/env -u DATABASE_URL "$NFL" overrides --season "$SEASON" --week "$WEEK" --file "$OV_CSV"
fi

if is_sunday && [ "$(date +%s)" -ge "$(phx_at "08:50:00")" ]; then
  echo "sun-inactives: sim not complete by 08:50, Saturday run kept"
  exit 0
fi

if is_sunday; then
  sim_log=$(mktemp)
  set +e
  run_until "$(phx_at "08:50:00")" /usr/bin/env -u DATABASE_URL "$NFL" sim \
    --season "$SEASON" --week "$WEEK" --draws 20000 --note "$NOTE" >"$sim_log" 2>&1
  sim_code=$?
  set -e
  if [ "$sim_code" -eq 124 ]; then
    rm -f "$sim_log"
    keep_saturday
  fi
  if [ "$sim_code" -ne 0 ]; then
    out=$(cat "$sim_log")
    rm -f "$sim_log"
    if is_unreachable "$out"; then
      echo "unreachable, skipped"
      exit 0
    fi
    printf '%s\n' "$out"
    echo "sun-inactives: sim failed, Saturday run left intact"
    exit "$sim_code"
  fi
  cat "$sim_log"
  rm -f "$sim_log"
else
  capture /usr/bin/env -u DATABASE_URL "$NFL" sim \
    --season "$SEASON" --week "$WEEK" --draws 20000 --note "$NOTE"
fi

newest=$(capture /usr/bin/env -u DATABASE_URL "$NFL" newest-run --season "$SEASON" --week "$WEEK")
set -- $newest
n_games=$2
n_player_games=$3
expect=$(capture /usr/bin/env -u DATABASE_URL "$NFL" slate-count --season "$SEASON" --week "$WEEK")
if [ "$n_games" != "$expect" ] || [ "$n_player_games" != "$expect" ]; then
  if is_sunday; then
    keep_saturday
  fi
  echo "sim proj_games $n_games player_games $n_player_games != slate $expect"
  exit 1
fi

soft_note
# Odds API: 3 credits, one pull per run. RecentDuplicate is a no-op. CLI prints remaining=.
set +e
odds_out=$(/usr/bin/env -u DATABASE_URL "$NFL" ingest odds-api --markets h2h,spreads,totals --regions us 2>&1)
odds_code=$?
set -e
printf '%s\n' "$odds_out"
if [ "$odds_code" -ne 0 ] && ! printf '%s' "$odds_out" | grep -qi 'recent duplicate'; then
  if is_unreachable "$odds_out"; then
    echo "unreachable, skipped"
    exit 0
  fi
  exit "$odds_code"
fi
soft_note
capture /usr/bin/env -u DATABASE_URL "$NFL" lines --season "$SEASON" --week "$WEEK"
soft_note
if [ -f "$PROPS_CSV" ]; then
  capture /usr/bin/env -u DATABASE_URL "$NFL" props --season "$SEASON" --week "$WEEK" --file "$PROPS_CSV"
else
  capture /usr/bin/env -u DATABASE_URL "$NFL" props --season "$SEASON" --week "$WEEK"
fi
for slate in "${SLATES[@]}"; do
  soft_note
  capture /usr/bin/env -u DATABASE_URL "$NFL" dfs \
    --season "$SEASON" --week "$WEEK" --site dk --slate "$slate" --lineups 150 --field 20000
done

newest=$(capture /usr/bin/env -u DATABASE_URL "$NFL" newest-run --season "$SEASON" --week "$WEEK")
echo "rebuild $NOTE week $WEEK $newest"
