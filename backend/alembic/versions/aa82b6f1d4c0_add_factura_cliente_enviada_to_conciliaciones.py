"""add factura_cliente_enviada to conciliaciones

Revision ID: aa82b6f1d4c0
Revises: d9c3a1b2e7f4
Create Date: 2026-03-30 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "aa82b6f1d4c0"
down_revision = "d9c3a1b2e7f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conciliaciones",
        sa.Column("factura_cliente_enviada", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("conciliaciones", "factura_cliente_enviada")
