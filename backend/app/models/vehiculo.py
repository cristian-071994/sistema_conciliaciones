from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Vehiculo(Base):
    __tablename__ = "vehiculos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    placa: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    tipo_vehiculo_id: Mapped[int] = mapped_column(Integer, ForeignKey("tipos_vehiculo.id"), nullable=False)
    propietario: Mapped[str | None] = mapped_column(String(255), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)

    tipo = relationship("TipoVehiculo", back_populates="vehiculos")
    creador = relationship("Usuario")

