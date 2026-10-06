#!/bin/bash
# League of Champions injury-status snapshot. launchd StartInterval is 3600s (hourly).
# Proceeds only Thursday through Monday, 06:00-19:59 America/Phoenix; every other fire exits 0.
# Appends one set of current-week roster statuses to fantasy.loc_status_snapshots
# (append-only; one ESPN league fetch, no scores, no other table).
# DB or ESPN unreachable (Mac asleep / off Wi-Fi): one line, exit 0. Rejected cookies and other
# errors keep their message and a non-zero exit so the log shows them.
# LOC_SNAPSHOT_DOW (1=Mon..7=Sun) and LOC_SNAPSHOT_HOUR override the clock; LOC_SNAPSHOT_DRY=1 prints
# the decision and exits without calling ESPN (used to check the window).
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"
# shellcheck source=unreachable.sh
. "$ROOT/ops/unreachable.sh"

DOW="${LOC_SNAPSHOT_DOW:-$(TZ=America/Phoenix date "+%u")}"
HOUR=$((10#${LOC_SNAPSHOT_HOUR:-$(TZ=America/Phoenix date "+%H")}))

case "$DOW" in
  4|5|6|7|1) ;;
  *) [ -n "${LOC_SNAPSHOT_DRY:-}" ] && echo "skip: weekday $DOW"; exit 0 ;;
esac
if [ "$HOUR" -lt 6 ] || [ "$HOUR" -gt 19 ]; then
  [ -n "${LOC_SNAPSHOT_DRY:-}" ] && echo "skip: hour $HOUR"
  exit 0
fi
if [ -n "${LOC_SNAPSHOT_DRY:-}" ]; then
  echo "run: weekday $DOW hour $HOUR"
  exit 0
fi

NFL="$ROOT/.venv/bin/nfl-edge"

set +e
out=$(/usr/bin/env -u DATABASE_URL "$NFL" ingest espn-league --season 2026 --snapshot-only 2>&1)
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
