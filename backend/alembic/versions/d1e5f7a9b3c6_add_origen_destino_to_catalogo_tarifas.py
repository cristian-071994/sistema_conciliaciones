"""add origen/destino to catalogo_tarifas

Revision ID: d1e5f7a9b3c6
Revises: c8d4f2b6e173
Create Date: 2026-09-16 00:00:00.000000

Permite que el catálogo de tarifas guarde tarifas por RUTA (origen +
destino + tipo_vehiculo) para el servicio VIAJE_ADICIONAL, reutilizando la
misma tabla que ya usan el resto de servicios (origen/destino quedan NULL
para esos). La validación de duplicados por combinación vive en
api/routes/tarifas.py — Postgres no trata NULL=NULL como duplicado, así que
el UNIQUE constraint por sí solo no basta para el caso sin ruta.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1e5f7a9b3c6"
down_revision: Union[str, None] = "c8d4f2b6e173"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("catalogo_tarifas", sa.Column("origen", sa.String(length=255), nullable=True))
    op.add_column("catalogo_tarifas", sa.Column("destino", sa.String(length=255), nullable=True))
    op.drop_constraint("uq_catalogo_tarifa_servicio_tipo", "catalogo_tarifas", type_="unique")
    op.create_unique_constraint(
        "uq_catalogo_tarifa_servicio_tipo_ruta",
        "catalogo_tarifas",
        ["servicio_id", "tipo_vehiculo_id", "origen", "destino"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_catalogo_tarifa_servicio_tipo_ruta", "catalogo_tarifas", type_="unique")
    op.create_unique_constraint(
        "uq_catalogo_tarifa_servicio_tipo", "catalogo_tarifas", ["servicio_id", "tipo_vehiculo_id"]
    )
    op.drop_column("catalogo_tarifas", "destino")
    op.drop_column("catalogo_tarifas", "origen")
