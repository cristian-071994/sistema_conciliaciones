"""add viaje_id to viajes_adicionales_solicitud

Revision ID: c8d4f2b6e173
Revises: b3f7a1c5e982
Create Date: 2026-09-15 00:00:00.000000

Vincula la solicitud con el Viaje (servicio "Viaje Adicional") que se crea
automáticamente al subir el manifiesto — así entra al flujo normal de
conciliación igual que un viaje cargado directamente por Tercero/Cointra.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8d4f2b6e173"
down_revision: Union[str, None] = "b3f7a1c5e982"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("viajes_adicionales_solicitud", sa.Column("viaje_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_viajes_adicionales_solicitud_viaje_id",
        "viajes_adicionales_solicitud",
        "viajes",
        ["viaje_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_viajes_adicionales_solicitud_viaje_id", "viajes_adicionales_solicitud", ["viaje_id"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_viajes_adicionales_solicitud_viaje_id", "viajes_adicionales_solicitud", type_="unique"
    )
    op.drop_constraint(
        "fk_viajes_adicionales_solicitud_viaje_id", "viajes_adicionales_solicitud", type_="foreignkey"
    )
    op.drop_column("viajes_adicionales_solicitud", "viaje_id")
