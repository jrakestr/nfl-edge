from nfl_edge.research import chalk as C


def row(week, pid, own, fpts, salary=8000, name="P", pos="RB"):
    return C.ChalkRow(week=week, player_id=pid, name=name, position=pos, salary=salary, own=own, fpts=fpts)


ROWS = [
    row(2, "bijan", 0.44, 11.1, 8200, "Bijan Robinson"),   # bust 1.35
    row(3, "bijan", 0.10, 30.0, 8500, "Bijan Robinson"),   # not chalk, ignored
    row(6, "bijan", 0.27, 7.3, 8700, "Bijan Robinson"),    # bust 0.84
    row(1, "gibbs", 0.43, 37.6, 8000, "Jahmyr Gibbs"),     # paid
    row(3, "gibbs", 0.63, 41.4, 8800, "Jahmyr Gibbs"),     # paid
    row(5, "gibbs", 0.30, 40.7, 9800, "Jahmyr Gibbs"),     # paid
    row(4, "chase", 0.19, 5.7, 8100, "Ja'Marr Chase"),     # one bust only
    row(7, "bijan", 0.30, 1.0, 8700, "Bijan Robinson"),    # future week, must not leak
]


def test_history_before_is_as_of_and_counts_only_chalk_weeks():
    h = C.history_before(ROWS, week=7)
    assert h["bijan"].chalk_weeks == (2, 6)
    assert h["bijan"].busts == 2
    assert h["bijan"].pts_per_k == (1.35, 0.84)
    assert h["gibbs"].busts == 0
    assert h["chase"].busts == 1
    assert C.history_before(ROWS, week=3)["bijan"].chalk_weeks == (2,)
    assert "bijan" not in C.history_before(ROWS, week=2)


def test_chalk_reason_needs_projected_chalk_and_two_busts():
    h = C.history_before(ROWS, week=7)
    r = C.chalk_reason(0.31, h["bijan"])
    assert r == "CHALK field 31%: busted 2 of 2 chalk weeks (wk 2,6: 1.4/0.8 pts/$k)"
    assert C.chalk_reason(0.10, h["bijan"]) is None      # not projected chalk this week
    assert C.chalk_reason(0.31, h["gibbs"]) is None      # chalk that pays
    assert C.chalk_reason(0.31, h["chase"]) is None      # one bust is not a pattern
    assert C.chalk_reason(0.31, None) is None            # never chalk before
    assert C.chalk_reason(None, h["bijan"]) is None


def test_pts_per_k_and_bust_handle_missing_points():
    assert row(1, "x", 0.2, None).bust is None
    assert row(1, "x", 0.2, 20.0, 8000).pts_per_k == 2.5
    assert row(1, "x", 0.2, 20.0, 8000).bust is False
