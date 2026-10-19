from decimal import Decimal as D

import pytest

from nfl_edge.ingest import dk_contests as dk

HEAD = "Rank,EntryId,EntryName,TimeRemaining,Points,Lineup,,Player,Roster Position,%Drafted,FPTS"
LINEUP = ("DST Chiefs  FLEX Tre Tucker QB Jameis Winston RB Kenneth Walker III RB Jonathan Taylor "
          "TE Isaiah Likely WR Malik Nabers WR Carnell Tate WR Omar Cooper Jr.")


def _csv(*rows: str, head: str = HEAD) -> str:
    return "\ufeff" + "\n".join([head, *rows]) + "\n"


def test_parse_lineup_splits_nine_slots_and_double_space():
    out = dk.parse_lineup(LINEUP)
    assert [s for s, _ in out] == ["DST", "FLEX", "QB", "RB", "RB", "TE", "WR", "WR", "WR"]
    assert out[0] == ("DST", "Chiefs")
    assert out[8] == ("WR", "Omar Cooper Jr.")


def test_entry_with_blank_lineup_is_a_named_miss():
    assert dk.parse_lineup("") == []
    e = {"entry_id": 1, "points": D(0), "lineup": ""}
    assert dk.entry_slots(e, FPTS, {}) == {"miss": "empty lineup"}


def test_parse_standings_reads_both_tables_and_strips_dst_space():
    text = _csv(
        f"1,10,AceBoogie504,0,202.87999,{LINEUP},,Puka Nacua,WR,37.27%,14",
        ",,,,,,,Puka Nacua,FLEX,5.05%,14",
        ",,,,,,,Panthers ,DST,33.84%,4",
    )
    st = dk.parse_standings(text)
    assert len(st.entries) == 1
    assert st.entries[0]["rank"] == 1 and st.entries[0]["points"] == D("202.87999")
    keys = {(p["player_name"], p["roster_position"]) for p in st.players}
    assert keys == {("Puka Nacua", "WR"), ("Puka Nacua", "FLEX"), ("Panthers", "DST")}
    wr = next(p for p in st.players if p["roster_position"] == "WR")
    assert wr["pct_drafted"] == D("0.372700")


def test_parse_standings_stops_on_unknown_header():
    with pytest.raises(dk.DkFileError, match="unknown standings header"):
        dk.parse_standings(_csv("1,2,x,0,1,QB A,,A,QB,1%,1", head="Rank,EntryId,Points"))


def test_parse_standings_rejects_repeated_player_slot():
    text = _csv(f"1,10,a,0,1,{LINEUP},,A,QB,1%,1", ",,,,,,,A,QB,2%,1")
    with pytest.raises(dk.DkFileError, match="repeats"):
        dk.parse_standings(text)


def _entries(points: list[float], lineup: str = "QB A") -> list[dict]:
    return [{"rank": i + 1, "entry_id": i + 1, "entry_name": None, "points": D(str(p)),
             "lineup": lineup} for i, p in enumerate(points)]


def test_top1_line_uses_floor_rank():
    entries = _entries([300 - i for i in range(237 * 100 + 81)])  # 23,781 entries
    rank, score = dk.top1_line(entries)
    assert rank == 237 and score == D(300 - 236)


def test_cash_line_is_last_rank_inside_paid_and_ties_past_it_do_not_cash():
    entries = _entries([10, 9, 8, 7, 7, 6])
    entries[4]["rank"] = 4  # tie ranked past the paid count would be 4 vs 5; rank field decides
    assert dk.cash_line(entries, 4) == D(7)
    assert dk.cash_line(entries, 3) == D(8)
    assert dk.cash_line(entries, None) is None


def test_player_top1_rates_count_slot_share_of_top_entries():
    entries = [
        {"rank": 1, "entry_id": 1, "points": D(20), "lineup": "QB A WR B FLEX C"},
        {"rank": 2, "entry_id": 2, "points": D(19), "lineup": "QB A WR C FLEX B"},
        {"rank": 3, "entry_id": 3, "points": D(5), "lineup": "QB Z WR B FLEX C"},
    ]
    rates = dk.player_top1_rates(entries, D(19))
    assert rates[("A", "QB")] == D(1)
    assert rates[("B", "WR")] == D("0.5")
    assert rates[("B", "FLEX")] == D("0.5")
    assert ("Z", "QB") not in rates


FPTS = {"Chiefs": D(4), "A": D("10.5"), "B": D("5.5")}


def test_entry_slots_sum_to_points():
    e = {"entry_id": 1, "points": D("20.00001"), "lineup": "DST Chiefs QB A WR B"}
    out = dk.entry_slots(e, FPTS, {"Chiefs": "DST", "A": "QB", "B": "WR"})
    assert [r["player_name"] for r in out["slots"]] == ["Chiefs", "A", "B"]
    assert sum(r["fpts"] for r in out["slots"]) == D("20.0")
    assert out["slots"][0]["position"] == "DST"


def test_entry_slots_names_the_missing_player():
    e = {"entry_id": 1, "points": D(20), "lineup": "QB A WR Ghost"}
    out = dk.entry_slots(e, FPTS, {})
    assert "slots" not in out and "Ghost" in out["miss"]


def test_entry_slots_rejects_sum_mismatch():
    e = {"entry_id": 1, "points": D(25), "lineup": "QB A WR B"}
    assert "does not match" in dk.entry_slots(e, FPTS, {})["miss"]


def test_resolve_slate_prefers_smallest_covering_slate():
    names = {f"p{i}" for i in range(100)}
    slates = {
        "full": names | {"x"},
        "main": names | {"y"},
        "early": {f"p{i}" for i in range(60)},
        "turbo": names,
    }
    assert dk.resolve_slate_id(names, slates) == "turbo"
    assert dk.resolve_slate_id(names | {"q"}, {"early": slates["early"]}) is None


def test_contest_key_from_filename_handles_browser_copy_suffix():
    assert dk.contest_key_from_name("/x/contest-standings-196672011 (1).zip") == 196672011
    with pytest.raises(dk.DkFileError):
        dk.contest_key_from_name("standings.zip")


HIST_HEAD = ('"Sport","Game_Type","Entry_Key","Entry","Contest_Key","Contest_Date_EST","Place","Points",'
             '"Winnings_Non_Ticket","Winnings_Ticket","Contest_Entries","Entry_Fee","Prize_Pool","Places_Paid"')


def test_parse_history_money_and_cash_fields():
    row = ('"NFL","Classic",5301804977,"NFL $6K Play-Action [20 Entry Max] (1/20)",196743678,'
           '"2026-10-18 16:05:00",5,177.12,"$58.33","$0.00",2378,"$3.00","$6,000.00",618')
    (r,) = dk.parse_history(HIST_HEAD + "\n" + row + "\n")
    assert r["entry_key"] == 5301804977 and r["place"] == 5 and r["places_paid"] == 618
    assert r["winnings_cash"] == D("58.33") and r["prize_pool"] == D("6000.00")
    assert r["contest_time"].utcoffset() is not None


def test_parse_history_stops_on_unknown_header():
    with pytest.raises(dk.DkFileError):
        dk.parse_history('"A","B"\n1,2\n')
