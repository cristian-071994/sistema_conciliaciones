from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class NotificacionOut(ORMModel):
    id: int
    usuario_id: int
    titulo: str
    mensaje: str
    tipo: str
    leida: bool
    email_intentado: bool
    email_enviado: bool
    email_error: str | None
    created_at: datetime
    conciliacion_id: int | None = None


class NotificacionMarcarLeida(BaseModel):
    leida: bool = True


class CorreoManualPreviewRequest(BaseModel):
    template_key: str | None = None
    conciliacion_id: int | None = None
    asunto: str | None = None
    mensaje: str | None = None


class CorreoManualSendRequest(BaseModel):
    destinatarios: list[str]
    template_key: str | None = None
    conciliacion_id: int | None = None
    asunto: str | None = None
    mensaje: str | None = None


class CorreoPreviewOut(BaseModel):
    asunto: str
    mensaje: str


class CorreoSendOut(BaseModel):
    sent: int
    failed: int
    errors: list[str]


class DestinatarioSugeridoOut(BaseModel):
    usuario_id: int
    nombre: str
    email: str
    rol: str
