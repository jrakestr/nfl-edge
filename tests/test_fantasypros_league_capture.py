"""FantasyPros weekly injury reports and weekly PPR points -> raw.fantasypros_snapshots. No network, no DB."""
import json
from datetime import UTC, datetime

import polars as pl
import pytest

from nfl_edge import db
from nfl_edge.ingest import fantasypros as fp
from nfl_edge.ingest import fantasypros_injury_reports as R
from nfl_edge.ingest import fantasypros_points as P
from nfl_edge.ingest import fantasypros_status as S
from nfl_edge.ingest import names as N

TEAMS = {t: {"city": t, "nick": t} for t in ["NE", "TB", "GB", "LA", "KC", "CIN"]}
CATALOG = pl.DataFrame({
    "gsis_id": ["00-AJ", "00-BM", "00-JC", "00-MP"],
    "display_name": ["A.J. Brown", "Baker Mayfield", "Ja'Marr Chase", "Micah Parsons"],
    "merge_name": ["aj brown", "baker mayfield", "jamarr chase", "micah parsons"],
    "latest_team": ["NE", "TB", "CIN", "GB"],
    "position": ["WR", "QB", "WR", "LB"],
})
FP_MAP = {"18218": "00-AJ"}
FETCHED = datetime(2026, 10, 6, 3, 0, tzinfo=UTC)


class Transport:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def __call__(self, path, params, key):
        self.calls.append((path, dict(params)))
        return self.responses.pop(0)


def inj(pid, name, team, pos, short="", **kw):
    return {"player_id": pid, "name": name, "team_id": team, "position_id": pos, "status_short": short,
            "status": short, "injury_update_date": None, "probability_of_playing": None,
            "practice_1": None, "practice_2": None, "practice_3": None, **kw}


def injuries_body():
    return {"sport": "NFL", "count": 4, "injuries": [
        inj(18218, "A.J. Brown", "NE", "WR", "IR", injury_update_date="2026-09-29 04:00:01"),
        inj(17237, "Baker Mayfield", "TB", "QB", "Q", practice_3="DNP", probability_of_playing="0.2"),
        inj(555, "Ja'Marr Chase", "CIN", "WR", "", practice_1="Limit", practice_3="DNP",
            probability_of_playing="1"),
        inj(19784, "Micah Parsons", "GB", "LB", "PUP"),
        inj(999, "Nobody Known", "KC", "RB", "O"),
    ]}


# ---- client ----------------------------------------------------------------------------------

def test_injuries_asks_for_practice_report_rows():
    t = Transport((200, injuries_body()))
    fp.Client(api_key="k", transport=t).injuries(2026, 4)
    assert t.calls == [("/nfl/injuries", {"year": 2026, "week": 4, "include_probabilities": "true"})]


def player_points_body(**kw):
    body = {"season": "2026", "scoring": "PPR", "players": [
        {"player_id": 18218, "player_name": "A.J. Brown", "position_id": "WR", "team_id": "NE",
         "games": 3, "points": 20.0, "average": 6.7, "weeks": {"1": 10.5, "2": 0, "3": 9.5, "4": 0}},
    ]}
    body.update(kw)
    return body


def test_player_points_path_params_and_one_call():
    t = Transport((200, player_points_body()))
    c = fp.Client(api_key="k", transport=t)
    c.player_points(2026, 1, 4)
    assert c.calls == 1
    assert t.calls == [("/nfl/2026/player-points",
                        {"scoring": "PPR", "start": 1, "end": 4, "position": "ALL", "min": "false"})]


@pytest.mark.parametrize("patch,match", [
    ({"season": "2025"}, "season 2025"),
    ({"scoring": "STD"}, "scoring STD"),
    ({"players": []}, "no players"),
])
def test_player_points_fails_closed(patch, match):
    c = fp.Client(api_key="k", transport=Transport((200, player_points_body(**patch))))
    with pytest.raises(fp.FantasyProsError, match=match):
        c.player_points(2026, 1, 4)


# ---- injury reports --------------------------------------------------------------------------

def report(body=None):
    return R.report_rows(body or injuries_body(), FP_MAP, CATALOG, {}, TEAMS)


def test_every_returned_row_is_kept_with_its_practice_fields():
    rows, unmatched = report()
    by = {r["name"]: r for r in rows}
    assert len(rows) == 5
    assert by["A.J. Brown"]["player_id"] == "00-AJ" and by["A.J. Brown"]["fp_id"] == "18218"
    chase = by["Ja'Marr Chase"]
    assert chase["player_id"] == "00-JC" and chase["payload"]["practice_3"] == "DNP"
    assert chase["payload"]["status_short"] == ""            # practice-only row: no status, still stored
    assert by["Micah Parsons"]["position"] == "LB"
    assert [u["name"] for u in unmatched] == ["Nobody Known"]  # skill position only; reported, not dropped
    assert by["Nobody Known"]["player_id"] is None


def test_snapshot_frame_is_injuries_endpoint_with_one_fetched_at_and_json_payload():
    from nfl_edge.benchmark import fantasypros as B
    rows, _ = report()
    df = B.to_snapshot_frame(rows, "injuries", 2026, 4, FETCHED, payload_key="payload")
    assert df["endpoint"].unique().to_list() == ["injuries"] and df["week"].unique().to_list() == [4]
    assert df["fetched_at"].unique().to_list() == [FETCHED]
    chase = json.loads(df.filter(pl.col("name") == "Ja'Marr Chase")["payload"][0])
    assert chase["practice_1"] == "Limit" and chase["probability_of_playing"] == "1"


