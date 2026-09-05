"""Apply db/migrations/*.sql in filename order, recording each in model._migrations."""
from __future__ import annotations

import hashlib
from pathlib import Path

from .config import ROOT
from .db import conn

MIGRATIONS_DIR = ROOT / "db" / "migrations"

_BOOTSTRAP = """
create schema if not exists model;
create table if not exists model._migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz default now()
);
"""


def pending() -> list[Path]:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    with conn() as c, c.cursor() as cur:
        cur.execute(_BOOTSTRAP)
        c.commit()
        cur.execute("select name from model._migrations")
        done = {r[0] for r in cur.fetchall()}
    return [f for f in files if f.name not in done]


def apply(dry_run: bool = False) -> list[str]:
    applied: list[str] = []
    for path in pending():
        sql = path.read_text()
        digest = hashlib.sha256(sql.encode()).hexdigest()
        if dry_run:
            applied.append(f"(dry) {path.name}")
            continue
        with conn() as c, c.cursor() as cur:
            cur.execute(sql)
            cur.execute(
                "insert into model._migrations (name, sha256) values (%s, %s)",
                (path.name, digest),
            )
            c.commit()
        applied.append(path.name)
    return applied
