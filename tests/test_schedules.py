import polars as pl
from nfl_edge.ingest import schedules


def test_fetch_2026_has_lines():
    df = schedules.fetch([2026])
    wk1 = df.filter(pl.col("week") == 1)
    assert wk1.height >= 16
    assert wk1["spread_line"].null_count() == 0
    assert wk1["total_line"].null_count() == 0
