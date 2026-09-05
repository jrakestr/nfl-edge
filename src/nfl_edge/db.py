from __future__ import annotations
from contextlib import contextmanager
import polars as pl
import psycopg
from .config import database_url


@contextmanager
def conn():
    with psycopg.connect(database_url()) as c:
        yield c


def upsert(df: pl.DataFrame, table: str, key_cols: list[str]) -> int:
    """Idempotent upsert of a polars frame into `schema.table`."""
    if df.is_empty():
        return 0
    cols = df.columns
    placeholders = ",".join(["%s"] * len(cols))
    updates = ",".join(f"{c}=excluded.{c}" for c in cols if c not in key_cols)
    sql = (
        f"insert into {table} ({','.join(cols)}) values ({placeholders}) "
        f"on conflict ({','.join(key_cols)}) do update set {updates}"
    )
    rows = df.rows()
    with conn() as c, c.cursor() as cur:
        cur.executemany(sql, rows)
        c.commit()
    return len(rows)


def insert(df: pl.DataFrame, table: str) -> int:
    if df.is_empty():
        return 0
    cols = df.columns
    sql = f"insert into {table} ({','.join(cols)}) values ({','.join(['%s']*len(cols))})"
    with conn() as c, c.cursor() as cur:
        cur.executemany(sql, df.rows())
        c.commit()
    return df.height
