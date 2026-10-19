#!/bin/bash
# Every 3 minutes. The command itself exits outside the game window and when
# no game is live, after one scoreboard check.
set -euo pipefail
ROOT="/Users/home/Development/nfl-edge"
cd "$ROOT"
mkdir -p "$ROOT/output"
# shellcheck source=unreachable.sh
. "$ROOT/ops/unreachable.sh"

NFL="$ROOT/.venv/bin/nfl-edge"
out=$(/usr/bin/env -u DATABASE_URL "$NFL" actuals-live --season 2026 2>&1) || {
  if is_unreachable "$out"; then
    echo "unreachable, skipped"
    exit 0
  fi
  printf '%s\n' "$out"
  exit 1
}
printf '%s\n' "$out"
