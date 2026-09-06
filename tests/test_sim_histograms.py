"""20-bin histograms embedded in proj_players.stat_summary (display-only; props use parquet)."""
import numpy as np

from nfl_edge.sim import slate


def test_summarize_histogram_has_20_bins_and_counts_sum_to_n():
    rng = np.random.default_rng(7)
    arr = rng.normal(250, 40, size=2000)
    s = slate._summarize("pass_yds", arr)
    hist = s["hist"]
    assert len(hist["counts"]) == 20
    assert len(hist["bins"]) == 21
    assert sum(hist["counts"]) == 2000
    assert hist["bins"][0] <= hist["bins"][-1]
    assert all(hist["bins"][i] <= hist["bins"][i + 1] for i in range(20))


def test_summarize_constant_draw_still_has_20_bins():
    arr = np.full(500, 3.0)
    s = slate._summarize("rec", arr)
    assert s["mean"] == 3.0
    assert s["sd"] == 0.0
    assert len(s["hist"]["counts"]) == 20
    assert sum(s["hist"]["counts"]) == 500
