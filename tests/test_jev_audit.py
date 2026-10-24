"""Tests for Jev DFS Lineup Audit: as-of state builder, atomic questions, code composition,
typesafe-sdk client wrapper, lineup composition, forward grading, and zero-leakage into sim/priors.
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

from nfl_edge.research import audit_questions as Q
from nfl_edge.research import audit_state as S
from nfl_edge.research import jev_client as JC
from nfl_edge.research import lineup_audit as LA
from nfl_edge.results import jev_grade as JG

KICKOFF = datetime(2026, 10, 18, 17, 0, tzinfo=UTC)
TARGET = S.AuditPlayerTarget(
    player_id="00-0034855",
    name="Baker Mayfield",
    team="TB",
    position="QB",
    opponent="NO",
    game_id="2026_06_TB_NO",
    kickoff=KICKOFF,
    salary=6400,
    proj_dk_mean=19.8,
)


def test_audit_state_cuts_off_post_kickoff_news_and_injuries():
    news_rows = [
        {
            "news_id": 1,
            "player_id": "00-0034855",
            "created_at": datetime(2026, 10, 18, 14, 0, tzinfo=UTC),
            "title": "Pre-kickoff warmup report",
            "description": "Looks loose in warmups.",
            "impact": "Active and starting.",
            "categories": ["Injury"],
        },
        {
            "news_id": 2,
            "player_id": "00-0034855",
            "created_at": datetime(2026, 10, 18, 17, 5, tzinfo=UTC),  # 5 min AFTER kickoff
            "title": "Post-kickoff injury update",
            "description": "Left in 1st quarter.",
            "impact": "Out for game.",
            "categories": ["Injury"],
        },
    ]
    snapshots = [
        {
            "player_id": "00-0034855",
            "fetched_at": datetime(2026, 10, 17, 20, 0, tzinfo=UTC),
            "payload": {
                "status": "Questionable",
                "injury_type": "Right Thumb",
                "comment": "Expected to play",
                "practice_1": "LP",
                "practice_2": "FP",
                "practice_3": "FP",
                "probability_of_playing": "0.92",
                "injury_update_date": "2026-10-17 18:00:00",
            },
        },
        {
            "player_id": "00-0034855",
            "fetched_at": datetime(2026, 10, 18, 16, 0, tzinfo=UTC),
            "payload": {
                "status": "Out",
                "injury_type": "Right Thumb",
                "comment": "Post-game rétro update",
                "injury_update_date": "2026-10-18 21:00:00",  # update_date AFTER kickoff
            },
        },
    ]

    cutoff = S.effective_cutoff(KICKOFF)
    filtered_news = S.filter_player_news(news_rows, "00-0034855", cutoff)
    assert len(filtered_news) == 1
    assert filtered_news[0]["title"] == "Pre-kickoff warmup report"

    filtered_inj = S.filter_injury_row(snapshots, "00-0034855", cutoff)
    assert filtered_inj is not None
    assert filtered_inj["status"] == "Questionable"
    assert filtered_inj["practice_3"] == "FP"

    state = S.build_player_state(
        TARGET, filtered_inj, filtered_news, [], {"snap_pct_l3": 0.99, "snap_pct_last": 1.0}
    )
    assert S.has_text_evidence(state) is True
    h1 = S.compute_state_hash(state)
    assert len(h1) == 32
    assert h1 == S.compute_state_hash(state)


def test_no_read_when_no_news_and_no_injury_row():
    state = S.build_player_state(TARGET, None, [], [], {"snap_pct_l3": 0.85, "snap_pct_last": 0.88})
    assert S.has_text_evidence(state) is False
    ev = Q.evaluate_player_verdict({})
    assert ev.verdict == "NO_READ"


def test_questions_use_backtick_paths_and_deterministic_code_composition():
    assert len(Q.AUDIT_QUESTIONS) == 8
    for spec in Q.AUDIT_QUESTIONS:
        assert "`" in spec.instructions
        assert len(Q.question_hash(spec)) == 32

    # Clean player -> KEEP
    clean_judgments = {
        "snap_cap_risk": {"kind": "noul", "value": 0.04, "confidence": None},
        "inactive_or_decoy_risk": {"kind": "noul", "value": 0.02, "confidence": None},
        "dnp_friday_unresolved": {"kind": "noul", "value": 0.01, "confidence": None},
        "reaggravation_risk": {"kind": "noul", "value": 0.10, "confidence": None},
        "committee_erosion_risk": {"kind": "noul", "value": 0.08, "confidence": None},
        "teammate_absence_boost": {"kind": "noul", "value": 0.88, "confidence": None},
        "injury_limitation_severity": {"kind": "score", "value": 0.3, "confidence": 0.91},
        "role_clarity_rubric": {"kind": "score", "value": 3.6, "confidence": 0.85},
    }
    ev_keep = Q.evaluate_player_verdict(clean_judgments)
    assert ev_keep.verdict == "KEEP"
    assert ev_keep.boost_signal is True

    # Noul in uncertainty band (0.20 < p < 0.80) -> FLAG
    uncertain_judgments = {
        **clean_judgments,
        "snap_cap_risk": {"kind": "noul", "value": 0.52, "confidence": None},
    }
    ev_flag = Q.evaluate_player_verdict(uncertain_judgments)
    assert ev_flag.verdict == "FLAG"
    assert "snap_cap_risk" in ev_flag.uncertain_questions

    # High-probability snap cap risk (p >= 0.80) -> VETO
    veto_judgments = {
        **clean_judgments,
        "snap_cap_risk": {"kind": "noul", "value": 0.87, "confidence": None},
    }
    ev_veto = Q.evaluate_player_verdict(veto_judgments)
    assert ev_veto.verdict == "VETO"
    assert "snap_cap_risk" in ev_veto.veto_questions

    # Changing thresholds in code re-evaluates without calling Jev
    relaxed = {**Q.THRESHOLDS, "noul_yes_min": 0.95}
    ev_relaxed = Q.evaluate_player_verdict(veto_judgments, thresholds=relaxed)
    assert ev_relaxed.verdict == "FLAG"


def test_jev_client_fanout_and_cost_cap():
    fake_nouls = {
        q.id: SimpleNamespace(noul=0.05) for q in Q.AUDIT_QUESTIONS if q.kind == "noul"
    }
    fake_scores = {
        q.id: SimpleNamespace(score=1.0, confidence=0.88, probabilities={"0": 0.2, "1": 0.8})
        for q in Q.AUDIT_QUESTIONS
        if q.kind == "score"
    }
    fake_resp = SimpleNamespace(
        model="jev-1.13.0",
        usage=SimpleNamespace(input_tokens=1420, output_tokens=0),
        nouls=fake_nouls,
        scores=fake_scores,
        answers={},
    )

    calls = []

    class FakeSdk:
        def system_one(self, state, questions):
            calls.append((state, questions))
            return fake_resp

    client = JC.JevClient(sdk_client=FakeSdk(), model="jev-latest")
    state = {"player": {"name": "Baker Mayfield"}, "news": [{"title": "Full practice"}]}
    res = client.evaluate_player(state)
    assert len(calls) == 1
    assert len(calls[0][1]) == len(Q.AUDIT_QUESTIONS)
    assert res.model_requested == "jev-latest"
    assert res.model_resolved == "jev-1.13.0"
    assert res.input_tokens == 1420
    assert res.answers["snap_cap_risk"]["value"] == 0.05
    assert res.answers["injury_limitation_severity"]["confidence"] == 0.88


def test_lineup_audit_identifies_weakest_slot_and_legal_swaps():
    pool = {
        "qb1": {"player_id": "qb1", "name": "Patrick Mahomes", "team": "KC", "position": "QB", "salary": 7200, "proj_dk_mean": 21.5, "verdict": "KEEP", "reasons": [], "boost": False},
        "rb1": {"player_id": "rb1", "name": "Kenneth Walker", "team": "SEA", "position": "RB", "salary": 6500, "proj_dk_mean": 16.2, "verdict": "VETO", "reasons": ["Snap count risk (p=0.86)"], "boost": False},
        "rb2": {"player_id": "rb2", "name": "Breece Hall", "team": "NYJ", "position": "RB", "salary": 6800, "proj_dk_mean": 17.4, "verdict": "KEEP", "reasons": [], "boost": False},
        "wr1": {"player_id": "wr1", "name": "Drake London", "team": "ATL", "position": "WR", "salary": 6400, "proj_dk_mean": 15.8, "verdict": "FLAG", "reasons": ["Uncertain reaggravation risk (p=0.45)"], "boost": False},
        "rb_swap_a": {"player_id": "rb_swap_a", "name": "Zach Charbonnet", "team": "SEA", "position": "RB", "salary": 5800, "proj_dk_mean": 15.9, "verdict": "KEEP", "reasons": [], "boost": True},
        "rb_swap_b": {"player_id": "rb_swap_b", "name": "Tony Pollard", "team": "TEN", "position": "RB", "salary": 6300, "proj_dk_mean": 15.5, "verdict": "KEEP", "reasons": [], "boost": False},
        "rb_too_expensive": {"player_id": "rb_too_expensive", "name": "Saquon Barkley", "team": "PHI", "position": "RB", "salary": 8200, "proj_dk_mean": 22.0, "verdict": "KEEP", "reasons": [], "boost": False},
    }
    lineup = {
        "lineup_id": "1",
        "salary_used": 49800,  # $200 remaining cap
        "proj_fpts": 134.2,
        "sim_win_pct": 0.021,
        "sim_roi": 0.45,
        "players": [
            {"slot": "QB", "player_id": "qb1", "name": "Patrick Mahomes", "salary": 7200},
            {"slot": "RB", "player_id": "rb1", "name": "Kenneth Walker", "salary": 6500},
            {"slot": "RB2", "player_id": "rb2", "name": "Breece Hall", "salary": 6800},
            {"slot": "WR", "player_id": "wr1", "name": "Drake London", "salary": 6400},
            {"slot": "DST", "player_id": "SEA_DST", "name": "Seahawks", "salary": 3000},
        ],
    }

    audited = LA.compose_lineup_audit(lineup, pool)
    assert audited.status == "VETOED"
    assert audited.veto_count == 1
    assert audited.flag_count == 1
    assert audited.weakest_slot is not None
    assert audited.weakest_slot.player_id == "rb1"
    # Max salary for RB slot replacement = 6500 + (50000 - 49800) = 6700.
    # Saquon ($8200) is excluded, Breece ($6800) is already in lineup.
    swaps = audited.weakest_slot.swaps
    assert len(swaps) == 2
    assert swaps[0].player_id == "rb_swap_a"
    assert swaps[0].boost is True
    assert swaps[1].player_id == "rb_swap_b"


def test_forward_grade_jev_aggregates_residuals_and_dnp():
    rows = [
        {
            "player_id": "p1",
            "verdict": "VETO",
            "proj_dk_mean": 16.0,
            "actual_dk": 4.2,
            "residual": -11.8,
            "realized_snap_pct": 0.18,
            "judgments": {"snap_cap_risk": {"kind": "noul", "value": 0.88}},
        },
        {
            "player_id": "p2",
            "verdict": "KEEP",
            "proj_dk_mean": 15.0,
            "actual_dk": 16.5,
            "residual": 1.5,
            "realized_snap_pct": 0.84,
            "judgments": {"snap_cap_risk": {"kind": "noul", "value": 0.04}},
        },
    ]
    v_sum = JG.compute_verdict_summary(rows)
    by_v = {x["verdict"]: x for x in v_sum}
    assert by_v["VETO"]["mean_residual_dk"] == -11.8
    assert by_v["KEEP"]["mean_residual_dk"] == 1.5

    q_sum = JG.compute_question_summary(rows)
    snap_q = next(q for q in q_sum if q["question_id"] == "snap_cap_risk")
    assert snap_q["n_triggered"] == 1
    assert snap_q["trig_mean_residual"] == -11.8
    assert snap_q["n_cleared"] == 1
    assert snap_q["clear_mean_residual"] == 1.5


def test_zero_leakage_into_sim_priors_or_dfs_optimizer():
    """Architectural invariant: nothing in sim/, priors/, or dfs/ imports or queries jev_judgments or fantasypros_news."""
    src_root = Path(__file__).resolve().parents[1] / "src" / "nfl_edge"
    forbidden = ("jev_judgments", "fantasypros_news", "typesafe_sdk", "jev_client", "audit_questions")
    for folder in ("sim", "priors", "dfs"):
        for py in (src_root / folder).rglob("*.py"):
            text = py.read_text()
            for token in forbidden:
                assert token not in text, f"{py} references {token}"


def test_post_dfs_auto_sync_runs_fields_news_and_audit(monkeypatch):
    from nfl_edge.ingest import fantasypros_news as fpn
    from nfl_edge.research import audit as A
    from nfl_edge.research import auto_sync as AS
    from nfl_edge.research import fields as F

    calls: list[str] = []
    monkeypatch.setattr(F, "run", lambda s, w: calls.append(f"fields:{s}:{w}") or 438)
    monkeypatch.setattr(AS, "_has_fp_key", lambda: True)
    monkeypatch.setattr(AS, "_has_typesafe_key", lambda: True)
    monkeypatch.setattr(AS, "latest_news_seen", lambda: None)
    monkeypatch.setattr(fpn, "run", lambda limit=100: calls.append("news") or {"written": 12})
    monkeypatch.setattr(
        A,
        "run_audit",
        lambda season, week, slate, site: calls.append(f"audit:{season}:{week}:{site}:{slate}")
        or {"verdict_counts": {"KEEP": 10}, "written_rows": 80, "actual_usd": 0.0012},
    )

    rep = AS.run_post_dfs_sync(2026, 7, site="dk", slate="main")
    assert calls == ["fields:2026:7", "news", "audit:2026:7:dk:main"]
    assert rep["fields_rows"] == 438
    assert rep["news_written"] == 12
    assert rep["audit"]["verdict_counts"] == {"KEEP": 10}


def test_post_dfs_auto_sync_respects_news_cooldown_and_never_raises(monkeypatch):
    from nfl_edge.research import audit as A
    from nfl_edge.research import auto_sync as AS
    from nfl_edge.research import fields as F

    now = datetime(2026, 10, 24, 16, 0, tzinfo=UTC)
    recent = datetime(2026, 10, 24, 15, 55, tzinfo=UTC)  # 5m ago (< 15m cooldown)
    monkeypatch.setattr(F, "run", lambda s, w: 438)
    monkeypatch.setattr(AS, "_has_fp_key", lambda: True)
    monkeypatch.setattr(AS, "_has_typesafe_key", lambda: True)
    monkeypatch.setattr(AS, "latest_news_seen", lambda: recent)
    monkeypatch.setattr(A, "run_audit", lambda **k: (_ for _ in ()).throw(RuntimeError("api down")))

    rep = AS.run_post_dfs_sync(2026, 7, site="dk", slate="main", now=now)
    assert rep["news_skipped"] == "recent pull (<15m)"
    assert rep["audit_error"] == "api down"

