#!/bin/bash
# Line-snapshot + stale-verdict job. launchd StartInterval is 1800s (30 min).
# Through 2026-09-13 23:59:59 America/Los_Angeles every fire runs.
# After that cutoff, only even Pacific hours (2 h cadence) proceed; other fires exit 0.
# DB or github.com unreachable (Mac asleep / off Wi-Fi): one line, exit 0.
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"
# shellcheck source=unreachable.sh
. "$ROOT/ops/unreachable.sh"

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

NFL="$ROOT/.venv/bin/nfl-edge"

# Run a command; on DB/network failure log one line and exit 0. Other errors keep the traceback.
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

capture /usr/bin/env -u DATABASE_URL "$NFL" ingest --season 2026 --lines-only

weeks=$(capture /usr/bin/env -u DATABASE_URL "$NFL" stale-weeks --season 2026)
if [ -z "${weeks// }" ]; then
  exit 0
fi
for week in $weeks; do
  capture /usr/bin/env -u DATABASE_URL "$NFL" lines --season 2026 --week "$week"
done
