from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    nit: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    usuarios = relationship("Usuario", back_populates="cliente")
    operaciones = relationship("Operacion", back_populates="cliente")
