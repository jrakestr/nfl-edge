"""Run the GPP simulator against the current slate's staged files and optimizer CSV.

`sim cid file <iterations>` loads our lineups as the tournament entries, then
the tool's generate_field_lineups() fills the rest of the room (Field Size
minus ours) from projections + Own%. No extra flag or config key: main.py calls
generate_field_lineups() unconditionally, and it only no-ops when the room is
already full (Supplied lineups >= contest field size).
"""
from __future__ import annotations

import shutil
from pathlib import Path

from . import run_optimizer as opto
from .parse import parse_exposure_csv, parse_gpp_csv


def run(
    export_dir: Path,
    site: str = "dk",
    field: int = 20000,
    lineups_csv: Path | None = None,
    slate_rows: list[dict] | None = None,
    showdown: bool = False,
) -> dict:
    tools = opto.stage(export_dir, site)
    src = Path(lineups_csv) if lineups_csv else export_dir / "optimal_lineups.csv"
    if not src.exists():
        raise RuntimeError(f"no optimizer CSV at {src}")
    shutil.copy2(src, tools / f"{site}_data" / "tournament_lineups.csv")
    if showdown:
        opto._run(tools, [site, "sd_sim", "cid", "file", str(field)])
        gpp = opto._newest(tools, f"{site}_sd_sim_lineups_*.csv")
        exp = opto._newest(tools, f"{site}_sd_sim_player_exposure_*.csv")
    else:
        opto._run(tools, [site, "sim", "cid", "file", str(field)])
        gpp = opto._newest(tools, f"{site}_gpp_sim_lineups_*.csv")
        exp = opto._newest(tools, f"{site}_gpp_sim_player_exposure_*.csv")
    shutil.copy2(gpp, export_dir / "gpp_lineups.csv")
    shutil.copy2(exp, export_dir / "gpp_exposure.csv")
    return {
        "gpp_path": str(export_dir / "gpp_lineups.csv"),
        "exposure_path": str(export_dir / "gpp_exposure.csv"),
        "lineups": parse_gpp_csv(gpp),
        "exposure": parse_exposure_csv(exp, slate_rows or []),
    }
