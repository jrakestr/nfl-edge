"""Post-DFS build automatic sync for `/research`:
1. Refresh `model.research_fields` for `(season, week)` (strictly as-of `week < W`).
2. Pull latest `raw.fantasypros_news` if `FANTASY_PROS_API_KEY` is present and last pull is > 15 min old.
3. Run `nfl-edge research audit` for `(season, week, site, slate)` if `TYPESAFE` / `TYPESAFE_API_KEY` is present.

Every step is soft (display/audit only) so a missing key, rate limit, or network blip never fails
or rolls back the persisted DFS lineups. Lives in `research/` so `dfs/` stays completely isolated.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from ..config import fantasypros_api_key, typesafe_api_key

NEWS_COOLDOWN = timedelta(minutes=15)


def _has_fp_key() -> bool:
    try:
        return bool(fantasypros_api_key().strip())
    except RuntimeError:
        return False


def _has_typesafe_key() -> bool:
    try:
        return bool(typesafe_api_key().strip())
    except RuntimeError:
        return False


def should_pull_news(latest_seen: datetime | None, now: datetime) -> bool:
    """True when no news has been pulled in the last 15 minutes."""
    if latest_seen is None:
        return True
    seen_utc = latest_seen if latest_seen.tzinfo is not None else latest_seen.replace(tzinfo=UTC)
    now_utc = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
    return (now_utc - seen_utc) >= NEWS_COOLDOWN


def latest_news_seen() -> datetime | None:
    from ..db import read_sql

    df = read_sql("select max(first_seen_at) as ts from raw.fantasypros_news")
    if df.is_empty():
        return None
    val = df[0, "ts"]
    return val if isinstance(val, datetime) else None


def run_post_dfs_sync(
    season: int,
    week: int,
    site: str = "dk",
    slate: str = "main",
    now: datetime | None = None,
) -> dict[str, Any]:
    """Refresh research fields, news, and Jev lineup audit after a DFS build."""
    now_utc = now or datetime.now(UTC)
    report: dict[str, Any] = {
        "fields_rows": None,
        "fields_error": None,
        "news_written": None,
        "news_skipped": None,
        "audit": None,
        "audit_error": None,
    }

    # 1. Rebuild model.research_fields so /research is populated and current for (season, week).
    try:
        from . import fields as F

        report["fields_rows"] = F.run(season, week)
    except (RuntimeError, ValueError, OSError) as e:
        report["fields_error"] = str(e)

    # 2. Pull latest FantasyPros news if key is configured and outside cooldown window.
    if not _has_fp_key():
        report["news_skipped"] = "no FANTASY_PROS_API_KEY"
    else:
        try:
            last_ts = latest_news_seen()
            if should_pull_news(last_ts, now_utc):
                from ..ingest import fantasypros_news as fpn

                nr = fpn.run(limit=100)
                report["news_written"] = nr["written"]
            else:
                report["news_skipped"] = "recent pull (<15m)"
        except (RuntimeError, ValueError, OSError) as e:
            report["news_skipped"] = f"error: {e}"

    # 3. Run Jev lineup audit for this slate (cached player states cost $0 / 0 calls).
    if not _has_typesafe_key():
        report["audit_error"] = "no TYPESAFE_API_KEY"
    else:
        try:
            from . import audit as A

            report["audit"] = A.run_audit(season=season, week=week, slate=slate, site=site)
        except (RuntimeError, ValueError, OSError) as e:
            report["audit_error"] = str(e)

    return report
