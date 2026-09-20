"""RTS + second-source availability ingest. Pure decide/parse tests; no database."""
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.ingest import rts_status as R

FIX_RTS = Path(__file__).parent / "fixtures" / "rts_sample.csv"
FIX_SRC2 = Path(__file__).parent / "fixtures" / "src2_sample.csv"

CATALOG = pl.DataFrame({
    "gsis_id": ["00-TEST01", "00-TEST02", "00-TEST03", "00-TEST04", "00-TEST05",
                "00-TEST06", "00-TEST07", "00-TEST08", "00-TEST09", "00-TEST10",
                "00-TEST11"],
    "display_name": ["Test Back", "Test QB", "Test Wide", "Test Ram", "Near Zero",
                     "Two Source", "Star Back", "Protected Back", "DK Out Back",
                     "Out Guy", "Doubt Guy"],
    "merge_name": ["test back", "test qb", "test wide", "test ram", "near zero",
                   "two source", "star back", "protected back", "dk out back",
                   "out guy", "doubt guy"],
    "latest_team": ["DEN", "BUF", "WAS", "LA", "CAR", "DEN", "IND", "DEN", "DEN",
                    "DEN", "NYG"],
    "position": ["RB", "QB", "WR", "WR", "WR", "RB", "RB", "RB", "RB", "RB", "RB"],
})

TEAMS = {t: {"city": t, "nick": t} for t in
         ["DEN", "JAX", "BUF", "DET", "WAS", "DAL", "CAR", "ATL", "IND", "KC",
          "NYG", "LA", "SF", "MIA", "HOU", "CIN", "LAC", "LV", "NO", "BAL",
          "ARI", "SEA", "CLE", "TB", "GB", "NYJ", "MIN", "CHI", "PHI", "TEN",
          "PIT", "NE", "LAR"]}
WEEK = set(TEAMS) | {"LA"}


def _decide(rts=None, src2=None, ours=None, existing=None, mtime="MTIME"):
    return R.decide(
        rts if rts is not None else R.parse_rts_csv(FIX_RTS),
        src2 if src2 is not None else R.parse_src2_csv(FIX_SRC2),
        CATALOG, {}, TEAMS, WEEK, ours or {}, existing or {}, mtime,
    )


def test_parse_rts_csv_columns():
    rows = R.parse_rts_csv(FIX_RTS)
    by_name = {r["player"]: r for r in rows}
    assert by_name["Test Back"]["proj"] == pytest.approx(0.0)
    assert by_name["Test Back"]["salary"] == 5200
    assert by_name["Test Back"]["position"] == "RB"
    assert by_name["Test Back"]["team"] == "DEN"
    assert by_name["Star Back"]["proj"] == pytest.approx(21.4)


def test_parse_src2_csv_columns():
    rows = R.parse_src2_csv(FIX_SRC2)
    by_name = {r["player"]: r for r in rows}
    assert by_name["Two Source"]["proj"] == pytest.approx(1.3)
    assert by_name["Out Guy"]["status"] == "O"
    assert by_name["Doubt Guy"]["status"] == "D"


def test_rts_zero_out_and_qb_skip_and_unmatched():
    d = _decide(src2=[])
    ups = {u["player_id"]: u for u in d["upserts"]}
    assert ups["00-TEST01"]["status"] == "out"          # Test Back RB 0.00
    assert ups["00-TEST01"]["usage_multiplier"] == 0.0
    assert ups["00-TEST01"]["note"].startswith("rts 0 proj ")
    assert ups["00-TEST03"]["status"] == "out"          # WAS stays WAS
    assert "00-TEST02" not in ups                       # QB 0.00 is not an override
    assert any(q["player"] == "Test QB" for q in d["skipped_qb_zero"])
    reasons = {u["player"]: u["reason"] for u in d["unmatched"]}
    assert reasons["Ghost Player"] == "unmatched"


