from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Rol(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Bypass total de permisos (nunca consulta rol_permisos) — evita quedar sin
    # administrador si alguien vacía por error los permisos de este rol.
    es_superadmin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Rol protegido: no se puede eliminar (la lógica de negocio del sistema
    # depende de que estos 4 roles base siempre existan). Sus permisos sí
    # son editables, salvo en es_superadmin donde no aplica.
    es_sistema: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Soft-delete: un rol creado manualmente se puede desactivar sin
    # eliminarlo (preserva el historial de qué usuarios lo tuvieron). Los
    # roles es_sistema nunca se desactivan — ver api/routes/roles.py.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    permisos = relationship("Permiso", secondary="rol_permisos", back_populates="roles")
    usuarios = relationship("Usuario", back_populates="rol_asignado")
