#!/bin/bash
# Tuesday 09:00 Phoenix. Grade every completed REG week that is still ungraded.
# Ingest first; refuse to grade if any game still has a null result.
# DB or github.com unreachable: one line, exit 0.
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"
# shellcheck source=unreachable.sh
. "$ROOT/ops/unreachable.sh"

NFL="$ROOT/.venv/bin/nfl-edge"
SEASON=2026

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

completed=$(capture /usr/bin/env -u DATABASE_URL "$NFL" completed-weeks --season "$SEASON")
ungraded=$(capture /usr/bin/env -u DATABASE_URL "$NFL" ungraded-completed --season "$SEASON")
echo "completed weeks: ${completed:-none}"
echo "ungraded completed: ${ungraded:-none}"

failed=0
for week in $ungraded; do
  echo "=== week $week ==="
  capture /usr/bin/env -u DATABASE_URL "$NFL" ingest --season "$SEASON" --week "$week"
  capture /usr/bin/env -u DATABASE_URL "$NFL" benchmark nflgamesim --season "$SEASON" --week "$week" --refresh-actuals
  set +e
  missing=$(/usr/bin/env -u DATABASE_URL "$NFL" missing-finals --season "$SEASON" --week "$week" 2>&1)
  miss_code=$?
  set -e
  if is_unreachable "$missing"; then
    echo "unreachable, skipped"
    exit 0
  fi
  if [ "$miss_code" -ne 0 ]; then
    echo "week $week missing finals:"
    printf '%s\n' "$missing"
    failed=1
    continue
  fi
  capture /usr/bin/env -u DATABASE_URL "$NFL" grade --season "$SEASON" --week "$week"
done

if [ "$failed" -ne 0 ]; then
  echo "grade refused: one or more completed weeks still lack finals"
  exit 1
fi
