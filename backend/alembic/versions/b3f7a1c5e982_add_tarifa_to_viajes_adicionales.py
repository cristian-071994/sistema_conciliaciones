"""add tarifa_tercero/tarifa_cliente/rentabilidad to viajes_adicionales_solicitud

Revision ID: b3f7a1c5e982
Revises: 4e8b6d2c9a17
Create Date: 2026-09-15 00:00:00.000000

El tercero debe ingresar tarifa_tercero antes de que Cointra pueda adjuntar
el manifiesto (regla de negocio validada en el router, no solo aquí).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3f7a1c5e982"
down_revision: Union[str, None] = "4e8b6d2c9a17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("viajes_adicionales_solicitud", sa.Column("tarifa_tercero", sa.Numeric(14, 2), nullable=True))
    op.add_column("viajes_adicionales_solicitud", sa.Column("tarifa_cliente", sa.Numeric(14, 2), nullable=True))
    op.add_column("viajes_adicionales_solicitud", sa.Column("rentabilidad", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("viajes_adicionales_solicitud", "rentabilidad")
    op.drop_column("viajes_adicionales_solicitud", "tarifa_cliente")
    op.drop_column("viajes_adicionales_solicitud", "tarifa_tercero")
