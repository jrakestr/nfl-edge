"""Spec for nfl_edge.workflow: phase registry, run rows, chains, sim cleanup. No database."""
from __future__ import annotations

from datetime import datetime

import pytest

from nfl_edge import workflow as W


class FakeRunner:
    """Records nfl-edge argv; fails any call whose argv starts with a prefix in `fail`."""

    def __init__(self, fail: tuple[tuple[str, ...], ...] = (), out: str = "ok"):
        self.calls: list[list[str]] = []
        self.fail = fail
        self.out = out

    def __call__(self, args: list[str]) -> str:
        self.calls.append(list(args))
        for prefix in self.fail:
            if tuple(args[: len(prefix)]) == prefix:
                raise W.StepFailed(args, f"{' '.join(prefix)} failed: boom")
        return self.out


class FakeRecorder:
    def __init__(self):
        self.rows: list[dict] = []

    def start(self, phase: str, ctx: W.Context) -> int:
        self.rows.append({"phase": phase, "slate": ctx.slate, "status": "running",
                          "settings": ctx.settings()})
        return len(self.rows)

    def finish(self, row_id: int, status: str, message: str, run_id: str | None = None) -> None:
        self.rows[row_id - 1].update(status=status, message=message, run_id=run_id)


@pytest.fixture
def slates(monkeypatch, tmp_path):
    files = {}
    for name, rows in (("main", 3), ("full", 9), ("showdown", 2)):
        p = tmp_path / f"DKSalaries_2026_wk07_{name}.csv"
        p.write_text("h\n" + "r\n" * rows)
        files[name] = p
    monkeypatch.setattr(W.dk, "week_dk_csvs",
                        lambda s, w: [(k, v, 0.0) for k, v in sorted(files.items())])
    monkeypatch.setattr(W, "DATA_DIR", tmp_path)
    return files


def args_of(steps: list[W.Step]) -> list[list[str]]:
    return [list(s.args) for s in steps if s.args]


def test_phase_order():
    assert W.PHASES == ("ingest", "salaries", "sim", "lines", "props", "dfs", "grade")


def test_ingest_plan():
    assert args_of(W.plan("ingest", W.Context(2026, 7))) == [
        ["ingest", "--season", "2026", "--week", "7"]]


def test_salaries_plan_every_slate_then_status_from_full(slates):
    steps = W.plan("salaries", W.Context(2026, 7))
    got = args_of(steps)
    assert got[:3] == [
        ["dk-salaries", "--season", "2026", "--week", "7", "--slate", s, "--salaries-only"]
        for s in ("full", "main", "showdown")]
    assert got[3] == ["dk-salaries", "--season", "2026", "--week", "7", "--merge-status",
                      "--status-from", "full"]
    fp = [s for s in steps if s.args and s.args[:2] == ("ingest", "fantasypros-status")]
    assert fp and fp[0].soft


def test_salaries_status_from_widest_without_full(slates):
    slates.pop("full").unlink()
    got = args_of(W.plan("salaries", W.Context(2026, 7)))
    assert got[2][-2:] == ["--status-from", "main"]


def test_salaries_overrides_csv_when_present(slates, tmp_path):
    (tmp_path / "overrides").mkdir()
    csv = tmp_path / "overrides" / "2026_wk07.csv"
    csv.write_text("player,status\n")
    got = args_of(W.plan("salaries", W.Context(2026, 7)))
    assert ["overrides", "--season", "2026", "--week", "7", "--file", str(csv)] in got


def test_salaries_without_files_fails_with_a_reason(monkeypatch):
    monkeypatch.setattr(W.dk, "week_dk_csvs", lambda s, w: [])
    with pytest.raises(W.PhaseFailed, match="dk-fetch --week 7"):
        W.plan("salaries", W.Context(2026, 7))


def test_lines_plan_pulls_odds_softly_then_lines():
    steps = W.plan("lines", W.Context(2026, 7))
    assert steps[0].args[:2] == ("ingest", "odds-api") and steps[0].soft
    assert list(steps[-1].args) == ["lines", "--season", "2026", "--week", "7"]
    assert not steps[-1].soft


