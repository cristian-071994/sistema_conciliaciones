"""Limpiar manifiestos 0524238, 0524300, 0524407 de conciliacion_items."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.sqlalchemy_database_url)

manifiestos = ["0524238", "0524300", "0524407"]

with engine.begin() as conn:
    # 1. Ver estado actual
    rows = conn.execute(
        text("SELECT id, conciliacion_id, viaje_id, manifiesto_numero, placa FROM conciliacion_items WHERE manifiesto_numero = ANY(:m)"),
        {"m": manifiestos},
    ).fetchall()
    print("=== ANTES: conciliacion_items con esos manifiestos ===")
    for r in rows:
        print(r)

    # 2. Limpiar manifiesto_numero
    result = conn.execute(
        text("UPDATE conciliacion_items SET manifiesto_numero = NULL WHERE manifiesto_numero = ANY(:m)"),
        {"m": manifiestos},
    )
    print(f"\n>>> Se limpiaron {result.rowcount} registros en conciliacion_items")

    # 3. Verificar
    rows_after = conn.execute(
        text("SELECT id, conciliacion_id, viaje_id, manifiesto_numero, placa FROM conciliacion_items WHERE id = ANY(:ids)"),
        {"ids": [r[0] for r in rows]},
    ).fetchall()
    print("\n=== DESPUES ===")
    for r in rows_after:
        print(r)

print("\nListo.")
