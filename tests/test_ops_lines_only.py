"""ops/lines-only.sh must snapshot then refresh edges/verdicts for the live week."""

from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "ops" / "lines-only.sh"


def test_lines_only_runs_ingest_then_lines_for_week_1():
    text = SCRIPT.read_text()
    ingest_at = text.index("ingest --season 2026 --lines-only")
    lines_at = text.index("lines --season 2026 --week 1")
    assert ingest_at < lines_at
    assert "cron-lines.log" in text
    # ingest must not replace the shell; lines has to run in the same fire.
    assert "exec /usr/bin/env" not in text
    assert "exec nfl_edge" not in text
