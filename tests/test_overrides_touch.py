from nfl_edge.ingest.overrides import should_touch_override


def test_should_touch_override_only_on_status_change():
    assert should_touch_override("questionable", "out") is True
    assert should_touch_override("out", "out") is False
    assert should_touch_override("doubtful", "DOUBTFUL") is False
    assert should_touch_override(None, "out") is True
    assert should_touch_override("out", None) is True
