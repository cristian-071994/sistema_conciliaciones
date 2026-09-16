from datetime import datetime, timezone
from enum import Enum

from app.core.config import settings

UMBRAL_EN_LINEA_MINUTOS = 5


class EstadoConexion(str, Enum):
    EN_LINEA = "en_linea"
    INACTIVO = "inactivo"
    NO_CONECTADO = "no_conectado"


def calcular_estado(ultimo_heartbeat: datetime | None, sesion_cerrada_en: datetime | None) -> EstadoConexion:
    """Se calcula al vuelo, nunca se persiste — ver Usuario.ultimo_heartbeat.

    1. Logout explícito posterior al último heartbeat -> no_conectado ya mismo.
    2. Nunca se conectó -> no_conectado.
    3. Heartbeat hace menos de 5 min -> en_linea.
    4. Heartbeat hace menos de la duración del JWT -> inactivo (el token
       todavía podría ser válido, pero no hay actividad reciente).
    5. Si no -> no_conectado (el token ya habría expirado de todas formas).
    """
    if sesion_cerrada_en is not None and (ultimo_heartbeat is None or sesion_cerrada_en >= ultimo_heartbeat):
        return EstadoConexion.NO_CONECTADO
    if ultimo_heartbeat is None:
        return EstadoConexion.NO_CONECTADO

    ahora = datetime.now(timezone.utc)
    minutos_desde_heartbeat = (ahora - ultimo_heartbeat).total_seconds() / 60

    if minutos_desde_heartbeat < UMBRAL_EN_LINEA_MINUTOS:
        return EstadoConexion.EN_LINEA
    if minutos_desde_heartbeat < settings.access_token_expire_minutes:
        return EstadoConexion.INACTIVO
    return EstadoConexion.NO_CONECTADO
