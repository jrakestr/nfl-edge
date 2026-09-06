"""Spec for outputs/lines.py: the plain-English verdicts the Edge board renders. Pure; no DB."""
from __future__ import annotations

import pytest

from nfl_edge.outputs import lines as L

MINUS = "\u2212"
TEAMS = {
    "DET": {"city": "Detroit", "nick": "Lions", "plural": True},
    "NO": {"city": "New Orleans", "nick": "Saints", "plural": True},
    "CHI": {"city": "Chicago", "nick": "Bears", "plural": True},
    "CAR": {"city": "Carolina", "nick": "Panthers", "plural": True},
    "TST": {"city": "Testville", "nick": "Heat", "plural": False},
    "CLE": {"city": "Cleveland", "nick": "Browns", "plural": True},
    "NYJ": {"city": "New York", "nick": "Jets", "plural": True, "name": "the Jets"},
    "NYG": {"city": "New York", "nick": "Giants", "plural": True, "name": "the Giants"},
}
CFG = {"kelly_multiplier": 0.25, "flat_edge": 0.01, "strong_edge": 0.03, "default_price": -110}
DRAWS = 20000


def game(**kw) -> dict:
    g = {
        "game_id": "2025_10_NO_DET", "home_team": "DET", "away_team": "NO", "kickoff": "2025-11-09 13:00",
        "fair_spread": 10.4, "fair_total": 47.3, "home_win_prob": 0.80,
        "market_line_id": 42, "captured_at": "2025-11-08T18:00:00Z",
        "spread_line": 7.0, "total_line": 44.5,
        "home_spread_odds": -108, "away_spread_odds": -112, "over_odds": -110, "under_odds": -110,
        "home_moneyline": -400, "away_moneyline": 310,
    }
    g.update(kw)
    return g


def edges(p_home=0.58, p_over=0.56, p_ml=0.80, m_home=0.49, m_over=0.50, m_ml=0.76,
          price_home=-108, price_away=-112, push=0.0) -> list[dict]:
    def row(mt, side, p, m, price):
        return {"market_line_id": 42, "ref_id": "2025_10_NO_DET", "market_type": mt, "side": side,
                "model_prob": p, "market_prob": m, "edge": p - m, "kelly_fraction": max(0.0, p - m) / 4,
                "price": price, "p_push": push, "hold": 0.045}
    return [
        row("spread", "home", p_home, m_home, price_home), row("spread", "away", 1 - p_home, 1 - m_home, price_away),
        row("total", "over", p_over, m_over, -110), row("total", "under", 1 - p_over, 1 - m_over, -110),
        row("moneyline", "home", p_ml, m_ml, -400), row("moneyline", "away", 1 - p_ml, 1 - m_ml, 310),
    ]


# ----------------------------------------------------------------------------- sentence 1: side
def test_home_favorite_agrees_with_book():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "Detroit is favored to beat New Orleans by 10.4 points. The book has them by 7."


