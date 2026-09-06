#!/bin/bash
# Line-snapshot job. launchd StartInterval is 1800s (30 min).
# Through 2026-09-13 23:59:59 America/Los_Angeles every fire runs.
# After that cutoff, only even Pacific hours (2 h cadence) proceed; other fires exit 0.
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"

CUTOFF=$(TZ=America/Los_Angeles date -j -f "%Y-%m-%d %H:%M:%S" "2026-09-13 23:59:59" "+%s")
NOW=$(date +%s)
if [ "$NOW" -gt "$CUTOFF" ]; then
  HOUR=$(TZ=America/Los_Angeles date "+%H")
  MIN=$(TZ=America/Los_Angeles date "+%M")
  # Keep the :00 fire on even hours; skip :30 and odd hours (StartInterval drift: minute < 15).
  if [ $((10#$HOUR % 2)) -ne 0 ] || [ "$((10#$MIN))" -ge 15 ]; then
    exit 0
  fi
fi

exec /usr/bin/env -u DATABASE_URL "$ROOT/.venv/bin/nfl-edge" ingest --season 2026 --lines-only
