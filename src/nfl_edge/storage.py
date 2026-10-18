"""Private Supabase Storage for the files a cloud run needs and the Mac used to hold.

Bucket `salary-files`: `{season}/wk{WW}/DKSalaries_{season}_wk{WW}_{slate}.csv`
Bucket `draws`:        `{season}/{week}/{run_id}/{game_id}[.game].parquet`

Server-side only: SUPABASE_URL + SUPABASE_SERVICE_KEY. Never NEXT_PUBLIC_, never the browser.
Request URLs carry no key (headers only), and nothing here prints a header.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import httpx

from .config import DATA_DIR

SALARY_BUCKET = "salary-files"
DRAWS_BUCKET = "draws"
DRAWS_ROOT = DATA_DIR / "draws"


class StorageError(RuntimeError):
    pass


def _base() -> tuple[str, dict]:
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    if not url or not key:
        raise StorageError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (server-side only)")
    headers = {"apikey": key}
    if key.startswith("eyJ"):  # legacy JWT service_role key; new sb_secret_ keys use apikey only
        headers["Authorization"] = f"Bearer {key}"
    return f"{url}/storage/v1", headers


def _check(r: httpx.Response, what: str) -> None:
    if r.status_code >= 400:
        # Body is Storage's JSON error; it never echoes the key.
        raise StorageError(f"{what}: HTTP {r.status_code} {r.text[:200]}")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_bucket(client: httpx.Client, base: str, headers: dict, bucket: str) -> None:
    r = client.get(f"{base}/bucket/{bucket}", headers=headers)
    if r.status_code == 200:
        if r.json().get("public"):
            raise StorageError(f"bucket {bucket} is public; make it private before use")
        return
    r = client.post(f"{base}/bucket", headers=headers,
                    json={"id": bucket, "name": bucket, "public": False})
    if r.status_code == 409 or "already exists" in r.text:
        return
    _check(r, f"create bucket {bucket}")


def list_objects(client: httpx.Client, base: str, headers: dict, bucket: str,
                 prefix: str) -> list[str]:
    r = client.post(f"{base}/object/list/{bucket}", headers=headers,
                    json={"prefix": prefix, "limit": 1000, "offset": 0})
    _check(r, f"list {bucket}/{prefix}")
    return [o["name"] for o in r.json() if o.get("id")]  # folders have no id


def upload(client: httpx.Client, base: str, headers: dict, bucket: str, key: str,
           path: Path, content_type: str) -> None:
    r = client.post(f"{base}/object/{bucket}/{key}", content=path.read_bytes(),
                    headers={**headers, "content-type": content_type, "x-upsert": "true"})
    _check(r, f"upload {bucket}/{key}")


def download(client: httpx.Client, base: str, headers: dict, bucket: str, key: str,
             dest: Path) -> None:
    r = client.get(f"{base}/object/authenticated/{bucket}/{key}", headers=headers)
    _check(r, f"download {bucket}/{key}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)


def _salary_prefix(season: int, week: int) -> str:
    return f"{season}/wk{week:02d}"


def push_salaries(season: int, week: int) -> list[tuple[str, str]]:
    """Upload every local DKSalaries_{season}_wk{WW}_*.csv. Returns (file name, sha256)."""
    files = sorted((DATA_DIR / "dk").glob(f"DKSalaries_{season}_wk{week:02d}_*.csv"))
    if not files:
        raise StorageError(f"no data/dk/DKSalaries_{season}_wk{week:02d}_<slate>.csv to push")
    base, headers = _base()
    out = []
    with httpx.Client(timeout=120) as c:
        ensure_bucket(c, base, headers, SALARY_BUCKET)
        for f in files:
            upload(c, base, headers, SALARY_BUCKET, f"{_salary_prefix(season, week)}/{f.name}",
                   f, "text/csv")
            out.append((f.name, sha256(f)))
    return out


def pull_salaries(season: int, week: int) -> list[tuple[str, str]]:
    """Download the week's salary files into data/dk/. Returns (file name, sha256)."""
    base, headers = _base()
    prefix = _salary_prefix(season, week)
    out = []
    with httpx.Client(timeout=120) as c:
        ensure_bucket(c, base, headers, SALARY_BUCKET)
        names = [n for n in list_objects(c, base, headers, SALARY_BUCKET, prefix)
                 if n.startswith(f"DKSalaries_{season}_wk{week:02d}_") and n.endswith(".csv")]
        for name in sorted(names):
            dest = DATA_DIR / "dk" / name
            download(c, base, headers, SALARY_BUCKET, f"{prefix}/{name}", dest)
            out.append((name, sha256(dest)))
    return out


def push_draws(season: int, week: int, run_id: str) -> int:
    """Upload a run's parquet files that Storage does not have yet. Returns files uploaded."""
    folder = DRAWS_ROOT / str(season) / str(week) / run_id
    files = sorted(folder.glob("*.parquet"))
    if not files:
        raise StorageError(f"no draws on disk for run {run_id} at data/draws/{season}/{week}/")
    base, headers = _base()
    prefix = f"{season}/{week}/{run_id}"
    with httpx.Client(timeout=300) as c:
        ensure_bucket(c, base, headers, DRAWS_BUCKET)
        have = set(list_objects(c, base, headers, DRAWS_BUCKET, prefix))
        todo = [f for f in files if f.name not in have]
        for f in todo:
            upload(c, base, headers, DRAWS_BUCKET, f"{prefix}/{f.name}", f,
                   "application/octet-stream")
    return len(todo)


def pull_draws(season: int, week: int, run_id: str) -> int:
    """Download a run's parquet files missing on disk. Returns files downloaded."""
    folder = DRAWS_ROOT / str(season) / str(week) / run_id
    base, headers = _base()
    prefix = f"{season}/{week}/{run_id}"
    with httpx.Client(timeout=300) as c:
        ensure_bucket(c, base, headers, DRAWS_BUCKET)
        names = list_objects(c, base, headers, DRAWS_BUCKET, prefix)
        if not names:
            raise StorageError(f"Storage has no draws for run {run_id}; push them from where the sim ran")
        todo = [n for n in names if not (folder / n).is_file()]
        for n in todo:
            download(c, base, headers, DRAWS_BUCKET, f"{prefix}/{n}", folder / n)
    return len(todo)