def test_away_favorite_agrees_with_book():
    g = game(home_team="CAR", away_team="CHI", fair_spread=-1.8, spread_line=-2.5,
             home_spread_odds=-102, away_spread_odds=-118)
    v = L.game_verdict(g, edges(p_home=0.50, m_home=0.54, price_home=-102, price_away=-118), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "Chicago is favored to beat Carolina by 1.8 points. The book has them by 2.5."


def test_sim_and_book_disagree_on_side():
    g = game(home_team="CAR", away_team="CHI", fair_spread=1.8, spread_line=-2.5)
    v = L.game_verdict(g, edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "Carolina is favored to beat Chicago by 1.8 points. The book has Chicago by 2.5."


def test_pickem_line():
    v = L.game_verdict(game(spread_line=0.0), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0].endswith("The book has it as a pick'em.")
    assert v.sentences[1].startswith("The Lions cover PK in 58%")


def test_sim_even():
    g = game(home_team="CAR", away_team="CHI", fair_spread=0.2, spread_line=-2.5)
    v = L.game_verdict(g, edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "We have Carolina and Chicago even. The book has Chicago by 2.5."


def test_shared_city_teams_use_their_display_name():
    g = game(home_team="NYJ", away_team="CLE", fair_spread=4.0, spread_line=-1.5)
    v = L.game_verdict(g, edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "The Jets are favored to beat Cleveland by 4.0 points. The book has Cleveland by 1.5."
    g = game(home_team="NYJ", away_team="NYG", fair_spread=-2.0, spread_line=3.0)
    v = L.game_verdict(g, edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "The Giants are favored to beat the Jets by 2.0 points. The book has the Jets by 3."
    g = game(home_team="NYJ", away_team="NYG", fair_spread=0.1, spread_line=3.0)
    v = L.game_verdict(g, edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "We have the Jets and the Giants even. The book has the Jets by 3."


def test_no_line_posted():
    g = game(spread_line=None, total_line=None, home_moneyline=None, away_moneyline=None, market_line_id=None)
    v = L.game_verdict(g, [], "ok", TEAMS, CFG, DRAWS)
    assert v.sentences == ["Detroit is favored to beat New Orleans by 10.4 points. No line posted yet."]
    assert v.chips is None
    assert v.max_edge == 0.0


# ----------------------------------------------------------------------------- sentence 2: cover
def test_cover_sentence_pays():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[1] == (
        f"The Lions cover {MINUS}7 in 58% of our 20,000 simulated games; "
        f"that pays at {MINUS}108 (needs 52%)."
    )


def test_cover_sentence_does_not_pay_on_the_away_favorite():
    g = game(home_team="CAR", away_team="CHI", fair_spread=-1.8, spread_line=-2.5,
             home_spread_odds=-102, away_spread_odds=-118)
    # away model_prob = 1 - 0.50 = 0.50 at -118 (needs 54%)
    v = L.game_verdict(g, edges(p_home=0.50, m_home=0.54, price_home=-102, price_away=-118), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[1] == (
        f"The Bears cover {MINUS}2.5 in 50% of our 20,000 simulated games; "
        f"that does not pay at {MINUS}118 (needs 54%)."
    )


def test_cover_sentence_flat_is_a_coin_flip():
    v = L.game_verdict(game(), edges(p_home=0.495, m_home=0.49), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[1] == (
        f"The Lions cover {MINUS}7 in 50% of our 20,000 simulated games \u2014 a coin flip at {MINUS}108."
    )


def test_cover_sentence_with_assumed_price():
    g = game(home_spread_odds=None, away_spread_odds=None)
    v = L.game_verdict(g, edges(m_home=0.5, price_home=-110, price_away=-110), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[1].endswith(f"that pays at {MINUS}110 (assumed; needs 52%).")


def test_singular_nickname_grammar():
    g = game(home_team="TST", fair_spread=4.0, spread_line=3.0)
    v = L.game_verdict(g, edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0].startswith("Testville is favored to beat New Orleans by 4.0 points.")
    assert v.sentences[1].startswith(f"The Heat covers {MINUS}3 in 58%")


def test_plural_nickname_verb():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[1].startswith("The Lions cover ")


def test_integer_line_with_pushes_uses_push_conditional_prob():
    v = L.game_verdict(game(), edges(push=0.06), "ok", TEAMS, CFG, DRAWS)
    assert "58%" in v.sentences[1]
    assert v.chips["side"]["prob"] == pytest.approx(0.58)


# ----------------------------------------------------------------------------- sentence 3: total
def test_total_sentence_over():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[2] == "We expect 47.3 total points; the line is 44.5. The over hits 56% of the time."


def test_total_sentence_under():
    v = L.game_verdict(game(fair_total=41.0), edges(p_over=0.42, m_over=0.5), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[2] == "We expect 41.0 total points; the line is 44.5. The under hits 58% of the time."


def test_total_sentence_flat_within_a_point():
    v = L.game_verdict(game(fair_total=44.9), edges(p_over=0.505, m_over=0.5), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[2] == "We expect 44.9 total points; the line is 44.5. That lands within a point of the line."


def test_total_missing_but_spread_present():
    g = game(total_line=None, over_odds=None, under_odds=None)
    e = [r for r in edges() if r["market_type"] != "total"]
    v = L.game_verdict(g, e, "ok", TEAMS, CFG, DRAWS)
    assert len(v.sentences) == 3
    assert v.sentences[2] == "No total posted yet."
    assert v.chips["total"] is None


# ----------------------------------------------------------------------------- chips and status
def test_chips_pick_the_model_side_and_signed_labels():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.chips["side"]["label"] == f"DET {MINUS}7"
    assert v.chips["side"]["edge"] == pytest.approx(0.09)
    assert v.chips["side"]["price"] == -108
    assert v.chips["total"]["label"] == "Over 44.5"
    assert v.chips["total"]["edge"] == pytest.approx(0.06)
    assert v.chips["home_wins"]["prob"] == pytest.approx(0.80)
    assert v.chips["home_wins"]["edge"] == pytest.approx(0.04)
    assert v.max_edge == pytest.approx(0.09)


def test_chips_side_flips_to_the_dog_when_the_model_likes_it():
    v = L.game_verdict(game(), edges(p_home=0.40, m_home=0.49), "ok", TEAMS, CFG, DRAWS)
    assert v.chips["side"]["label"] == "NO +7"
    assert v.chips["side"]["edge"] == pytest.approx(0.09)
    assert v.chips["side"]["price"] == -112


def test_invariant_failure_withholds_edges():
    v = L.game_verdict(game(), edges(), "fail", TEAMS, CFG, DRAWS)
    assert v.status == "fail"
    assert v.sentences == ["This run failed an invariant for this game; edges withheld."]
    assert v.chips is None and v.max_edge == 0.0


def test_warning_status_keeps_text():
    v = L.game_verdict(game(), edges(), "warn", TEAMS, CFG, DRAWS)
    assert v.status == "warn" and len(v.sentences) == 3


def test_to_dict_has_the_ui_contract_keys():
    d = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS).to_dict()
    assert set(d) >= {"game_id", "home", "away", "kickoff", "status", "sentences", "chips", "max_edge",
                      "fair", "market", "edges"}
    assert d["market"]["snapshot_id"] == 42
    assert d["fair"]["spread"] == pytest.approx(10.4)
    assert len(d["edges"]) == 6


# ----------------------------------------------------------------------------- week summary
def test_week_summary_counts_and_biggest():
    a = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)  # side +9%, total +6%
    b = L.game_verdict(game(game_id="2025_10_CHI_CAR", home_team="CAR", away_team="CHI"),
                       edges(p_home=0.50, m_home=0.49, p_over=0.505, m_over=0.5, p_ml=0.77), "ok", TEAMS, CFG, DRAWS)
    s = L.week_summary(10, [a, b], CFG, "7f3a1b2c-0000", DRAWS)
    assert s == (f"Week 10: 2 games. 1 side and 1 total clear a 3% edge; the biggest is DET {MINUS}7 (+9.0%). "
                 "Run 7f3a1b2c · 20k draws.")


def test_week_summary_nothing_clears():
    b = L.game_verdict(game(), edges(p_home=0.50, m_home=0.49, p_over=0.505, m_over=0.5, p_ml=0.77), "ok",
                       TEAMS, CFG, DRAWS)
    s = L.week_summary(1, [b], CFG, "7f3a1b2c-0000", 5000)
    assert s == "Week 1: 1 game. No side or total clears a 3% edge. Run 7f3a1b2c · 5000 draws."


def test_week_summary_mentions_games_without_a_line():
    a = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    n = L.game_verdict(game(game_id="x", spread_line=None, total_line=None, market_line_id=None), [], "ok",
                       TEAMS, CFG, DRAWS)
    s = L.week_summary(1, [a, n], CFG, "abcdef01", DRAWS)
    assert "1 without a line yet." in s


# ----------------------------------------------------------------------------- build_week
def test_build_week_sorts_by_max_edge_and_applies_check_status():
    g1 = game()
    g2 = game(game_id="2025_10_CHI_CAR", home_team="CAR", away_team="CHI")
    e1 = edges()
    e2 = [{**r, "ref_id": "2025_10_CHI_CAR"} for r in edges(p_home=0.70, m_home=0.49)]
    checks = [
        {"game_id": "2025_10_NO_DET", "severity": "warning", "passed": False},
        {"game_id": "2025_10_CHI_CAR", "severity": "invariant", "passed": False},
    ]
    w = L.build_week(2025, 10, "7f3a1b2c-0000", DRAWS, [g1, g2], e1 + e2, checks, TEAMS, CFG)
    assert [g.game_id for g in w.games] == ["2025_10_NO_DET", "2025_10_CHI_CAR"]  # failed game sorts last (0)
    assert w.games[0].status == "warn" and w.games[1].status == "fail"
    assert w.summary.startswith("Week 10: 2 games. 1 side and 1 total clear a 3% edge")
    d = w.to_dict()
    assert d["run"]["run_id"] == "7f3a1b2c-0000" and d["run"]["draws"] == DRAWS
    assert d["games"][0]["week_summary"] == w.summary


# ----------------------------------------------------------------------------- mean display (median fallback)
def test_mean_spread_and_total_used_when_present():
    v = L.game_verdict(game(mean_spread=5.8, mean_total=46.1), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "Detroit is favored to beat New Orleans by 5.8 points. The book has them by 7."
    assert v.sentences[2].startswith("We expect 46.1 total points; the line is 44.5.")
    assert v.fair["spread"] == pytest.approx(10.4)
    assert v.fair["spread_mean"] == pytest.approx(5.8)
    assert v.fair["total_mean"] == pytest.approx(46.1)
    assert v.fair["display"] == "mean"


def test_median_when_mean_is_null_same_sentence_otherwise():
    with_mean = L.game_verdict(game(mean_spread=10.4, mean_total=47.3), edges(), "ok", TEAMS, CFG, DRAWS)
    without = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert with_mean.sentences == without.sentences
    assert without.fair["display"] == "median"
    assert without.fair["spread_mean"] is None and without.fair["total_mean"] is None


def test_sim_even_and_favorite_use_the_displayed_mean():
    v = L.game_verdict(game(mean_spread=0.2, fair_spread=10.4), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0] == "We have Detroit and New Orleans even. The book has Detroit by 7."


# ----------------------------------------------------------------------------- line moved since sim
def test_spread_moved_up_appends_signed_book_clause():
    v = L.game_verdict(game(sim_spread=6.5), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0].endswith(f"The book has them by 7, moved from {MINUS}6.5 since we ran.")
    assert v.market["moved_since_sim"]["spread"] == {"from": 6.5, "to": 7.0}
    assert v.market["moved_since_sim"]["total"] is None


def test_spread_moved_down_appends_signed_book_clause():
    v = L.game_verdict(game(sim_spread=7.5), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.sentences[0].endswith(f"The book has them by 7, moved from {MINUS}7.5 since we ran.")
    assert v.market["moved_since_sim"]["spread"] == {"from": 7.5, "to": 7.0}


def test_total_moved_up_and_down():
    up = L.game_verdict(game(sim_total=43.5), edges(), "ok", TEAMS, CFG, DRAWS)
    assert "the line is 44.5, up from 43.5." in up.sentences[2]
    assert up.market["moved_since_sim"]["total"] == {"from": 43.5, "to": 44.5}
    down = L.game_verdict(game(sim_total=46.5), edges(), "ok", TEAMS, CFG, DRAWS)
    assert "the line is 44.5, down from 46.5." in down.sentences[2]
    assert down.market["moved_since_sim"]["total"] == {"from": 46.5, "to": 44.5}


def test_unchanged_sim_line_has_no_moved_clause():
    v = L.game_verdict(game(sim_spread=7.0, sim_total=44.5), edges(), "ok", TEAMS, CFG, DRAWS)
    assert "moved from" not in v.sentences[0]
    assert "up from" not in v.sentences[2] and "down from" not in v.sentences[2]
    assert v.market["moved_since_sim"] == {"spread": None, "total": None}


# ----------------------------------------------------------------------------- structured chips / calls
def test_chip_market_type_and_side_home_over():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.chips["side"]["market_type"] == "spread" and v.chips["side"]["side"] == "home"
    assert v.chips["total"]["market_type"] == "total" and v.chips["total"]["side"] == "over"
    assert v.chips["home_wins"]["market_type"] == "moneyline" and v.chips["home_wins"]["side"] == "home"


def test_chip_market_type_and_side_away_under():
    v = L.game_verdict(game(), edges(p_home=0.40, m_home=0.49, p_over=0.42, m_over=0.50),
                       "ok", TEAMS, CFG, DRAWS)
    assert v.chips["side"]["market_type"] == "spread" and v.chips["side"]["side"] == "away"
    assert v.chips["total"]["market_type"] == "total" and v.chips["total"]["side"] == "under"


def test_calls_cover_matches_sentence_2_pays():
    v = L.game_verdict(game(), edges(), "ok", TEAMS, CFG, DRAWS)
    assert v.calls["cover"] == {
        "market_type": "spread", "side": "home", "call": "pays", "price": -108,
        "needs": pytest.approx(108 / 208),
    }


def test_calls_cover_matches_sentence_2_does_not_pay():
    g = game(home_team="CAR", away_team="CHI", fair_spread=-1.8, spread_line=-2.5,
             home_spread_odds=-102, away_spread_odds=-118)
    v = L.game_verdict(g, edges(p_home=0.50, m_home=0.54, price_home=-102, price_away=-118),
                       "ok", TEAMS, CFG, DRAWS)
    assert v.calls["cover"]["side"] == "away"
    assert v.calls["cover"]["call"] == "does not pay"
    assert v.calls["cover"]["price"] == -118
    assert v.calls["cover"]["needs"] == pytest.approx(118 / 218)


def test_calls_cover_matches_sentence_2_coin_flip():
    v = L.game_verdict(game(), edges(p_home=0.495, m_home=0.49), "ok", TEAMS, CFG, DRAWS)
    assert v.calls["cover"]["call"] == "coin flip"
    assert v.calls["cover"]["price"] == -108
