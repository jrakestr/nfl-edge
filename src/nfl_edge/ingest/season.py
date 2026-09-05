"""Which seasons nflverse has published yet.

nflreadpy's season guard is date-based (a season "starts" the Thursday after Labor Day). Before
that date the weekly stats, snap counts, ff_opportunity, pbp and rosters_weekly for the new
season either raise or 404. Preseason rosters and depth charts are available. Every ingest
module consults `published` so a pre-kickoff `ingest --season 2026 --week 1` loads what exists
and says what it skipped; after kickoff the same call takes the normal path.
"""
from __future__ import annotations

from nflreadpy import utils_date


def current_season() -> int:
    return int(utils_date.most_recent_season())


def published(season: int) -> bool:
    return season <= current_season()


def split(seasons: list[int]) -> tuple[list[int], list[int]]:
    """(published, unpublished) preserving order."""
    return [s for s in seasons if published(s)], [s for s in seasons if not published(s)]


def skipped(unpublished: list[int], what: str) -> str:
    return f"skipped {what}: {unpublished} not published yet (nflverse current season {current_season()})"
