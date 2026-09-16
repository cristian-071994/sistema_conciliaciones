"""add activo to roles

Revision ID: e2b4a6c8d0f1
Revises: d1e5f7a9b3c6
Create Date: 2026-09-17 00:00:00.000000

Permite crear roles adicionales a los 4 base (COINTRA_ADMIN, COINTRA_USER,
CLIENTE, TERCERO) desde el panel de Roles y Permisos, y desactivarlos sin
borrarlos — mismo patrón de soft-delete que el resto del sistema. Los roles
con es_sistema=True (los 4 base) no se pueden desactivar (ver
api/routes/roles.py), así que en la práctica este campo solo aplica a roles
creados manualmente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2b4a6c8d0f1"
down_revision: Union[str, None] = "d1e5f7a9b3c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "roles",
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("roles", "activo", server_default=None)


def downgrade() -> None:
    op.drop_column("roles", "activo")
