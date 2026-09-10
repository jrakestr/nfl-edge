#!/bin/bash
# Line-snapshot + edges/verdicts job. launchd StartInterval is 1800s (30 min).
# Through 2026-09-13 23:59:59 America/Los_Angeles every fire runs.
# After that cutoff, only even Pacific hours (2 h cadence) proceed; other fires exit 0.
#
# After ingest --lines-only, immediately run nfl-edge lines for 2026 week 1 so edges and
# verdicts follow every snapshot. lines resolves the newest sim run for the week (all games;
# no slate filter). Both steps append to output/cron-lines.log.
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"
LOG="$ROOT/output/cron-lines.log"

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

# launchd also redirects stdout/err here; reopen so a manual run logs the same way.
exec >>"$LOG" 2>&1

nfl_edge() {
  /usr/bin/env -u DATABASE_URL "$ROOT/.venv/bin/nfl-edge" "$@"
}

echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') ingest --season 2026 --lines-only ==="
nfl_edge ingest --season 2026 --lines-only

echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') lines --season 2026 --week 1 ==="
nfl_edge lines --season 2026 --week 1
