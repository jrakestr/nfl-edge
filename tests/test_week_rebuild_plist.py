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
    assert "sun-inactives: sim failed, Saturday run left intact" in text
    fail_at = text.index("sun-inactives: sim failed, Saturday run left intact")
    assert "keep_saturday" in text
    assert text.index('"$sim_code" -eq 124') < fail_at
    assert "keep_saturday" not in text[fail_at : fail_at + 200]
    assert "n_player_games" in text
    assert "DKSalaries_${SEASON}_wk${WW}_" in text
    assert "--salaries-only" in text
    assert "--merge-status" in text
    assert "--slate main" not in text
    assert "--slate full" not in text
    assert "current-week" in text


def test_script_reapplies_overrides_after_dk_salaries_before_sim():
    text = SH.read_text()
    merge = text.index("--merge-status")
    ov = text.index('"$NFL" overrides')
    sim = text.index('"$NFL" sim')
    assert merge < ov < sim
    assert "data/overrides/" in text[merge:ov]


def test_odds_api_pull_is_before_lines():
    text = SH.read_text()
    pull = text.index("ingest odds-api")
    lines = text.index('"$NFL" lines')
    assert "--markets h2h,spreads,totals" in text
    assert "--regions us" in text
    assert "--force" not in text
    assert pull < lines
    assert "recent duplicate" in text.lower() or "RecentDuplicate" in text
    assert "remaining=" in text
