from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ItemEstado


class SolicitudViajeAdicional(Base):
    """Solicitud de viaje adicional creada por el cliente (web o app móvil).

    Flujo: 1) cliente solicita, 2) tercero ingresa tarifa_tercero (el sistema
    calcula tarifa_cliente/rentabilidad igual que el resto del sistema, ver
    services/pricing.py), 3) solo con tarifa ya puesta, Cointra puede adjuntar
    el manifiesto — al hacerlo se crea automáticamente el Viaje (servicio
    "Viaje Adicional") vinculado en viaje_id, que entra al flujo normal de
    conciliación igual que un viaje cargado directamente por Tercero/Cointra.
    """

    __tablename__ = "viajes_adicionales_solicitud"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    operacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("operaciones.id"), nullable=False, index=True)
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id"), nullable=False, index=True)
    vehiculo_id: Mapped[int] = mapped_column(Integer, ForeignKey("vehiculos.id"), nullable=False)

    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_viaje: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    origen: Mapped[str] = mapped_column(String(255), nullable=False)
    destino: Mapped[str] = mapped_column(String(255), nullable=False)
    producto: Mapped[str] = mapped_column(String(255), nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    tarifa_tercero: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    tarifa_cliente: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rentabilidad: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    estado: Mapped[ItemEstado] = mapped_column(
        Enum(ItemEstado), default=ItemEstado.PENDIENTE, nullable=False, index=True
    )
    # Se llena al subir el manifiesto (ver subir_manifiesto en el router) —
    # de ahí en adelante el registro facturable vive en viajes/conciliacion_items,
    # esta tabla solo conserva el histórico de la solicitud original.
    viaje_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("viajes.id"), nullable=True, unique=True
    )

    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    operacion = relationship("Operacion")
    cliente = relationship("Cliente")
    vehiculo = relationship("Vehiculo")
    creador = relationship("Usuario")
    viaje = relationship("Viaje")
    manifiesto = relationship(
        "ManifiestoViajeAdicional",
        back_populates="solicitud",
        uselist=False,
        cascade="all, delete-orphan",
    )
