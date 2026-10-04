"""Spec for benchmark/own_compare.py: RTS Own vs our projected Own%, comparison only."""
from __future__ import annotations

import re
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import own_compare as OC
from nfl_edge.ingest import names as N

ROOT = Path(__file__).resolve().parents[1]

CATALOG = pl.DataFrame({
    "gsis_id": ["00-1", "00-2", "00-3", "00-4", "00-5"],
    "display_name": ["Alpha Back", "Bravo Back", "Charlie Wide", "Delta Wide", "Echo Quarter"],
    "merge_name": ["alpha back", "bravo back", "charlie wide", "delta wide", "echo quarter"],
    "latest_team": ["MIN", "MIN", "CIN", "CIN", "BUF"],
    "position": ["RB", "RB", "WR", "WR", "QB"],
})


def _rts(rows):
    return [{"player": p, "team": t, "position": pos, "own": o} for p, t, pos, o in rows]


def _ours(rows):
    return [{"Name": p, "Team": t, "Position": pos, "Own%": o} for p, t, pos, o in rows]


def _cmp(rts, ours, n=2):
    return OC.compare(_rts(rts), _ours(ours), CATALOG, {}, N.load_teams(), top_n=n)


def test_parse_rts_own_skips_blank_own(tmp_path):
    p = tmp_path / "rts.csv"
    p.write_text(
        '"RTS ID","player","team","position","Own","rushAtts"\n'
        '"1","Alpha Back","MIN","RB","12.5","0"\n'
        '"2","Some Kicker","BAL","K","","0"\n'
        '"3","Bravo Back","MIN","RB","0.00","0"\n'
    )
    rows = OC.parse_rts_own(p)
    assert [(r["player"], r["own"]) for r in rows] == [("Alpha Back", 12.5), ("Bravo Back", 0.0)]


def test_parse_rts_own_fails_closed_on_missing_column(tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text('"player","team"\n"A","MIN"\n')
    with pytest.raises(ValueError, match="Own"):
        OC.parse_rts_own(p)


def test_perfect_and_reversed_rank_agreement():
    rts = [("Alpha Back", "MIN", "RB", 30.0), ("Bravo Back", "MIN", "RB", 10.0),
           ("Charlie Wide", "CIN", "WR", 20.0), ("Delta Wide", "CIN", "WR", 5.0)]
    same = [(p, t, pos, o * 2) for p, t, pos, o in rts]
    assert _cmp(rts, same)["spearman"] == pytest.approx(1.0)
    rev = [(p, t, pos, 100 - o) for p, t, pos, o in rts]
    assert _cmp(rts, rev)["spearman"] == pytest.approx(-1.0)


def test_position_sums_and_counts():
    rts = [("Alpha Back", "MIN", "RB", 30.0), ("Bravo Back", "MIN", "RB", 10.0),
           ("Echo Quarter", "BUF", "QB", 12.0)]
    ours = [("Alpha Back", "MIN", "RB", 25.0), ("Bravo Back", "MIN", "RB", 15.0),
            ("Echo Quarter", "BUF", "QB", 100.0)]
    r = _cmp(rts, ours)
    assert r["by_position"]["RB"] == {"n": 2, "rts": 40.0, "ours": 40.0}
    assert r["by_position"]["QB"] == {"n": 1, "rts": 12.0, "ours": 100.0}
    assert r["joined"] == 3


def test_top_n_overlap_and_misses():
    rts = [("Alpha Back", "MIN", "RB", 40.0), ("Bravo Back", "MIN", "RB", 0.0),
           ("Charlie Wide", "CIN", "WR", 20.0), ("Delta Wide", "CIN", "WR", 1.0)]
    ours = [("Alpha Back", "MIN", "RB", 5.0), ("Bravo Back", "MIN", "RB", 30.0),
            ("Charlie Wide", "CIN", "WR", 25.0), ("Delta Wide", "CIN", "WR", 2.0)]
    r = _cmp(rts, ours, n=2)
    assert r["top_n"] == 2
    assert r["top_overlap"] == 1  # Charlie in both top-2 lists; Alpha vs Bravo differ
    assert r["ours_too_high"][0]["name"] == "Bravo Back"
    assert r["ours_too_low"][0]["name"] == "Alpha Back"


def test_unmatched_are_listed_not_guessed_and_ours_only_not_joined():
    rts = [("Alpha Back", "MIN", "RB", 30.0), ("Mystery Man", "MIN", "RB", 9.0)]
    ours = [("Alpha Back", "MIN", "RB", 30.0), ("Delta Wide", "CIN", "WR", 4.0)]
    r = _cmp(rts, ours)
    assert r["joined"] == 1
    assert [u["name"] for u in r["rts_unmatched"]] == ["Mystery Man"]
    assert r["ours_only"] == 1  # Delta Wide has no RTS row; not scored as RTS zero


def test_dfs_pipeline_never_reads_rts_or_benchmarks():
    """RTS is comparison only: the dfs run must not import benchmark or read RTS files."""
    for rel in ("src/nfl_edge/outputs/dfs_export.py", "src/nfl_edge/dfs/pipeline.py",
                "src/nfl_edge/dfs/run_sim.py", "src/nfl_edge/dfs/parse.py"):
        text = (ROOT / rel).read_text()
        assert "benchmark" not in text.lower(), rel
        assert "own_compare" not in text, rel
        assert not re.search(r"\brts\b|rts_|market_share", text, re.IGNORECASE), rel