def test_props_plan_adds_csv_when_present(tmp_path, monkeypatch):
    monkeypatch.setattr(W, "DATA_DIR", tmp_path)
    assert args_of(W.plan("props", W.Context(2026, 7))) == [
        ["props", "--season", "2026", "--week", "7"]]
    (tmp_path / "props").mkdir()
    f = tmp_path / "props" / "props_2026_wk07.csv"
    f.write_text("x\n")
    assert args_of(W.plan("props", W.Context(2026, 7)))[0][-2:] == ["--file", str(f)]


def test_dfs_plan_one_slate_with_overrides():
    # The slate's salary rows load first, so an uploaded file can go straight to DFS.
    load = ["dk-salaries", "--season", "2026", "--week", "7", "--slate", "main", "--salaries-only"]
    base = ["dfs", "--season", "2026", "--week", "7", "--site", "dk", "--slate", "main"]
    assert args_of(W.plan("dfs", W.Context(2026, 7, slate="main"))) == [load, base]
    ctx = W.Context(2026, 7, slate="main", field_size=8000, iterations=1200, full_field=True)
    assert args_of(W.plan("dfs", ctx)) == [
        load, base + ["--iterations", "1200", "--field-size", "8000", "--full-field"]]
    with pytest.raises(W.PhaseFailed, match="slate"):
        W.plan("dfs", W.Context(2026, 7))


def test_grade_plan_stops_on_missing_finals():
    got = args_of(W.plan("grade", W.Context(2026, 7)))
    assert got[0] == ["ingest", "--season", "2026", "--week", "7"]
    assert got[-2] == ["missing-finals", "--season", "2026", "--week", "7"]
    assert got[-1] == ["grade", "--season", "2026", "--week", "7"]


def test_chain_from_sim_expands_dfs_per_slate_and_skips_grade():
    assert W.chain("sim", ["main", "full"]) == [
        ("sim", None), ("lines", None), ("props", None), ("dfs", "main"), ("dfs", "full")]
    assert W.chain("dfs", ["main"]) == [("dfs", "main")]
    assert W.chain("grade", ["main"]) == [("grade", None)]
    assert W.chain("ingest", [])[:3] == [("ingest", None), ("salaries", None), ("sim", None)]


def test_run_phase_writes_start_then_success():
    rec, run = FakeRecorder(), FakeRunner(out="lines 2026 wk7: 16 verdicts")
    W.run_phase("lines", W.Context(2026, 7), runner=run, recorder=rec)
    assert [r["status"] for r in rec.rows] == ["success"]
    assert rec.rows[0]["message"] == "lines 2026 wk7: 16 verdicts"
    assert run.calls[-1][0] == "lines"


def test_run_phase_soft_step_failure_continues():
    rec, run = FakeRecorder(), FakeRunner(fail=(("ingest", "odds-api"),))
    W.run_phase("lines", W.Context(2026, 7), runner=run, recorder=rec)
    assert rec.rows[0]["status"] == "success"
    assert run.calls[-1][0] == "lines"


def test_run_phase_hard_failure_records_failed_and_raises():
    rec, run = FakeRecorder(), FakeRunner(fail=(("lines",),))
    with pytest.raises(W.PhaseFailed, match="boom"):
        W.run_phase("lines", W.Context(2026, 7), runner=run, recorder=rec)
    assert rec.rows[0]["status"] == "failed"
    assert "boom" in rec.rows[0]["message"]


def test_settings_carry_the_run_knobs():
    ctx = W.Context(2026, 7, slate="main", draws=5000, field_size=8000, iterations=900)
    assert ctx.settings() == {"draws": 5000, "field_size": 8000, "iterations": 900,
                              "full_field": False}


@pytest.fixture
def sim_db(monkeypatch):
    state = {"dropped": [], "newest": ("rid", 16, 16), "slate": 16}
    monkeypatch.setattr(W.rebuild, "newest_run", lambda s, w: state["newest"])
    monkeypatch.setattr(W.rebuild, "slate_games", lambda s, w: state["slate"])
    monkeypatch.setattr(W.rebuild, "drop_incomplete",
                        lambda s, w, after: state["dropped"].append(after) or 1)
    return state


def test_sim_phase_records_run_id_when_complete(sim_db):
    rec, run = FakeRecorder(), FakeRunner()
    W.run_phase("sim", W.Context(2026, 7, draws=20000), runner=run, recorder=rec)
    assert run.calls == [["sim", "--season", "2026", "--week", "7", "--draws", "20000",
                          "--note", "workflow"]]
    assert rec.rows[0]["status"] == "success" and rec.rows[0]["run_id"] == "rid"
    assert sim_db["dropped"] == []


