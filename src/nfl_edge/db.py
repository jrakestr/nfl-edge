from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import polars as pl
import psycopg
from psycopg.types.json import Jsonb

from .config import database_url


@contextmanager
def conn() -> Iterator[psycopg.Connection]:
    try:
        c = psycopg.connect(database_url())
    except psycopg.OperationalError as e:
        # Never surface the DSN (it carries the password). Keep only the error class.
        raise RuntimeError(
            "could not connect using DATABASE_URL "
            f"({type(e).__name__}); check host reachability and that the password "
            "is percent-encoded"
        ) from None
    with c:
        yield c


def _rows(df: pl.DataFrame) -> list[tuple[Any, ...]]:
    """Convert a frame to psycopg-ready tuples. Struct/dict columns become jsonb."""
    out = []
    struct_cols = {c for c, t in zip(df.columns, df.dtypes) if isinstance(t, pl.Struct)}
    for row in df.iter_rows(named=True):
        vals = []
        for c in df.columns:
            v = row[c]
            if c in struct_cols or isinstance(v, dict):
                vals.append(Jsonb(v))
            elif isinstance(v, str) and c == "stats":
                vals.append(Jsonb(json.loads(v)))
            else:
                vals.append(v)
        out.append(tuple(vals))
    return out


def upsert(df: pl.DataFrame, table: str, key_cols: list[str]) -> int:
    """Idempotent upsert of a polars frame into `schema.table`."""
    if df.is_empty():
        return 0
    cols = df.columns
    placeholders = ",".join(["%s"] * len(cols))
    updates = ",".join(f"{c}=excluded.{c}" for c in cols if c not in key_cols)
    action = f"do update set {updates}" if updates else "do nothing"
    sql = (
        f"insert into {table} ({','.join(cols)}) values ({placeholders}) "
        f"on conflict ({','.join(key_cols)}) {action}"
    )
    rows = _rows(df)
    with conn() as c, c.cursor() as cur:
        cur.executemany(sql, rows)
        c.commit()
    return len(rows)


def insert(df: pl.DataFrame, table: str) -> int:
    if df.is_empty():
        return 0
    cols = df.columns
    sql = f"insert into {table} ({','.join(cols)}) values ({','.join(['%s'] * len(cols))})"
    with conn() as c, c.cursor() as cur:
        cur.executemany(sql, _rows(df))
        c.commit()
    return df.height


def insert_ignore(df: pl.DataFrame, table: str) -> int:
    """Insert, skipping rows that violate any unique constraint/index. Returns rows inserted."""
    if df.is_empty():
        return 0
    cols = df.columns
    sql = (
        f"insert into {table} ({','.join(cols)}) values ({','.join(['%s'] * len(cols))}) "
        "on conflict do nothing"
    )
    inserted = 0
    with conn() as c, c.cursor() as cur:
        for row in _rows(df):
            cur.execute(sql, row)
            inserted += cur.rowcount
        c.commit()
    return inserted


def read_sql(sql: str, params: tuple | dict | None = None) -> pl.DataFrame:
    """Run a query and return a polars frame."""
    with conn() as c, c.cursor() as cur:
        cur.execute(sql, params)
        cols = [d.name for d in cur.description]
        data = cur.fetchall()
    if not data:
        return pl.DataFrame(schema={c: pl.Null for c in cols})
    return pl.DataFrame([dict(zip(cols, r)) for r in data], infer_schema_length=None)


def execute(sql: str, params: tuple | dict | None = None) -> int:
    with conn() as c, c.cursor() as cur:
        cur.execute(sql, params)
        c.commit()
        return cur.rowcount


def table_counts() -> pl.DataFrame:
    """Row counts per raw/model table, split by season where the table has one."""
    tables = read_sql(
        """
        select table_schema, table_name,
               bool_or(column_name = 'season') as has_season
        from information_schema.columns
        where table_schema in ('raw', 'model')
        group by 1, 2 order by 1, 2
        """
    )
    frames = []
    for schema, name, has_season in tables.iter_rows():
        fq = f"{schema}.{name}"
        if has_season:
            q = f"select {fq!r}::text as table, season::text as season, count(*) as rows from {fq} group by season order by season"
        else:
            q = f"select {fq!r}::text as table, 'all' as season, count(*) as rows from {fq}"
        frames.append(read_sql(q).cast({"rows": pl.Int64}))
    return pl.concat([f for f in frames if not f.is_empty()], how="vertical_relaxed")
