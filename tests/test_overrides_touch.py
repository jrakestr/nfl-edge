from nfl_edge.ingest.overrides import OVERRIDE_CONFLICT, should_touch_override


def test_conflict_sql_bumps_updated_at_only_on_status_change():
    sql = " ".join(OVERRIDE_CONFLICT.split())
    assert "when raw.player_overrides.status is distinct from excluded.status" in sql
    assert "then now() else raw.player_overrides.updated_at end" in sql


def test_should_touch_override_only_on_status_change():
    assert should_touch_override("questionable", "out") is True
    assert should_touch_override("out", "out") is False
    assert should_touch_override("doubtful", "DOUBTFUL") is False
    assert should_touch_override(None, "out") is True
    assert should_touch_override("out", None) is True
