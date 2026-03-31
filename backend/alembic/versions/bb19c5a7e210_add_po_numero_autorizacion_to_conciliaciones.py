"""add po_numero_autorizacion to conciliaciones

Revision ID: bb19c5a7e210
Revises: aa82b6f1d4c0
Create Date: 2026-03-30 18:45:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "bb19c5a7e210"
down_revision = "aa82b6f1d4c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conciliaciones",
        sa.Column("po_numero_autorizacion", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conciliaciones", "po_numero_autorizacion")
