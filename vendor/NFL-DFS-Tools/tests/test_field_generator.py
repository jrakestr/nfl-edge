"""nfl-edge: the compiled field generator (_field_lineup) against the Python one it replaced.

Fast checks run always. The distribution comparison draws a few hundred lineups from the
original Python generator and takes about a minute; run it with RUN_SLOW=1.
"""
import multiprocessing as mp
import os
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import nfl_gpp_simulator as G  # noqa: E402

ROSTER = ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "DST"]
COLUMNS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"]
SHAPE = {"QB": (2, 6800, 20), "RB": (3, 6000, 14), "WR": (5, 5800, 13), "TE": (2, 4200, 9),
         "DST": (1, 3000, 7)}


def slate(seed: int = 7, games: int = 12):
    rng = np.random.default_rng(seed)
    ids, own, sal, proj, pos, teams, opp = [], [], [], [], [], [], []
    for g in range(games):
        a, h = f"T{2 * g:02d}", f"T{2 * g + 1:02d}"
        for team, other in ((a, h), (h, a)):
            for p, (n, top, pts) in SHAPE.items():
                for k in range(n):
                    ids.append(f"{team}-{p}{k}")
                    own.append(float(rng.uniform(0.5, 25)))
                    sal.append(int(max(2500, top - k * 1500 + rng.integers(-800, 800)) // 100 * 100))
                    proj.append(max(0.0, pts * (1 - 0.3 * k) + rng.normal(0, 2)))
                    positions = [p] if p in ("QB", "DST") else [p, "FLEX"]
                    pos.append(np.array([1 if c in positions else 0 for c in COLUMNS]))
                    teams.append(team)
                    opp.append(other)
    return tuple(map(np.array, (ids, own, sal, proj, pos, teams, opp)))


def problems(n: int, seed: int = 11):
    ids, own, sal, proj, pos, teams, opp = slate()
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        stack = str(rng.choice(np.unique(teams))) if rng.random() < 0.65 else ""
        stack_len = int(rng.choice([2, 3], p=[0.6, 0.4])) if stack else 0
        out.append((i, ids, np.zeros(len(ids)), pos, own, 49200, 50000, 150.0, sal, proj, 0.25,
                    teams, opp, stack, stack_len, 0, 8, "dk", ROSTER))
    return out


def test_compiled_lineups_are_legal():
    ids, _, sal, _, pos, teams, _ = slate()
    sal_of = dict(zip(ids, sal))
    pos_of = dict(zip(ids, pos))
    team_of = dict(zip(ids, teams))
    probs = problems(300)
    out = [G.NFL_GPP_Simulator.generate_lineups(p) for p in probs]
    ok = [(p, o) for p, o in zip(probs, out) if o is not None]
    assert len(ok) > 200
    under_floor = 0
    for p, o in ok:
        lu = o["Lineup"]
        assert list(lu) == ROSTER
        players = list(lu.values())
        assert len(set(players)) == 9
        for slot, pid in lu.items():
            assert pos_of[pid][ROSTER.index(slot)] == 1, (slot, pid)
        total = sum(sal_of[x] for x in players)
        assert total <= 50000
        # A double stack that draws two TEs overwrites the first in the TE slot while its
        # salary stays counted (inherited from the Python version), so a few saved lineups
        # sit under the relaxed floor. Everything else clears it.
        under_floor += total < 49200 * 0.91 - 1e-6
        assert max(Counter(team_of[x] for x in players).values()) <= 8
        if o["Type"] == "generated_stack":
            assert team_of[lu["QB"]] == p[13]
        else:
            assert p[13] == ""
    assert under_floor / len(ok) < 0.05


def test_unknown_stack_team_never_fills():
    p = list(problems(1)[0])
    p[13], p[14] = "NOPE", 2
    assert G.NFL_GPP_Simulator.generate_lineups(tuple(p)) is None


@pytest.mark.skipif(os.environ.get("RUN_SLOW") != "1", reason="set RUN_SLOW=1 (about a minute)")
def test_compiled_field_matches_python_field():
    n = 600
    probs = problems(n)
    with mp.Pool() as pool:
        py = [o for o in pool.map(G.NFL_GPP_Simulator.generate_lineups_py, probs) if o is not None]
    nb = [o for o in (G.NFL_GPP_Simulator.generate_lineups(p) for p in probs) if o is not None]
    rate_se = np.sqrt(0.25 * 2 / n)
    assert abs(len(py) - len(nb)) / n < 4 * rate_se
    a = Counter(x for o in py for x in o["Lineup"].values())
    b = Counter(x for o in nb for x in o["Lineup"].values())
    keys = sorted(set(a) | set(b))
    fa = np.array([a[k] / len(py) for k in keys])
    fb = np.array([b[k] / len(nb) for k in keys])
    pooled = (fa * len(py) + fb * len(nb)) / (len(py) + len(nb))
    se = np.sqrt(np.maximum(pooled * (1 - pooled), 1e-9) * (1 / len(py) + 1 / len(nb)))
    z = np.abs(fa - fb) / se
    assert np.corrcoef(fa, fb)[0, 1] > 0.95
    assert np.mean(z > 2.58) < 0.03
    stack_py = np.mean([o["Type"] == "generated_stack" for o in py])
    stack_nb = np.mean([o["Type"] == "generated_stack" for o in nb])
    assert abs(stack_py - stack_nb) < 4 * np.sqrt(0.25 * 2 / len(nb))
