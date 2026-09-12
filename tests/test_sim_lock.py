"""A second sim for the same season/week must refuse while the first holds the lock."""
import threading

import pytest

from nfl_edge.rebuild import sim_lock


def test_second_sim_lock_refuses(tmp_path):
    with (
        sim_lock(2026, 1, root=tmp_path),
        pytest.raises(RuntimeError, match="sim already running for 2026 week 1"),
        sim_lock(2026, 1, root=tmp_path),
    ):
        pass


def test_lock_releases_so_a_later_sim_can_start(tmp_path):
    with sim_lock(2026, 1, root=tmp_path):
        pass
    with sim_lock(2026, 1, root=tmp_path):
        pass


def test_other_week_is_not_blocked(tmp_path):
    with sim_lock(2026, 1, root=tmp_path), sim_lock(2026, 2, root=tmp_path):
        pass


def test_held_lock_blocks_a_second_thread(tmp_path):
    held = threading.Event()
    release = threading.Event()
    second_error: list[BaseException] = []

    def holder():
        with sim_lock(2026, 1, root=tmp_path):
            held.set()
            release.wait(timeout=2)

    t = threading.Thread(target=holder)
    t.start()
    assert held.wait(timeout=2)
    try:
        with sim_lock(2026, 1, root=tmp_path):
            pass
    except RuntimeError as e:
        second_error.append(e)
    finally:
        release.set()
        t.join(timeout=2)
    assert second_error
    assert "already running" in str(second_error[0])
