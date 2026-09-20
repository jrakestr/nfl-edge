from pathlib import Path

SH = Path(__file__).resolve().parents[1] / "ops" / "lines-only.sh"


def test_odds_api_pull_is_before_stale_weeks_lines():
    text = SH.read_text()
    pull = text.index("ingest odds-api")
    stale = text.index("stale-weeks")
    lines = text.index('"$NFL" lines')
    assert "--markets h2h,spreads,totals" in text
    assert "--regions us" in text
    assert "--force" not in text
    assert pull < stale < lines
    assert "recent duplicate" in text.lower() or "RecentDuplicate" in text
    assert "remaining=" in text
