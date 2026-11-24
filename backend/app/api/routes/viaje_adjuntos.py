"""Soportes (hasta 3 archivos PDF/imagen) de un servicio cargado, para los
tipos de servicio con `permite_adjuntos` (ej. Descargue, Viáticos).

Visibilidad: la misma que el servicio al que pertenecen (Cointra todo, el
Tercero los de su operación, el Cliente solo desde que la conciliación llega a
revisión). Subir/quitar: el Tercero de la operación o Cointra con permiso de
viajes, y solo mientras el servicio no esté en una conciliación avanzada.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, is_cointra_admin
from app.api.routes.viajes import _ensure_viaje_mutable, _estado_conciliacion_valor, _validate_user_access_operacion
from app.core.upload_limits import SERVICIO_ADJUNTO_MAX_BYTES
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.servicio_adjunto import ServicioAdjunto
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.adjuntos import validar_adjunto, validar_cantidad
from app.services.permisos_service import tiene_permiso

router = APIRouter(prefix="/viajes", tags=["viaje-adjuntos"])

_ESTADOS_VISIBLES_CLIENTE = {"EN_REVISION", "APROBADA", "CERRADA"}


def _metadata(adjunto: ServicioAdjunto) -> dict:
    return {
        "id": adjunto.id,
        "viaje_id": adjunto.viaje_id,
        "filename": adjunto.filename,
        "content_type": adjunto.content_type,
        "size_bytes": adjunto.size_bytes,
        "created_at": adjunto.created_at,
    }


def _viaje_visible(db: Session, user: Usuario, viaje_id: int) -> Viaje:
    """Devuelve el viaje si el usuario puede verlo; si no, 404 (no se revela
    que existe)."""
    viaje = db.get(Viaje, viaje_id)
    if not viaje or (not viaje.activo and not is_cointra_admin(user)):
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    _validate_user_access_operacion(user, viaje.operacion)
    if user.rol == UserRole.CLIENTE and _estado_conciliacion_valor(viaje) not in _ESTADOS_VISIBLES_CLIENTE:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return viaje


def _viaje_editable(db: Session, user: Usuario, viaje_id: int) -> Viaje:
    viaje = _viaje_visible(db, user, viaje_id)
    puede = user.rol == UserRole.TERCERO or (
        user.rol == UserRole.COINTRA
        and (tiene_permiso(db, user, "viajes.crear") or tiene_permiso(db, user, "viajes.editar"))
    )
    if not puede:
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar los archivos de este servicio")
    if not viaje.servicio or not viaje.servicio.permite_adjuntos:
        raise HTTPException(status_code=400, detail="Este tipo de servicio no admite archivos adjuntos.")
    _ensure_viaje_mutable(viaje, db)
    return viaje


@router.get("/{viaje_id}/adjuntos")
def listar_adjuntos(
    viaje_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _viaje_visible(db, user, viaje_id)
    adjuntos = (
        db.query(ServicioAdjunto).filter(ServicioAdjunto.viaje_id == viaje_id).order_by(ServicioAdjunto.id.asc()).all()
    )
    return [_metadata(a) for a in adjuntos]


@router.post("/{viaje_id}/adjuntos")
def subir_adjuntos(
    viaje_id: int,
    archivos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    viaje = _viaje_editable(db, user, viaje_id)

    # Bloquea la fila del viaje para que dos subidas simultáneas no superen el máximo.
    db.query(Viaje.id).filter(Viaje.id == viaje.id).with_for_update().first()
    existentes = db.query(ServicioAdjunto.id).filter(ServicioAdjunto.viaje_id == viaje.id).count()

    try:
        validar_cantidad(existentes, len(archivos))
        validados = []
        for archivo in archivos:
            # Se lee un byte de más para detectar el exceso sin cargar archivos enormes.
            contenido = archivo.file.read(SERVICIO_ADJUNTO_MAX_BYTES + 1)
            validados.append(validar_adjunto(archivo.filename, contenido))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    creados = [
        ServicioAdjunto(
            viaje_id=viaje.id,
            filename=v.filename,
            content_type=v.content_type,
            size_bytes=len(v.content),
            content=v.content,
            uploaded_by=user.id,
        )
        for v in validados
    ]
    db.add_all(creados)
    db.commit()
    for adjunto in creados:
        db.refresh(adjunto)
    return [_metadata(a) for a in creados]


@router.get("/{viaje_id}/adjuntos/{adjunto_id}")
def descargar_adjunto(
    viaje_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _viaje_visible(db, user, viaje_id)
    adjunto = db.get(ServicioAdjunto, adjunto_id)
    if not adjunto or adjunto.viaje_id != viaje_id:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return Response(
        content=adjunto.content,
        media_type=adjunto.content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(adjunto.filename)}",
            # El tipo ya fue verificado por contenido; evita que el navegador lo reinterprete.
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{viaje_id}/adjuntos/{adjunto_id}")
def eliminar_adjunto(
    viaje_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _viaje_editable(db, user, viaje_id)
    adjunto = db.get(ServicioAdjunto, adjunto_id)
    if not adjunto or adjunto.viaje_id != viaje_id:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    db.delete(adjunto)
    db.commit()
    return {"ok": True}
