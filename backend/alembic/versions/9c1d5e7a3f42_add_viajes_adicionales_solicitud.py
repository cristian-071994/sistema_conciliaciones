"""add viajes_adicionales_solicitud and manifiestos_viaje_adicional

Revision ID: 9c1d5e7a3f42
Revises: 7a2f9c4e6b81
Create Date: 2026-09-15 00:00:00.000000

Módulo de solicitud de viajes adicionales (cliente, web + app móvil) y su
manifiesto PDF adjunto. No toca ninguna tabla existente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "9c1d5e7a3f42"
down_revision: Union[str, None] = "7a2f9c4e6b81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "viajes_adicionales_solicitud",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("operacion_id", sa.Integer(), nullable=False),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("vehiculo_id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("fecha_viaje", sa.Date(), nullable=False),
        sa.Column("origen", sa.String(length=255), nullable=False),
        sa.Column("destino", sa.String(length=255), nullable=False),
        sa.Column("producto", sa.String(length=255), nullable=False),
        sa.Column("observaciones", sa.Text(), nullable=True),
        # Reusa el tipo enum "itemestado" ya creado en la migración baseline
        # (ConciliacionItem.estado) -- create_type=False evita recrearlo.
        sa.Column(
            "estado",
            postgresql.ENUM(
                "PENDIENTE", "EN_REVISION", "APROBADO", "RECHAZADO", name="itemestado", create_type=False
            ),
            nullable=False,
            server_default="PENDIENTE",
        ),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["operacion_id"], ["operaciones.id"]),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"]),
        sa.ForeignKeyConstraint(["vehiculo_id"], ["vehiculos.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_viajes_adicionales_solicitud_id", "viajes_adicionales_solicitud", ["id"], unique=False
    )
    op.create_index(
        "ix_viajes_adicionales_solicitud_operacion_id",
        "viajes_adicionales_solicitud",
        ["operacion_id"],
        unique=False,
    )
    op.create_index(
        "ix_viajes_adicionales_solicitud_cliente_id",
        "viajes_adicionales_solicitud",
        ["cliente_id"],
        unique=False,
    )
    op.create_index(
        "ix_viajes_adicionales_solicitud_fecha_viaje",
        "viajes_adicionales_solicitud",
        ["fecha_viaje"],
        unique=False,
    )
    op.create_index(
        "ix_viajes_adicionales_solicitud_estado", "viajes_adicionales_solicitud", ["estado"], unique=False
    )

    op.create_table(
        "manifiestos_viaje_adicional",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("solicitud_id", sa.Integer(), nullable=False),
        sa.Column("numero_manifiesto", sa.String(length=100), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False, server_default="application/pdf"),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["solicitud_id"], ["viajes_adicionales_solicitud.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("solicitud_id"),
    )
    op.create_index(
        "ix_manifiestos_viaje_adicional_id", "manifiestos_viaje_adicional", ["id"], unique=False
    )
    op.create_index(
        "ix_manifiestos_viaje_adicional_numero_manifiesto",
        "manifiestos_viaje_adicional",
        ["numero_manifiesto"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_manifiestos_viaje_adicional_numero_manifiesto", table_name="manifiestos_viaje_adicional")
    op.drop_index("ix_manifiestos_viaje_adicional_id", table_name="manifiestos_viaje_adicional")
    op.drop_table("manifiestos_viaje_adicional")

    op.drop_index("ix_viajes_adicionales_solicitud_estado", table_name="viajes_adicionales_solicitud")
    op.drop_index("ix_viajes_adicionales_solicitud_fecha_viaje", table_name="viajes_adicionales_solicitud")
    op.drop_index("ix_viajes_adicionales_solicitud_cliente_id", table_name="viajes_adicionales_solicitud")
    op.drop_index("ix_viajes_adicionales_solicitud_operacion_id", table_name="viajes_adicionales_solicitud")
    op.drop_index("ix_viajes_adicionales_solicitud_id", table_name="viajes_adicionales_solicitud")
    op.drop_table("viajes_adicionales_solicitud")
