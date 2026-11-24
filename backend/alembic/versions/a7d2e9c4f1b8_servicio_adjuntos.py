"""adjuntos (PDF/imagen) en servicios cargados

Revision ID: a7d2e9c4f1b8
Revises: f3a9c1d5b7e2
Create Date: 2026-11-23 00:00:00.000000

- servicios.permite_adjuntos: cada tipo de servicio decide si sus servicios
  cargados admiten hasta 3 soportes. Se activa de entrada para Descargue y
  Viáticos; el resto se activa desde la pantalla Servicios.
- servicio_adjuntos: los archivos (hasta 3 por servicio cargado), en BD.
Solo agrega: no modifica ni borra datos existentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7d2e9c4f1b8"
down_revision: Union[str, None] = "f3a9c1d5b7e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "servicios",
        sa.Column("permite_adjuntos", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("servicios", "permite_adjuntos", server_default=None)
    op.execute("UPDATE servicios SET permite_adjuntos = true WHERE codigo IN ('DESCARGUE', 'VIATICOS')")

    op.create_table(
        "servicio_adjuntos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("viaje_id", sa.Integer(), sa.ForeignKey("viajes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_servicio_adjuntos_id", "servicio_adjuntos", ["id"])
    op.create_index("ix_servicio_adjuntos_viaje_id", "servicio_adjuntos", ["viaje_id"])


def downgrade() -> None:
    op.drop_index("ix_servicio_adjuntos_viaje_id", table_name="servicio_adjuntos")
    op.drop_index("ix_servicio_adjuntos_id", table_name="servicio_adjuntos")
    op.drop_table("servicio_adjuntos")
    op.drop_column("servicios", "permite_adjuntos")