def test_team_alias_lar_matches_la():
    d = _decide(src2=[])
    ups = {u["player_id"]: u for u in d["upserts"]}
    assert ups["00-TEST04"]["status"] == "out"          # Test Ram listed as LAR
    assert ups["00-TEST04"]["note"].startswith("rts 0 proj ")


def test_rts_positive_does_not_clear_dk_out():
    existing = {"00-TEST07": {"status": "out", "note": "dk full OUT"}}
    d = _decide(src2=[], existing=existing)
    assert "00-TEST07" not in {u["player_id"] for u in d["upserts"]}
    assert "00-TEST07" not in {p["player_id"] for p in d["protected"]}


def test_manual_and_claims_rows_are_protected():
    existing = {
        "00-TEST08": {"status": "questionable", "note": "beat writer says active"},
        "00-TEST01": {"status": "out", "note": "promoted claim"},
    }
    d = _decide(src2=[], existing=existing)
    by_pid = {p["player_id"]: p for p in d["protected"]}
    assert by_pid["00-TEST08"]["would"] == "upsert"
    assert "00-TEST01" not in {u["player_id"] for u in d["upserts"]}
    assert "00-TEST01" not in {p["player_id"] for p in d["protected"]}  # already out


def test_dk_noted_rows_can_be_taken_over():
    existing = {"00-TEST09": {"status": "out", "note": "dk full IR"}}
    d = _decide(src2=[], existing=existing)
    ups = {u["player_id"]: u for u in d["upserts"]}
    assert ups["00-TEST09"]["note"].startswith("rts ")


def test_src2_status_letters_outrank_projections():
    rows = [
        {"player": "Out Guy", "team": "DEN", "position": "RB", "proj": 9.9,
         "status": "O"},
        {"player": "Doubt Guy", "team": "NYG", "position": "RB", "proj": 8.8,
         "status": "D"},
    ]
    d = _decide(rts=[], src2=rows)
    ups = {u["player_id"]: u for u in d["upserts"]}
    assert ups["00-TEST10"]["status"] == "out"
    assert ups["00-TEST11"]["status"] == "doubtful"
    assert ups["00-TEST11"]["usage_multiplier"] == 0.0


def test_two_source_low_pair_dampens_instead_of_zeroing():
    rows = [{"player": "Two Source", "team": "DEN", "position": "RB", "proj": 1.3,
             "status": None}]
    rts = [r for r in R.parse_rts_csv(FIX_RTS) if r["player"] == "Two Source"]
    assert rts and rts[0]["proj"] == pytest.approx(1.6)
    d = _decide(rts=rts, src2=rows, ours={"00-TEST06": 9.5})
    ups = {u["player_id"]: u for u in d["upserts"]}
    u = ups["00-TEST06"]
    assert u["status"] == "questionable"
    assert u["usage_multiplier"] == pytest.approx(1.45 / 9.5)
    assert u["note"].startswith("rts+src2 ")


def test_two_source_needs_both_below_ours_and_cap():
    rows = [{"player": "Two Source", "team": "DEN", "position": "RB", "proj": 1.3,
             "status": None}]
    rts = [r for r in R.parse_rts_csv(FIX_RTS) if r["player"] == "Two Source"]
    d = _decide(rts=rts, src2=rows, ours={"00-TEST06": 1.0})
    assert "00-TEST06" not in {u["player_id"] for u in d["upserts"]}


def test_near_zero_rts_only_is_listed_not_zeroed():
    d = _decide(src2=[])
    assert "00-TEST05" not in {u["player_id"] for u in d["upserts"]}
    assert any(n["player"] == "Near Zero" for n in d["near_zero"])


def test_dedup_keeps_max_proj():
    rows = [
        {"player": "Test Back", "team": "DEN", "position": "RB", "proj": 0.0,
         "salary": 5200, "opp": "JAX"},
        {"player": "Test Back", "team": "DEN", "position": "RB", "proj": 3.0,
         "salary": 5200, "opp": "JAX"},
    ]
    d = _decide(rts=rows, src2=[])
    assert "00-TEST01" not in {u["player_id"] for u in d["upserts"]}
