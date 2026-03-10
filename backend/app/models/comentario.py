from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Comentario(Base):
    __tablename__ = "comentarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conciliacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("conciliaciones.id"), nullable=False)
    item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("conciliacion_items.id"), nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conciliacion = relationship("Conciliacion", back_populates="comentarios")
    item = relationship("ConciliacionItem", back_populates="comentarios")
    usuario = relationship("Usuario", back_populates="comentarios")
