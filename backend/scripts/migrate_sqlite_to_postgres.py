from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
import os
from pathlib import Path
import sys

from sqlalchemy import MetaData, Table, create_engine, inspect, text
from sqlalchemy.engine import Engine

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings


@dataclass
class MigrationStats:
    table: str
    rows: int


def _load_tables(engine: Engine) -> tuple[MetaData, list[Table]]:
    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata, list(metadata.sorted_tables)


def _truncate_target_tables(target_engine: Engine, tables: Iterable[Table]) -> None:
    with target_engine.begin() as conn:
        conn.execute(text("SET session_replication_role = replica;"))
        try:
            for table in reversed(list(tables)):
                conn.execute(text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE;'))
        finally:
            conn.execute(text("SET session_replication_role = DEFAULT;"))


def _copy_table_data(source_engine: Engine, target_engine: Engine, source_table: Table, target_table: Table) -> int:
    with source_engine.connect() as source_conn, target_engine.begin() as target_conn:
        target_conn.execute(text("SET session_replication_role = replica;"))
        rows = source_conn.execute(text(f'SELECT * FROM "{source_table.name}"')).mappings().all()
        try:
            if not rows:
                return 0
            payload = [dict(row) for row in rows]
            target_conn.execute(target_table.insert(), payload)
            return len(payload)
        finally:
            target_conn.execute(text("SET session_replication_role = DEFAULT;"))


def _reset_sequences(target_engine: Engine) -> None:
    sql = text(
        """
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN
                SELECT
                    c.relname AS sequence_name,
                    t.relname AS table_name,
                    a.attname AS column_name
                FROM pg_class c
                JOIN pg_depend d ON d.objid = c.oid
                JOIN pg_class t ON d.refobjid = t.oid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
                WHERE c.relkind = 'S'
            LOOP
                EXECUTE format(
                    'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 1), true)',
                    r.sequence_name,
                    r.column_name,
                    r.table_name
                );
            END LOOP;
        END;
        $$;
        """
    )
    with target_engine.begin() as conn:
        conn.execute(sql)


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    default_sqlite = project_root / "cointra.db"

    sqlite_url = os.getenv("SQLITE_SOURCE_URL", f"sqlite:///{default_sqlite.as_posix()}")
    postgres_url = os.getenv("POSTGRES_TARGET_URL", settings.sqlalchemy_database_url)

    source_engine = create_engine(sqlite_url)
    target_engine = create_engine(postgres_url)

    _, source_tables = _load_tables(source_engine)
    _, target_tables = _load_tables(target_engine)
    target_tables_by_name = {table.name: table for table in target_tables}
    target_inspector = inspect(target_engine)

    missing = [table.name for table in source_tables if not target_inspector.has_table(table.name)]
    if missing:
        missing_text = ", ".join(missing)
        raise RuntimeError(
            "PostgreSQL no tiene el esquema completo. Ejecuta 'alembic upgrade head' primero. "
            f"Tablas faltantes: {missing_text}"
        )

    _truncate_target_tables(target_engine, source_tables)

    stats: list[MigrationStats] = []
    for table in source_tables:
        target_table = target_tables_by_name.get(table.name)
        if target_table is None:
            continue
        rows = _copy_table_data(source_engine, target_engine, table, target_table)
        stats.append(MigrationStats(table=table.name, rows=rows))

    _reset_sequences(target_engine)

    total = sum(item.rows for item in stats)
    print("Migracion completada SQLite -> PostgreSQL")
    print(f"Total filas copiadas: {total}")
    for item in stats:
        print(f"- {item.table}: {item.rows}")


if __name__ == "__main__":
    main()
