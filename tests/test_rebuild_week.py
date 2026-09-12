from datetime import date

from nfl_edge.rebuild import week_from_gamedays


def test_week_from_gamedays_saturday_before_sunday():
    rows = [
        (1, date(2026, 9, 10)),  # Thursday
        (1, date(2026, 9, 13)),
        (1, date(2026, 9, 14)),
        (2, date(2026, 9, 20)),
        (2, date(2026, 9, 21)),
    ]
    assert week_from_gamedays(rows, date(2026, 9, 12)) == 1
    assert week_from_gamedays(rows, date(2026, 9, 13)) == 1
    assert week_from_gamedays(rows, date(2026, 9, 19)) == 2
    assert week_from_gamedays(rows, date(2026, 8, 1)) is None
