"""ops/unreachable.sh: one-line skip for the Friday cron failures (DB / github.com)."""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SH = ROOT / "ops" / "unreachable.sh"


def _check(text: str) -> bool:
    r = subprocess.run(
        ["bash", "-c", f'. "{SH}"; is_unreachable "$1"', "_", text],
        check=False,
    )
    return r.returncode == 0


def test_unreachable_database():
    assert _check("RuntimeError: could not connect using DATABASE_URL (OperationalError)")


def test_unreachable_github():
    assert _check("HTTPSConnectionPool(host='github.com', port=443): Max retries exceeded")


def test_real_python_error_is_not_skipped():
    assert not _check("ValueError: no REG games in raw.schedules")
