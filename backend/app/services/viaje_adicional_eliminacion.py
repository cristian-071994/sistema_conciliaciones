import json

from sqlalchemy.orm import Session

from app.models.conciliacion_item import ConciliacionItem
from app.models.viaje import Viaje
from app.models.viaje_adicional import SolicitudViajeAdicional
from app.services.audit import log_change

CAMPO_AUDITORIA = "eliminacion_solicitud_viaje_adicional"


class SolicitudNoEliminable(Exception):
    """Borrar la solicitud dañaría un registro que ya está en una conciliación."""


def _viaje_en_conciliacion(db: Session, viaje: Viaje) -> bool:
    if viaje.conciliacion_id is not None:
        return True
    # Enlaces históricos: un item puede apuntar al viaje aunque
    # viaje.conciliacion_id no esté sincronizado.
    return db.query(ConciliacionItem.id).filter(ConciliacionItem.viaje_id == viaje.id).first() is not None


def eliminar_solicitud_viaje_adicional(db: Session, solicitud: SolicitudViajeAdicional, usuario_id: int) -> None:
    """Borra la solicitud junto con su manifiesto y el Viaje facturable que se
    generó a partir de ella. No hace commit: lo hace quien llama.

    Se bloquea si ese viaje ya está en una conciliación — el mismo resguardo de
    eliminar_manifiesto — para no dejar una conciliación con un registro roto.
    Antes de borrar queda un resumen en historial_cambios, porque la fila ya no
    existirá para consultarla."""
    viaje = db.get(Viaje, solicitud.viaje_id) if solicitud.viaje_id else None
    if viaje is not None and _viaje_en_conciliacion(db, viaje):
        raise SolicitudNoEliminable(
            "Esta solicitud ya generó un viaje que está en una conciliación. "
            "Sácalo de la conciliación primero para poder eliminarla."
        )

    resumen = {
        "solicitud_id": solicitud.id,
        "titulo": solicitud.titulo,
        "fecha_viaje": solicitud.fecha_viaje.isoformat(),
        "operacion_id": solicitud.operacion_id,
        "cliente_id": solicitud.cliente_id,
        "creada_por": solicitud.created_by,
        "viaje_id": solicitud.viaje_id,
        "tenia_manifiesto": solicitud.manifiesto is not None,
    }
    log_change(
        db,
        usuario_id=usuario_id,
        campo=CAMPO_AUDITORIA,
        valor_anterior=json.dumps(resumen, ensure_ascii=False),
    )

    # La solicitud apunta al viaje (FK), así que va primero; el manifiesto se
    # borra en cascada con ella.
    db.delete(solicitud)
    db.flush()
    if viaje is not None:
        db.delete(viaje)
