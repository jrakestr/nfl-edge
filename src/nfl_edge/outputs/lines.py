"""Plain-English verdicts for the Edge board. Pure functions over proj_games + market snapshot +
edges + check status; no database access. `nfl-edge lines` assembles the inputs, prints the text,
and persists each game's `to_dict()` to model.verdicts so the UI never regenerates the grammar.

Per game (design-system VerdictCard):
  1. who is favored and by how much vs the book
  2. whether the market side covers often enough to pay at its price
  3. expected total vs the line
plus Side / Total / Home-wins chips and `max_edge` for sorting. A game whose run failed an
invariant withholds its edges.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from ..config import load_yaml
from ..market.edge import american_to_prob

MINUS = "\u2212"
DASH = "\u2014"
WITHHELD = "This run failed an invariant for this game; edges withheld."


def load_teams() -> dict:
    return load_yaml("teams.yaml")


# ----------------------------------------------------------------------------- formatting
def _num(x: float) -> str:
    return f"{float(x):g}"


def _signed(x: float) -> str:
    x = float(x)
    if x == 0:
        return "PK"
    return (MINUS if x < 0 else "+") + _num(abs(x))


def _price(a: int) -> str:
    return (MINUS + str(abs(int(a)))) if int(a) < 0 else "+" + str(int(a))


def _pct(p: float) -> str:
    return f"{p:.0%}"


class _Team:
    def __init__(self, abbr: str, teams: dict):
        t = teams.get(abbr, {"city": abbr, "nick": abbr, "plural": True})
        self.abbr, self.city, self.nick = abbr, t["city"], t["nick"]
        self.plural = bool(t.get("plural", True))
        # Sentence-1 display name: the city, or "the Jets" where two teams share a city.
        self.name = t.get("name") or self.city

    @property
    def cover(self) -> str:
        return "cover" if self.plural else "covers"

    @property
    def be(self) -> str:
        """Verb for the display name: 'is' for a city, 'are' for a plural nickname like 'the Jets'."""
        return "are" if (self.name != self.city and self.plural) else "is"


def _cap(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


# ----------------------------------------------------------------------------- dataclasses
@dataclass
class GameVerdict:
    game_id: str
    home: str
    away: str
    kickoff: str | None
    status: str
    sentences: list[str]
    chips: dict | None
    max_edge: float
    fair: dict
    market: dict
    edges: list[dict] = field(default_factory=list)
    calls: dict | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class WeekVerdicts:
    season: int
    week: int
    run_id: str
    draws: int
    summary: str
    games: list[GameVerdict]

    def to_dict(self) -> dict:
        return {
            "run": {"run_id": self.run_id, "season": self.season, "week": self.week, "draws": self.draws},
            "summary": self.summary,
            "games": [{**g.to_dict(), "week_summary": self.summary} for g in self.games],
        }


# ----------------------------------------------------------------------------- one game
def _edge_row(edges: list[dict], market_type: str, side: str) -> dict | None:
    for r in edges:
        if r["market_type"] == market_type and r["side"] == side:
            return r
    return None


def _chip(label: str, r: dict) -> dict:
    return {"label": label, "prob": float(r["model_prob"]), "market_prob": float(r["market_prob"]),
            "edge": float(r["edge"]), "kelly": float(r["kelly_fraction"]), "price": int(r["price"]),
            "market_type": r["market_type"], "side": r["side"]}


def game_verdict(g: dict, edges: list[dict], status: str, teams: dict, cfg: dict, draws: int) -> GameVerdict:
    home, away = _Team(g["home_team"], teams), _Team(g["away_team"], teams)
    use_mean = g.get("mean_spread") is not None
    fair = {
        "spread": g.get("fair_spread"), "total": g.get("fair_total"), "home_win_prob": g.get("home_win_prob"),
        "spread_mean": g.get("mean_spread"), "total_mean": g.get("mean_total"),
        "display": "mean" if use_mean else "median",
    }
    market = {
        "snapshot_id": g.get("market_line_id"), "captured_at": g.get("captured_at"),
        "spread": g.get("spread_line"), "total": g.get("total_line"),
        "home_spread_odds": g.get("home_spread_odds"), "away_spread_odds": g.get("away_spread_odds"),
        "over_odds": g.get("over_odds"), "under_odds": g.get("under_odds"),
        "home_moneyline": g.get("home_moneyline"), "away_moneyline": g.get("away_moneyline"),
        "moved_since_sim": {"spread": None, "total": None},
    }
    base = {"game_id": g["game_id"], "home": home.abbr, "away": away.abbr, "kickoff": g.get("kickoff"),
            "fair": fair, "market": market,
            "edges": [{k: v for k, v in r.items() if k != "run_id"} for r in edges]}
    if status == "fail":
        return GameVerdict(status="fail", sentences=[WITHHELD], chips=None, max_edge=0.0, **base)

    flat = float(cfg["flat_edge"])
    fs = float(g["mean_spread"] if use_mean else g["fair_spread"])
    m = abs(fs)
    sim_even = m < 0.5
    fav, dog = (home, away) if fs > 0 else (away, home)
    sl = g.get("spread_line")
    tl = g.get("total_line")

    # (1) side
    lead = (f"We have {home.name} and {away.name} even." if sim_even
            else _cap(f"{fav.name} {fav.be} favored to beat {dog.name} by {m:.1f} points."))
    if sl is None:
        return GameVerdict(status=status, sentences=[f"{lead} No line posted yet."], chips=None, max_edge=0.0, **base)
    sl = float(sl)
    if sl == 0:
        book = "The book has it as a pick'em."
    else:
        book_fav = home if sl > 0 else away
        b = _num(abs(sl))
        book = f"The book has them by {b}." if (book_fav is fav and not sim_even) else f"The book has {book_fav.name} by {b}."
    sim_sl = g.get("sim_spread")
    if sim_sl is not None and float(sim_sl) != sl:
        book = book[:-1] + f", moved from {_signed(-float(sim_sl))} since we ran."
        market["moved_since_sim"]["spread"] = {"from": float(sim_sl), "to": sl}
    s1 = f"{lead} {book}"

    # (2) cover: the market's side at the book's number
    mkt_side_is_home = sl >= 0
    side_team = home if mkt_side_is_home else away
    side_line = -sl if mkt_side_is_home else sl
    r = _edge_row(edges, "spread", "home" if mkt_side_is_home else "away")
    odds_key = "home_spread_odds" if mkt_side_is_home else "away_spread_odds"
    assumed = g.get(odds_key) is None
    p, price, e = float(r["model_prob"]), int(r["price"]), float(r["edge"])
    be = american_to_prob(price)
    head = f"The {side_team.nick} {side_team.cover} {_signed(side_line)} in {_pct(p)} of our {draws:,} simulated games"
    if abs(e) < flat:
        call = "coin flip"
        s2 = f"{head} {DASH} a coin flip at {_price(price)}."
    else:
        call = "pays" if p > be else "does not pay"
        s2 = f"{head}; that {call} at {_price(price)} ({'assumed; ' if assumed else ''}needs {_pct(be)})."
    calls = {"cover": {"market_type": "spread", "side": "home" if mkt_side_is_home else "away",
                       "call": call, "price": price, "needs": be}}

    # (3) total
    over, under = _edge_row(edges, "total", "over"), _edge_row(edges, "total", "under")
    if tl is None or over is None:
        s3, total_chip = "No total posted yet.", None
    else:
        use_mean_t = g.get("mean_total") is not None
        ft, t = float(g["mean_total"] if use_mean_t else g["fair_total"]), float(tl)
        line_bit = _num(t)
        sim_tl = g.get("sim_total")
        if sim_tl is not None and float(sim_tl) != t:
            direction = "up" if t > float(sim_tl) else "down"
            line_bit = f"{_num(t)}, {direction} from {_num(float(sim_tl))}"
            market["moved_since_sim"]["total"] = {"from": float(sim_tl), "to": t}
        lead3 = f"We expect {ft:.1f} total points; the line is {line_bit}."
        if abs(ft - t) < 1.0:
            s3 = f"{lead3} That lands within a point of the line."
        else:
            side, rr = ("over", over) if ft > t else ("under", under)
            s3 = f"{lead3} The {side} hits {_pct(float(rr['model_prob']))} of the time."
        best = over if float(over["edge"]) >= float(under["edge"]) else under
        total_chip = _chip(f"{best['side'].capitalize()} {_num(t)}", best)

    # chips: the model's side, not the market's
    rh, ra = _edge_row(edges, "spread", "home"), _edge_row(edges, "spread", "away")
    side_chip = (_chip(f"{home.abbr} {_signed(-sl)}", rh) if float(rh["edge"]) >= float(ra["edge"])
                 else _chip(f"{away.abbr} {_signed(sl)}", ra))
    ml = _edge_row(edges, "moneyline", "home")
    hw = {"prob": float(g["home_win_prob"]) if g.get("home_win_prob") is not None else None,
          "edge": float(ml["edge"]) if ml else None,
          "market_prob": float(ml["market_prob"]) if ml else None,
          "price": int(ml["price"]) if ml else None,
          "market_type": "moneyline", "side": "home"}
    chips = {"side": side_chip, "total": total_chip, "home_wins": hw}
    max_edge = max([abs(side_chip["edge"])] + ([abs(total_chip["edge"])] if total_chip else [])
                   + ([abs(hw["edge"])] if hw["edge"] is not None else []))
    return GameVerdict(status=status, sentences=[s1, s2, s3], chips=chips, max_edge=float(max_edge),
                       calls=calls, **base)


# ----------------------------------------------------------------------------- week
def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _draws_label(draws: int) -> str:
    return f"{draws // 1000}k" if draws >= 10000 and draws % 1000 == 0 else str(draws)


def week_summary(week: int, games: list[GameVerdict], cfg: dict, run_id: str, draws: int) -> str:
    strong = float(cfg["strong_edge"])
    sides = [g.chips["side"] for g in games if g.chips and g.chips["side"]]
    totals = [g.chips["total"] for g in games if g.chips and g.chips["total"]]
    k = sum(c["edge"] >= strong for c in sides)
    j = sum(c["edge"] >= strong for c in totals)
    no_line = sum(1 for g in games if g.status != "fail" and g.market.get("spread") is None)
    parts = [f"Week {week}: {_plural(len(games), 'game')}."]
    if k + j == 0:
        parts.append(f"No side or total clears a {strong:.0%} edge.")
    else:
        best = max(sides + totals, key=lambda c: c["edge"])
        parts.append(f"{_plural(k, 'side')} and {_plural(j, 'total')} clear a {strong:.0%} edge; "
                     f"the biggest is {best['label']} ({best['edge']:+.1%}).")
    if no_line:
        parts.append(f"{no_line} without a line yet.")
    parts.append(f"Run {run_id[:8]} · {_draws_label(draws)} draws.")
    return " ".join(parts)


def game_status(game_id: str, checks: list[dict]) -> str:
    rows = [c for c in checks if c["game_id"] == game_id and not c["passed"]]
    if any(c["severity"] == "invariant" for c in rows):
        return "fail"
    return "warn" if rows else "ok"


def build_week(season: int, week: int, run_id: str, draws: int, games: list[dict], edges: list[dict],
               checks: list[dict], teams: dict, cfg: dict) -> WeekVerdicts:
    by_game: dict[str, list[dict]] = {}
    for r in edges:
        by_game.setdefault(r["ref_id"], []).append(r)
    verdicts = [game_verdict(g, by_game.get(g["game_id"], []), game_status(g["game_id"], checks), teams, cfg, draws)
                for g in games]
    verdicts.sort(key=lambda v: -v.max_edge)
    done = {g["game_id"] for g in games if g.get("result") is not None}
    remaining = [v for v in verdicts if v.game_id not in done]
    return WeekVerdicts(season, week, run_id, draws, week_summary(week, remaining, cfg, run_id, draws), verdicts)
