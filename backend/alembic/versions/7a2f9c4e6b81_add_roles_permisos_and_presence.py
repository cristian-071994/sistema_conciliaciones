"""add roles, permisos, rol_permisos and presence fields on usuarios

Revision ID: 7a2f9c4e6b81
Revises: 43c85ff3fc45
Create Date: 2026-09-15 00:00:00.000000

Migración aditiva: no borra ni renombra nada existente. Agrega el módulo de
roles/permisos dinámicos (gestiona acciones ADMINISTRATIVAS: usuarios, roles,
presencia) sin tocar la clasificación fija UserRole/CointraSubRol de la que
dependen las reglas de negocio de conciliación (visibilidad financiera, etc.).
Cada usuario existente se vincula automáticamente a su rol equivalente para
que el comportamiento del día 1 sea idéntico al actual.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a2f9c4e6b81"
down_revision: Union[str, None] = "43c85ff3fc45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROLES_BASE = [
    # (id, nombre, descripcion, es_superadmin, es_sistema)
    (1, "COINTRA_ADMIN", "Administrador Cointra — acceso total", True, True),
    (2, "COINTRA_USER", "Usuario operativo Cointra", False, True),
    (3, "CLIENTE", "Usuario del cliente", False, True),
    (4, "TERCERO", "Usuario del transportador (tercero)", False, True),
]

PERMISOS = [
    # (id, clave, categoria, descripcion)
    (1, "usuarios.ver", "Usuarios", "Ver el listado de usuarios del sistema"),
    (2, "usuarios.crear", "Usuarios", "Crear nuevos usuarios"),
    (3, "usuarios.editar", "Usuarios", "Editar usuarios existentes"),
    (4, "usuarios.desactivar", "Usuarios", "Desactivar o reactivar usuarios"),
    (5, "roles.ver", "Roles", "Ver roles y sus permisos"),
    (6, "roles.gestionar", "Roles", "Editar los permisos asignados a cada rol"),
    (7, "presencia.ver", "Presencia", "Ver el estado de conexión de los usuarios"),
]

# Ningún rol no-superadmin tiene permisos por defecto: reproduce el
# comportamiento documentado hoy (ej. presencia en línea era exclusiva de
# COINTRA_ADMIN). Un admin puede delegar permisos desde el módulo de Roles.
ROL_PERMISOS_DEFECTO: list[tuple[int, int]] = []


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=True),
        sa.Column("es_superadmin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("es_sistema", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nombre"),
    )
    op.create_index("ix_roles_id", "roles", ["id"], unique=False)

    op.create_table(
        "permisos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clave", sa.String(length=100), nullable=False),
        sa.Column("categoria", sa.String(length=100), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clave"),
    )
    op.create_index("ix_permisos_id", "permisos", ["id"], unique=False)

    op.create_table(
        "rol_permisos",
        sa.Column("rol_id", sa.Integer(), nullable=False),
        sa.Column("permiso_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["rol_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permiso_id"], ["permisos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("rol_id", "permiso_id"),
    )

    op.add_column("usuarios", sa.Column("rol_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_usuarios_rol_id", "usuarios", "roles", ["rol_id"], ["id"])
    op.add_column("usuarios", sa.Column("ultimo_heartbeat", sa.DateTime(timezone=True), nullable=True))
    op.add_column("usuarios", sa.Column("sesion_cerrada_en", sa.DateTime(timezone=True), nullable=True))

    roles_table = sa.table(
        "roles",
        sa.column("id", sa.Integer),
        sa.column("nombre", sa.String),
        sa.column("descripcion", sa.String),
        sa.column("es_superadmin", sa.Boolean),
        sa.column("es_sistema", sa.Boolean),
    )
    op.bulk_insert(
        roles_table,
        [
            {"id": rid, "nombre": nombre, "descripcion": desc, "es_superadmin": superadmin, "es_sistema": sistema}
            for rid, nombre, desc, superadmin, sistema in ROLES_BASE
        ],
    )

    permisos_table = sa.table(
        "permisos",
        sa.column("id", sa.Integer),
        sa.column("clave", sa.String),
        sa.column("categoria", sa.String),
        sa.column("descripcion", sa.String),
    )
    op.bulk_insert(
        permisos_table,
        [
            {"id": pid, "clave": clave, "categoria": categoria, "descripcion": desc}
            for pid, clave, categoria, desc in PERMISOS
        ],
    )

    # ROL_PERMISOS_DEFECTO queda vacío hoy (ver comentario arriba) — nada que
    # insertar en rol_permisos todavía; los admins lo llenan desde el módulo
    # de Roles.

    # Reajustar la secuencia de los ids porque se insertaron manualmente.
    op.execute("SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles))")
    op.execute("SELECT setval('permisos_id_seq', (SELECT MAX(id) FROM permisos))")

    # Backfill: cada usuario existente se vincula a su rol equivalente para que
    # el comportamiento sea idéntico al actual (nadie pierde ni gana acceso).
    op.execute(
        """
        UPDATE usuarios SET rol_id = 1 WHERE rol = 'COINTRA' AND sub_rol = 'COINTRA_ADMIN'
        """
    )
    op.execute(
        """
        UPDATE usuarios SET rol_id = 2 WHERE rol = 'COINTRA' AND (sub_rol = 'COINTRA_USER' OR sub_rol IS NULL)
        """
    )
    op.execute("UPDATE usuarios SET rol_id = 3 WHERE rol = 'CLIENTE'")
    op.execute("UPDATE usuarios SET rol_id = 4 WHERE rol = 'TERCERO'")


def downgrade() -> None:
    op.drop_constraint("fk_usuarios_rol_id", "usuarios", type_="foreignkey")
    op.drop_column("usuarios", "sesion_cerrada_en")
    op.drop_column("usuarios", "ultimo_heartbeat")
    op.drop_column("usuarios", "rol_id")
    op.drop_table("rol_permisos")
    op.drop_index("ix_permisos_id", table_name="permisos")
    op.drop_table("permisos")
    op.drop_index("ix_roles_id", table_name="roles")
    op.drop_table("roles")
