from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CatalogoTarifa(Base):
    """Catálogo de tarifas por servicio + tipo de vehículo. Para el servicio
    VIAJE_ADICIONAL, origen/destino además definen la ruta (una tarifa por
    origen+destino+tipo_vehiculo); para el resto de servicios quedan en NULL
    y la tarifa es única por servicio+tipo_vehiculo — ver validación de
    duplicados en api/routes/tarifas.py, que cubre lo que este constraint no
    puede expresar por sí solo (Postgres no trata NULL=NULL como duplicado)."""

    __tablename__ = "catalogo_tarifas"
    __table_args__ = (
        UniqueConstraint(
            "servicio_id", "tipo_vehiculo_id", "origen", "destino", name="uq_catalogo_tarifa_servicio_tipo_ruta"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    servicio_id: Mapped[int] = mapped_column(Integer, ForeignKey("servicios.id"), nullable=False, index=True)
    tipo_vehiculo_id: Mapped[int] = mapped_column(Integer, ForeignKey("tipos_vehiculo.id"), nullable=False, index=True)
    # Solo aplican al servicio VIAJE_ADICIONAL — NULL para el resto.
    origen: Mapped[str | None] = mapped_column(String(255), nullable=True)
    destino: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tarifa_cliente: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    rentabilidad_pct: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    tarifa_tercero: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    servicio = relationship("Servicio")
    tipo_vehiculo = relationship("TipoVehiculo")
    editor = relationship("Usuario")
