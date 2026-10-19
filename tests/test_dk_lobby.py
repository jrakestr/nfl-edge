from datetime import date

import httpx

from nfl_edge.ingest import dk_lobby as L
from nfl_edge.ingest.dk_salaries import slate_type_for

HDR = "Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev,AvgPointsPerGame,Status\n"


def _csv(*infos: str) -> str:
    rows = [f"QB,P{i} ({i}),P{i},{i},QB,5000,{info},SF,10,\n" for i, info in enumerate(infos)]
    return "﻿" + HDR + "".join(rows)


def g(gid, ctype, suffix, start="2026-10-18T13:00:00", n=1):
    return L.Group(gid, ctype, suffix, start, n)


def test_slate_names():
    assert L.slate_name(g(1, 21, None)) == "main"
    assert L.slate_name(g(2, 21, " (Early)")) == "early"
    assert L.slate_name(g(3, 21, " (Mon-Thu)")) == "mon-thu"
    assert L.slate_name(g(4, 96, " (WAS @ SF)")) == "showdown-was-sf"
    assert L.slate_name(g(5, 108, " (2H WAS @ SF)")) is None      # quarters, snake, Madden: skipped
    names = L.assign_names([g(1, 21, None), g(6, 21, " (Sun-Mon)"), g(7, 21, " (Thu-Mon)")])
    assert names == {1: "main", 6: "sun-mon", 7: "full"}          # widest label becomes full


def test_named_showdowns_are_showdown_slates():
    assert slate_type_for("showdown") == "showdown"
    assert slate_type_for("showdown-was-sf") == "showdown"
    assert slate_type_for("full") == "classic"


def test_csv_games_and_week_window():
    n, games, dates = L.csv_games(_csv("WAS@SF 10/19/2026 08:15PM ET", "BUF@LV 10/18/2026 04:25PM ET"))
    assert n == 2 and games == ["BUF@LV", "WAS@SF"]
    assert L.in_week(dates, date(2026, 10, 15), date(2026, 10, 19))
    assert not L.in_week(dates + [date(2026, 10, 22)], date(2026, 10, 15), date(2026, 10, 19))


def test_fetch_writes_week_files_and_skips_cross_week(tmp_path, monkeypatch):
    monkeypatch.setattr(L, "DATA_DIR", tmp_path)
    monkeypatch.setattr(L, "week_window", lambda s, w: (date(2026, 10, 15), date(2026, 10, 19)))
    lobby = {"DraftGroups": [
        {"DraftGroupId": 10, "ContestTypeId": 21, "ContestStartTimeSuffix": None,
         "StartDateEst": "2026-10-18T13:00:00", "GameCount": 2},
        {"DraftGroupId": 11, "ContestTypeId": 96, "ContestStartTimeSuffix": " (WAS @ SF)",
         "StartDateEst": "2026-10-19T20:15:00", "GameCount": 1},
        {"DraftGroupId": 12, "ContestTypeId": 21, "ContestStartTimeSuffix": " (Mon-Thu)",
         "StartDateEst": "2026-10-19T20:15:00", "GameCount": 2},
        {"DraftGroupId": 13, "ContestTypeId": 21, "ContestStartTimeSuffix": None,
         "StartDateEst": "2026-10-25T13:00:00", "GameCount": 10},          # next week: not fetched
    ]}
    files = {
        "10": _csv("BUF@LV 10/18/2026 04:25PM ET", "NO@NYG 10/18/2026 01:00PM ET"),
        "11": _csv("WAS@SF 10/19/2026 08:15PM ET"),
        "12": _csv("WAS@SF 10/19/2026 08:15PM ET", "LAR@SEA 10/22/2026 08:15PM ET"),
    }
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        if "getcontests" in str(req.url):
            return httpx.Response(200, json=lobby)
        gid = req.url.params["draftGroupId"]
        seen.append(gid)
        return httpx.Response(200, text=files[gid])

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        got = {f.slate: f for f in L.fetch(2026, 6, client=c)}
    assert "13" not in seen
    assert got["main"].path.name == "DKSalaries_2026_wk06_main.csv" and got["main"].rows == 2
    assert got["showdown-was-sf"].path.is_file()
    assert got["mon-thu"].skipped and got["mon-thu"].path is None
    assert not (tmp_path / "dk" / "DKSalaries_2026_wk06_mon-thu.csv").exists()


def test_fetch_fails_closed_on_a_non_dk_file(tmp_path, monkeypatch):
    monkeypatch.setattr(L, "DATA_DIR", tmp_path)
    monkeypatch.setattr(L, "week_window", lambda s, w: (date(2026, 10, 15), date(2026, 10, 19)))
    lobby = {"DraftGroups": [{"DraftGroupId": 10, "ContestTypeId": 21, "ContestStartTimeSuffix": None,
                              "StartDateEst": "2026-10-18T13:00:00", "GameCount": 2}]}

    def handler(req):
        if "getcontests" in str(req.url):
            return httpx.Response(200, json=lobby)
        return httpx.Response(200, text="<html>please log in</html>")

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        (f,) = L.fetch(2026, 6, client=c)
    assert f.skipped and "header" in f.skipped and f.path is None
