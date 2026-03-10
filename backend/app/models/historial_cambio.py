from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HistorialCambio(Base):
    __tablename__ = "historial_cambios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conciliacion_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("conciliaciones.id"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("conciliacion_items.id"), nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    campo: Mapped[str] = mapped_column(String(100), nullable=False)
    valor_anterior: Mapped[str | None] = mapped_column(Text, nullable=True)
    valor_nuevo: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conciliacion = relationship("Conciliacion")
    item = relationship("ConciliacionItem")
    usuario = relationship("Usuario")
