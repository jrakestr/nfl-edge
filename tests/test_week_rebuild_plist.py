from pathlib import Path

PLIST = Path(__file__).resolve().parents[1] / "ops" / "com.nfl-edge.week-rebuild.plist"
SH = Path(__file__).resolve().parents[1] / "ops" / "week-rebuild.sh"


def test_plist_has_two_windows_and_no_run_at_load():
    text = PLIST.read_text()
    assert "RunAtLoad" not in text
    assert "<integer>20</integer>" in text
    assert "<integer>8</integer>" in text
    assert "<integer>40</integer>" in text
    assert "week-rebuild.sh" in text


def test_script_sunday_deadline_is_sim_only():
    text = SH.read_text()
    assert "08:50" in text
    assert "09:30" in text
    assert "sun-inactives: sim not complete by 08:50, Saturday run kept" in text
    assert "--slate main" in text
    assert "--slate full" in text
    assert "current-week" in text
