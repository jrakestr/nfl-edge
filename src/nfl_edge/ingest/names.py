"""Player name matching for overrides and DK salaries.

Match order: gsis_id → config/dk_aliases.yaml → merge_name/display_name (+ team + position)
→ DST nick/city/abbr. Ambiguous and unknown rows are reported, never guessed.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import polars as pl
import yaml

from ..config import CONFIG_DIR, load_yaml

STATUSES = frozenset({"out", "doubtful", "questionable", "active"})
DST_POS = frozenset({"DST", "DEF", "D"})
TEAM_ALIASES = {"LAR": "LA", "JAC": "JAX", "WSH": "WAS", "JAX": "JAX"}
GSIS_RE = re.compile(r"^00-\d{7}$")


def merge_key(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "")
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_pos(position: str | None) -> str | None:
    if not position or not str(position).strip():
        return None
    p = str(position).upper().strip()
    if p in DST_POS:
        return "DST"
    return p


def normalize_team(team: str | None, teams: dict) -> str | None:
    if not team or not str(team).strip():
        return None
    t = str(team).upper().strip()
    t = TEAM_ALIASES.get(t, t)
    if t in teams:
        return t
    return t


def load_aliases(path: Path | None = None) -> dict[str, str]:
    p = path or (CONFIG_DIR / "dk_aliases.yaml")
    if not p.exists():
        return {}
    raw = yaml.safe_load(p.read_text()) or {}
    if not isinstance(raw, dict):
        raise TypeError("config/dk_aliases.yaml must be a mapping of name -> gsis_id")
    return {merge_key(str(k)): str(v) for k, v in raw.items() if k and v}


def load_teams() -> dict:
    return load_yaml("teams.yaml")


def _team_keys(abbr: str, meta: dict) -> set[str]:
    keys = {merge_key(abbr), merge_key(meta.get("city", "")), merge_key(meta.get("nick", ""))}
    city, nick = meta.get("city", ""), meta.get("nick", "")
    if city and nick:
        keys.add(merge_key(f"{city} {nick}"))
    if meta.get("name"):
        keys.add(merge_key(str(meta["name"])))
    return {k for k in keys if k}


def match_dst(player: str, position: str | None, team: str | None, teams: dict) -> str | None:
    pos = normalize_pos(position)
    t = normalize_team(team, teams)
    key = merge_key(player)
    hits = [abbr for abbr, meta in teams.items() if key in _team_keys(abbr, meta)]
    if t and (pos == "DST" or t in hits or key == merge_key(t)):
        return f"{t}_DST"
    if len(hits) == 1 and (pos == "DST" or pos is None):
        return f"{hits[0]}_DST"
    return None


@dataclass
class MatchResult:
    player_id: str | None
    reason: str | None  # None = matched; unmatched | ambiguous | bad_status


def prepare_catalog(catalog: pl.DataFrame) -> pl.DataFrame:
    team = pl.col("latest_team").fill_null("").str.to_uppercase()
    for src, dst in TEAM_ALIASES.items():
        team = pl.when(team == src).then(pl.lit(dst)).otherwise(team)
    return catalog.with_columns(
        pl.col("merge_name").fill_null("").str.to_lowercase().alias("_mn"),
        pl.col("display_name").fill_null("").map_elements(merge_key, return_dtype=pl.Utf8).alias("_dn"),
        team.alias("_team"),
        pl.col("position").fill_null("").str.to_uppercase().alias("_pos"),
    )


def match_one(row: dict, catalog: pl.DataFrame, aliases: dict[str, str],
              teams: dict) -> MatchResult:
    player = str(row.get("player") or "").strip()
    if not player:
        return MatchResult(None, "unmatched")
    team = normalize_team(row.get("team"), teams)
    pos = normalize_pos(row.get("position"))

    if GSIS_RE.match(player):
        return MatchResult(player, None)

    key = merge_key(player)
    if key in aliases:
        return MatchResult(aliases[key], None)

    names = catalog if "_dn" in catalog.columns else prepare_catalog(catalog)
    hits = names.filter((pl.col("_mn") == key) | (pl.col("_dn") == key))
    if team:
        hits = hits.filter(pl.col("_team") == team)
    if pos and pos != "DST":
        hits = hits.filter(pl.col("_pos") == pos)

    ids = hits["gsis_id"].to_list() if not hits.is_empty() else []
    seen, uniq = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            uniq.append(i)
    if len(uniq) == 1:
        return MatchResult(uniq[0], None)
    if len(uniq) > 1:
        return MatchResult(None, "ambiguous")

    dst = match_dst(player, row.get("position"), row.get("team"), teams)
    if dst:
        return MatchResult(dst, None)
    return MatchResult(None, "unmatched")


def parse_overrides_csv(path: Path) -> list[dict]:
    df = pl.read_csv(path, infer_schema_length=None)
    cols = {c.lower().strip(): c for c in df.columns}
    need = "player"
    if need not in cols:
        raise ValueError("overrides CSV needs a player column")
    out = []
    for row in df.iter_rows(named=True):
        raw = {k.lower().strip(): v for k, v in row.items()}
        player = "" if raw.get("player") is None else str(raw["player"]).strip()
        if not player:
            continue
        status = ("" if raw.get("status") is None else str(raw["status"]).strip().lower())
        mult = raw.get("usage_multiplier")
        try:
            usage_multiplier = 1.0 if mult is None or str(mult).strip() == "" else float(mult)
        except (TypeError, ValueError):
            usage_multiplier = 1.0
        note = "" if raw.get("note") is None else str(raw["note"])
        team = None if raw.get("team") in (None, "") else str(raw["team"]).strip()
        position = None if raw.get("position") in (None, "") else str(raw["position"]).strip()
        out.append({
            "player": player, "status": status, "usage_multiplier": usage_multiplier,
            "note": note, "team": team, "position": position,
        })
    return out


def apply_overrides(rows: list[dict], catalog: pl.DataFrame, aliases: dict[str, str],
                    teams: dict) -> tuple[pl.DataFrame, list[dict]]:
    catalog = prepare_catalog(catalog)
    matched_rows, unmatched = [], []
    for row in rows:
        status = (row.get("status") or "").lower()
        if status not in STATUSES:
            unmatched.append({**row, "reason": "bad_status"})
            continue
        m = match_one(row, catalog, aliases, teams)
        if m.player_id is None:
            unmatched.append({**row, "reason": m.reason})
            continue
        matched_rows.append({
            "player_id": m.player_id,
            "status": status,
            "usage_multiplier": float(row.get("usage_multiplier") or 1.0),
            "note": row.get("note") or None,
        })
    schema = {"player_id": pl.Utf8, "status": pl.Utf8, "usage_multiplier": pl.Float64, "note": pl.Utf8}
    matched = pl.DataFrame(matched_rows, schema=schema) if matched_rows else pl.DataFrame(schema=schema)
    return matched, unmatched
