from pathlib import Path

PLIST = Path(__file__).resolve().parents[1] / "ops" / "com.nfl-edge.week-grade.plist"
SH = Path(__file__).resolve().parents[1] / "ops" / "week-grade.sh"


def test_plist_tuesday_0900_no_run_at_load():
    text = PLIST.read_text()
    assert "RunAtLoad" not in text
    assert "<integer>2</integer>" in text
    assert "<integer>9</integer>" in text
    assert "<integer>0</integer>" in text
    assert "week-grade.sh" in text
    assert "cron-grade.log" in text


def test_script_grades_ungraded_completed_and_names_missing_finals():
    text = SH.read_text()
    assert "completed-weeks" in text
    assert "ungraded-completed" in text
    assert "missing-finals" in text
    assert "env -u DATABASE_URL" in text
    assert "unreachable.sh" in text
    assert "grade refused" in text
    assert "benchmark nflgamesim" in text
    assert "--refresh-actuals" in text
    ingest = text.index('"$NFL" ingest')
    refresh = text.index("--refresh-actuals")
    missing = text.index("missing-finals")
    grade = text.index('"$NFL" grade')
    assert ingest < refresh < missing < grade
