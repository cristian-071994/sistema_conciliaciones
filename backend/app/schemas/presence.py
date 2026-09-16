from datetime import datetime

from app.models.enums import UserRole
from app.schemas.common import ORMModel


class UsuarioPresenceOut(ORMModel):
    id: int
    nombre: str
    email: str
    rol: UserRole
    activo: bool
    ultimo_heartbeat: datetime | None = None
    estado_conexion: str
