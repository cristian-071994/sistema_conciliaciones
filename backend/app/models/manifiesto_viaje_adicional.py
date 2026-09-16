from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ManifiestoViajeAdicional(Base):
    """PDF de manifiesto que Cointra adjunta a una solicitud de viaje
    adicional. El número de manifiesto se ingresa manualmente por ahora —
    el parser automático (services/manifiesto_parser.py) está pendiente de
    una muestra real del formato para calibrarse (ver CLAUDE.md)."""

    __tablename__ = "manifiestos_viaje_adicional"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    solicitud_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("viajes_adicionales_solicitud.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    numero_manifiesto: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="application/pdf")
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    solicitud = relationship("SolicitudViajeAdicional", back_populates="manifiesto")
    subido_por = relationship("Usuario")
