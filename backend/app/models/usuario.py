from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CointraSubRol, UserRole
from app.models.usuario_operacion import usuario_operaciones_asignadas


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Clasificación de negocio (fija, no editable vía UI): de esta se derivan las
    # reglas no negociables de visibilidad financiera y flujo de conciliación.
    rol: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    sub_rol: Mapped[CointraSubRol | None] = mapped_column(Enum(CointraSubRol), nullable=True)
    # Perfil de permisos dinámico (gestionable desde el módulo de Roles). Se deriva
    # automáticamente de (rol, sub_rol) — ver rol_id_for_business_role() — y define
    # qué acciones administrativas puede realizar el usuario (services/permisos_service.py).
    rol_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("roles.id"), nullable=True)
    cliente_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("clientes.id"), nullable=True)
    tercero_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("terceros.id"), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    ultimo_heartbeat: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    sesion_cerrada_en: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)

    cliente = relationship("Cliente", back_populates="usuarios")
    tercero = relationship("Tercero", back_populates="usuarios")
    rol_asignado = relationship("Rol", back_populates="usuarios")
    conciliaciones_creadas = relationship("Conciliacion", back_populates="creador")
    items_creados = relationship("ConciliacionItem", back_populates="creador")
    comentarios = relationship("Comentario", back_populates="usuario")
    operaciones_asignadas = relationship(
        "Operacion",
        secondary=usuario_operaciones_asignadas,
        back_populates="usuarios_cliente_asignados",
    )