def test_sim_phase_drops_incomplete_when_sim_fails(sim_db):
    rec, run = FakeRecorder(), FakeRunner(fail=(("sim",),))
    with pytest.raises(W.PhaseFailed):
        W.run_phase("sim", W.Context(2026, 7), runner=run, recorder=rec)
    assert len(sim_db["dropped"]) == 1 and isinstance(sim_db["dropped"][0], datetime)
    assert rec.rows[0]["status"] == "failed"


def test_sim_phase_drops_incomplete_when_counts_short(sim_db):
    sim_db["newest"] = ("rid", 15, 15)
    rec, run = FakeRecorder(), FakeRunner()
    with pytest.raises(W.PhaseFailed, match="15 of 16 games"):
        W.run_phase("sim", W.Context(2026, 7), runner=run, recorder=rec)
    assert len(sim_db["dropped"]) == 1


def test_sim_phase_leaves_another_running_sim_alone(sim_db):
    class Locked(FakeRunner):
        def __call__(self, args):
            raise W.StepFailed(args, "sim for 2026 week 7 already running (lock held)")

    with pytest.raises(W.PhaseFailed, match="another sim for week 7 is running"):
        W.run_phase("sim", W.Context(2026, 7), runner=Locked(), recorder=FakeRecorder())
    assert sim_db["dropped"] == []


@pytest.mark.db
def test_sql_recorder_writes_start_and_finish(monkeypatch):
    from nfl_edge.db import read_sql

    monkeypatch.setenv("GITHUB_RUN_ID", "123")
    monkeypatch.setenv("GITHUB_REPOSITORY", "o/r")
    rec = W.SqlRecorder()
    ctx = W.Context(1999, 1, slate="main", draws=10)
    row = rec.start("dfs", ctx)
    rec.finish(row, "success", "done", None)
    got = read_sql("select phase, slate, status, settings, gh_run_url, host, finished_at "
                   "from ops.workflow_runs where id = %s", (row,)).to_dicts()[0]
    read_sql("delete from ops.workflow_runs where id = %s returning id", (row,))
    assert got["phase"] == "dfs" and got["slate"] == "main" and got["status"] == "success"
    assert got["gh_run_url"] == "https://github.com/o/r/actions/runs/123"
    assert got["host"] == "github" and got["finished_at"] is not None


def test_refresh_order_and_never_sims():
    steps = W.plan("refresh", W.Context(2026, 7))
    run = FakeRunner(out="")
    W.run_phase("refresh", W.Context(2026, 7), runner=run, recorder=FakeRecorder())
    heads = [c[:2] for c in run.calls]
    assert heads == [["ingest", "odds-api"], ["ingest", "--season"], ["stale-weeks", "--season"],
                     ["ingest", "fantasypros-status"], ["dk-fetch", "--season"],
                     ["ingest", "espn-league"],
                     ["ingest", "live"], ["actuals", "--season"],
                     ["ungraded-completed", "--season"], ["change-check", "--season"]]
    assert not any(c[0] == "sim" for c in run.calls)
    assert all(s.soft for s in steps if s.args and s.args[0] == "ingest")
    espn = [c for c in run.calls if c[:2] == ["ingest", "espn-league"]]
    assert espn == [["ingest", "espn-league", "--season", "2026"]]


def test_refresh_lines_each_stale_week_and_grades_finished_ones():
    class Weeks(FakeRunner):
        def __call__(self, args):
            self.calls.append(list(args))
            if args[0] == "stale-weeks":
                return "6\n7\n"
            if args[0] == "ungraded-completed":
                return "5\n6\n"
            if args[0] == "missing-finals" and args[-1] == "6":
                raise W.StepFailed(args, "2026_06_KC_LV")
            return ""

    run = Weeks()
    W.run_phase("refresh", W.Context(2026, 7), runner=run, recorder=FakeRecorder())
    assert ["lines", "--season", "2026", "--week", "6"] in run.calls
    assert ["lines", "--season", "2026", "--week", "7"] in run.calls
    assert ["grade", "--season", "2026", "--week", "5"] in run.calls
    assert ["grade", "--season", "2026", "--week", "6"] not in run.calls
    assert run.calls[-1][0] == "change-check"
