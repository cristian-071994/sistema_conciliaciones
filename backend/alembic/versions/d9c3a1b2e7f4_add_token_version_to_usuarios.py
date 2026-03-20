"""add token version to usuarios

Revision ID: d9c3a1b2e7f4
Revises: b2d4f6a8c1e3
Create Date: 2026-03-19 20:30:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d9c3a1b2e7f4"
down_revision = "b2d4f6a8c1e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("usuarios", "token_version")
