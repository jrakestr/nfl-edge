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
    return Path(os.environ.get("NFL_DFS_TOOLS_PATH", ROOT.parent / "NFL-DFS-Tools")).resolve()