@pytest.fixture
def inserted(monkeypatch):
    calls = []
    monkeypatch.setattr(db, "insert", lambda df, table: calls.append((table, df)) or df.height)
    for name in ("upsert", "replace_where", "replace_scope"):
        monkeypatch.setattr(db, name, lambda *a, _n=name, **k: pytest.fail(f"{_n} must not be used"))
    monkeypatch.setattr("nfl_edge.ingest.fantasypros_match.load_fp_map", lambda: FP_MAP)
    monkeypatch.setattr("nfl_edge.ingest.overrides.load_catalog", lambda: CATALOG)
    monkeypatch.setattr(N, "load_aliases", dict)
    monkeypatch.setattr(N, "load_teams", lambda: TEAMS)
    return calls


def test_injury_report_run_appends_only_and_never_touches_overrides(inserted, monkeypatch):
    monkeypatch.setattr("nfl_edge.ingest.overrides.write_overrides",
                        lambda *a, **k: pytest.fail("overrides must not be written"))
    c = fp.Client(api_key="k", transport=Transport((200, injuries_body())))
    r = R.run(2026, 4, client=c)
    assert [t for t, _ in inserted] == ["raw.fantasypros_snapshots"]
    assert r["calls"] == 1 and r["rows"] == 5 and r["matched"] == 4 and r["unmatched_n"] == 1
    assert inserted[0][1].height == 5


def test_injury_report_run_writes_nothing_when_the_api_fails(inserted):
    c = fp.Client(api_key="k", transport=Transport((403, {})))
    with pytest.raises(fp.FantasyProsError, match="403"):
        R.run(2026, 4, client=c)
    assert inserted == []


# ---- fantasypros-status also appends the body it already fetched -----------------------------

def test_status_ignores_practice_only_rows_without_calling_them_unknown():
    d = S.decide(injuries_body(), FP_MAP, CATALOG, {}, TEAMS, {"NE", "TB", "CIN", "GB", "KC"}, {}, FETCHED)
    assert d["unknown_statuses"] == [] and d["ignored"]["unknown_status"] == 0
    assert d["ignored"]["no_status"] == 1


def test_status_run_appends_the_snapshot_unless_dry_run(inserted, monkeypatch):
    monkeypatch.setattr(S, "_load", lambda s, w: (CATALOG, FP_MAP, {"NE", "TB", "CIN", "GB"}, {}))
    monkeypatch.setattr(S, "write_overrides", lambda df: df.height)
    c = fp.Client(api_key="k", transport=Transport((200, injuries_body()), (200, injuries_body())))
    S.run(2026, 4, dry_run=True, client=c)
    assert inserted == []
    r = S.run(2026, 4, client=c)
    assert [t for t, _ in inserted] == ["raw.fantasypros_snapshots"]
    assert r["snapshot_rows"] == 5 and c.calls == 2


# ---- player points ---------------------------------------------------------------------------

def points_body():
    return {"season": "2026", "scoring": "PPR", "players": [
        {"player_id": 18218, "player_name": "A.J. Brown", "position_id": "WR", "team_id": "NE",
         "games": 3, "points": 20.0, "average": 6.7, "weeks": {"1": 10.5, "2": 0, "3": 9.5, "4": 3.0, "5": 8.0}},
        {"player_id": 4242, "player_name": "Ja'Marr Chase", "position_id": "WR", "team_id": "CIN",
         "games": 4, "points": 60.0, "average": 15, "weeks": {"1": 3.2}},
        {"player_id": 1, "player_name": "Some Linebacker", "position_id": "LB", "team_id": "GB",
         "games": 4, "points": 0, "average": 0, "weeks": {"1": 0}},
    ]}


def test_points_rows_one_per_player_week_inside_the_range_offense_only():
    rows, unmatched = P.points_rows(points_body(), 1, 4, FP_MAP, CATALOG, {}, TEAMS)
    got = {(r["name"], r["week"]): r for r in rows}
    assert set(got) == {("A.J. Brown", 1), ("A.J. Brown", 2), ("A.J. Brown", 3), ("A.J. Brown", 4),
                        ("Ja'Marr Chase", 1)}                     # week 5 outside range; LB skipped
    assert got[("A.J. Brown", 2)]["payload"] == {"points": 0.0, "scoring": "PPR"}   # a zero is kept
    assert got[("A.J. Brown", 1)]["player_id"] == "00-AJ" and got[("A.J. Brown", 1)]["fp_id"] == "18218"
    assert got[("Ja'Marr Chase", 1)]["player_id"] == "00-JC"        # name match when the id is unmapped
    assert unmatched == []


def test_points_run_appends_one_frame_per_week_set_with_one_fetched_at(inserted):
    c = fp.Client(api_key="k", transport=Transport((200, points_body())))
    r = P.run(2026, 1, 4, client=c)
    assert r["calls"] == 1 and r["rows"] == 5
    tables = [t for t, _ in inserted]
    assert tables == ["raw.fantasypros_snapshots"]
    df = inserted[0][1]
    assert df["endpoint"].unique().to_list() == ["player_points"]
    assert sorted(df["week"].unique().to_list()) == [1, 2, 3, 4]
    assert df["fetched_at"].n_unique() == 1
    assert json.loads(df["payload"][0])["scoring"] == "PPR"


def test_points_run_rejects_a_bad_range_before_calling_the_api(inserted):
    c = fp.Client(api_key="k", transport=Transport())
    with pytest.raises(ValueError, match="start"):
        P.run(2026, 4, 1, client=c)
    assert c.calls == 0 and inserted == []
