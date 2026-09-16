import threading
import time

from fastapi import HTTPException

# Rate limiter en memoria del proceso: suficiente para un solo contenedor de
# backend (ver docker-compose*.yml, hoy no hay múltiples réplicas). Si en el
# futuro se escala a varias instancias, esto debe moverse a Redis o similar
# para que el límite sea compartido entre procesos.
MAX_INTENTOS = 5
VENTANA_SEGUNDOS = 15 * 60

_lock = threading.Lock()
_intentos_fallidos: dict[str, list[float]] = {}


def _purgar_antiguos(intentos: list[float], ahora: float) -> list[float]:
    return [t for t in intentos if ahora - t < VENTANA_SEGUNDOS]


def ensure_not_rate_limited(clave: str) -> None:
    ahora = time.time()
    with _lock:
        intentos = _purgar_antiguos(_intentos_fallidos.get(clave, []), ahora)
        _intentos_fallidos[clave] = intentos
        if len(intentos) >= MAX_INTENTOS:
            raise HTTPException(
                status_code=429,
                detail="Demasiados intentos fallidos. Intenta de nuevo en unos minutos.",
            )


def register_failed_attempt(clave: str) -> None:
    ahora = time.time()
    with _lock:
        intentos = _purgar_antiguos(_intentos_fallidos.get(clave, []), ahora)
        intentos.append(ahora)
        _intentos_fallidos[clave] = intentos


def reset_attempts(clave: str) -> None:
    with _lock:
        _intentos_fallidos.pop(clave, None)
