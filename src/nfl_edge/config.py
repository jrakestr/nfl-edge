from __future__ import annotations
import os
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


def dfs_tools_path() -> Path:
    return Path(os.environ.get("NFL_DFS_TOOLS_PATH", ROOT.parent / "NFL-DFS-Tools")).resolve()
