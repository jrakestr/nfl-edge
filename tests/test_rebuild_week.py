from datetime import date

from nfl_edge.rebuild import completed_weeks_from_gamedays, week_from_gamedays

WEEK1 = [
    (1, date(2026, 9, 10)),  # Thursday
    (1, date(2026, 9, 13)),
    (1, date(2026, 9, 14)),  # Monday
    (2, date(2026, 9, 20)),
    (2, date(2026, 9, 21)),
]


def test_week_from_gamedays_saturday_before_sunday():
    rows = WEEK1
    assert week_from_gamedays(rows, date(2026, 9, 12)) == 1
    assert week_from_gamedays(rows, date(2026, 9, 13)) == 1
    assert week_from_gamedays(rows, date(2026, 9, 19)) == 2
    assert week_from_gamedays(rows, date(2026, 8, 1)) is None


def test_completed_weeks_monday_not_done_tuesday_is():
    assert completed_weeks_from_gamedays(WEEK1, date(2026, 9, 14)) == []
    assert completed_weeks_from_gamedays(WEEK1, date(2026, 9, 15)) == [1]
    assert completed_weeks_from_gamedays(WEEK1, date(2026, 9, 22)) == [1, 2]
