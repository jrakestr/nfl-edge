"""Stage a slate working dir into NFL-DFS-Tools and run the classic optimizer."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from ..config import dfs_tools_path
from .parse import parse_opto_csv

_TIMEDELTA_STUB = '"""Unused import in nfl_optimizer.py; lets the module load on macOS."""\n'


def _tools() -> Path:
    p = dfs_tools_path()
    if not p.is_dir():
        raise RuntimeError(f"NFL-DFS-Tools not found at {p}; clone jrakestr/NFL-DFS-Tools")
    return p


def stage(export_dir: Path, site: str = "dk") -> Path:
    """Copy this slate's files only into the tool's {site}_data/. Overwrites prior slate."""
    tools = _tools()
    data = tools / f"{site}_data"
    data.mkdir(parents=True, exist_ok=True)
    for name in ("projections.csv", "player_ids.csv", "contest_structure.csv", "config.json"):
        src = export_dir / name
        if src.exists():
            dest = tools / "config.json" if name == "config.json" else data / name
            shutil.copy2(src, dest)
    stub = tools / "src" / "timedelta.py"
    if not stub.exists():
        stub.write_text(_TIMEDELTA_STUB)
    (tools / "output").mkdir(exist_ok=True)
    return tools


def _ensure_native_cbc(tools: Path) -> None:
    """PuLP ships an x86_64 osx/i64/cbc; Apple Silicon needs Homebrew `cbc`."""
    brew = shutil.which("cbc")
    if not brew:
        return
    native = Path(brew).resolve()
    for cbc in tools.glob(".venv/lib/python*/site-packages/pulp/solverdir/cbc/osx/i64/cbc"):
        if cbc.resolve() != native:
            cbc.unlink()
            cbc.symlink_to(native)


def _run(tools: Path, args: list[str]) -> None:
    _ensure_native_cbc(tools)
    uv = shutil.which("uv")
    if uv:
        cmd = [uv, "run", "src/main.py", *args]
    else:
        cmd = ["python3", "src/main.py", *args]
    subprocess.run(cmd, cwd=tools, check=True)


def _newest(tools: Path, prefix: str) -> Path:
    files = sorted((tools / "output").glob(prefix), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise RuntimeError(f"no {prefix} in {tools / 'output'}")
    return files[0]


def run(export_dir: Path, site: str = "dk", lineups: int = 150, uniques: int = 1,
        showdown: bool = False) -> dict:
    tools = stage(export_dir, site)
    if showdown:
        _run(tools, [site, "sd_opto", str(lineups), str(uniques)])
        out = _newest(tools, f"{site}_sd_optimal_lineups_*.csv")
    else:
        _run(tools, [site, "opto", str(lineups), str(uniques)])
        out = _newest(tools, f"{site}_optimal_lineups_*.csv")
    shutil.copy2(out, export_dir / "optimal_lineups.csv")
    parsed = parse_opto_csv(out)
    return {"path": str(export_dir / "optimal_lineups.csv"), "lineups": parsed, "n": len(parsed)}
