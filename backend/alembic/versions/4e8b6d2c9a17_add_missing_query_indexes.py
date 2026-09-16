"""add missing indexes on columns used constantly in filters

Revision ID: 4e8b6d2c9a17
Revises: 9c1d5e7a3f42
Create Date: 2026-09-15 00:00:00.000000

Auditoría detectó que viajes, conciliacion_items, conciliaciones e
historial_cambios solo tenían índice en "id" (más los UNIQUE existentes),
pese a que sus FKs y columnas de estado/fecha se filtran constantemente en
viajes.py, dashboard.py y conciliaciones_*.py. Migración solo de índices —
no cambia ningún dato ni estructura de columnas, reversible sin riesgo.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4e8b6d2c9a17"
down_revision: Union[str, None] = "9c1d5e7a3f42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES = [
    ("ix_viajes_operacion_id", "viajes", ["operacion_id"]),
    ("ix_viajes_tercero_id", "viajes", ["tercero_id"]),
    ("ix_viajes_conciliacion_id", "viajes", ["conciliacion_id"]),
    ("ix_viajes_fecha_servicio", "viajes", ["fecha_servicio"]),
    ("ix_viajes_activo", "viajes", ["activo"]),
    ("ix_conciliacion_items_conciliacion_id", "conciliacion_items", ["conciliacion_id"]),
    ("ix_conciliacion_items_viaje_id", "conciliacion_items", ["viaje_id"]),
    ("ix_conciliacion_items_estado", "conciliacion_items", ["estado"]),
    ("ix_conciliacion_items_fecha_servicio", "conciliacion_items", ["fecha_servicio"]),
    ("ix_conciliacion_items_placa", "conciliacion_items", ["placa"]),
    ("ix_conciliaciones_operacion_id", "conciliaciones", ["operacion_id"]),
    ("ix_conciliaciones_estado", "conciliaciones", ["estado"]),
    ("ix_conciliaciones_activo", "conciliaciones", ["activo"]),
    ("ix_historial_cambios_conciliacion_id", "historial_cambios", ["conciliacion_id"]),
    ("ix_historial_cambios_item_id", "historial_cambios", ["item_id"]),
]


def upgrade() -> None:
    for index_name, table_name, columns in INDEXES:
        op.create_index(index_name, table_name, columns, unique=False)


def downgrade() -> None:
    for index_name, table_name, _columns in reversed(INDEXES):
        op.drop_index(index_name, table_name=table_name)
