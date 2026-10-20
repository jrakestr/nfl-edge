from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()
ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"


def load_yaml(name: str) -> dict:
    with open(CONFIG_DIR / name) as f:
        return yaml.safe_load(f)


def dfs_settings() -> dict:
    """The `dfs:` block of config/sim.yaml: field_size, iterations, max_minutes."""
    d = load_yaml("sim.yaml").get("dfs") or {}
    return {
        "field_size": int(d.get("field_size", 3000)),
        "iterations": int(d.get("iterations", 5000)),
        "max_minutes": float(d.get("max_minutes", 3)),
        "role_min_offense_pct": float(d.get("role_min_offense_pct", 0.10)),
        "role_games": int(d.get("role_games", 3)),
    }


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set (see .env.example)")
    return url


def odds_api_key() -> str:
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        raise RuntimeError("ODDS_API_KEY not set (see .env.example)")
    return key


def fantasypros_api_key() -> str:
    key = os.environ.get("FANTASY_PROS_API_KEY")
    if not key:
        raise RuntimeError("FANTASY_PROS_API_KEY not set (see .env.example)")
    return key


def espn_credentials() -> tuple[str, str]:
    """(espn_s2, swid) browser cookies for the private ESPN league. Never printed or logged."""
    s2, swid = os.environ.get("ESPN_S2"), os.environ.get("ESPN_SWID")
    for name, val in (("ESPN_S2", s2), ("ESPN_SWID", swid)):
        if not val:
            raise RuntimeError(f"{name} not set (see .env.example)")
    return s2, swid


def line_reference() -> dict:
    cfg = load_yaml("line_reference.yaml")
    raw = cfg["effective_from"]
    if isinstance(raw, datetime):
        effective = raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    else:
        text = str(raw)
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        effective = datetime.fromisoformat(text)
    return {
        "source": cfg["source"],
        "bookmaker": cfg["bookmaker"],
        "fallback_source": cfg["fallback_source"],
        "effective_from": effective,
    }


def dfs_tools_path() -> Path:
    """Vendored copy under vendor/; NFL_DFS_TOOLS_PATH still points at another checkout."""
    return Path(os.environ.get("NFL_DFS_TOOLS_PATH", ROOT / "vendor" / "NFL-DFS-Tools")).resolve()
