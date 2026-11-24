from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.db.base import Base
from app.models.viaje import Viaje


class ServicioAdjunto(Base):
    """Soporte (PDF o imagen) adjunto a un servicio cargado (Viaje) cuyo tipo de
    servicio tiene `permite_adjuntos` (ej. Descargue, Viáticos). Máximo 3 por
    servicio — regla validada en services/adjuntos.py, no solo en el cliente."""

    __tablename__ = "servicio_adjuntos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    viaje_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("viajes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Tipo detectado por el contenido real del archivo, nunca el que declare el cliente.
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    viaje = relationship("Viaje")
    subido_por = relationship("Usuario")


# Cantidad de adjuntos de cada Viaje, calculada en la misma consulta que lo
# carga (así los listados de conciliación no hacen una consulta por ítem).
Viaje.adjuntos_count = column_property(
    select(func.count(ServicioAdjunto.id))
    .where(ServicioAdjunto.viaje_id == Viaje.id)
    .correlate_except(ServicioAdjunto)
    .scalar_subquery()
)
