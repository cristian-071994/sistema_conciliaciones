from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.conciliacion import Conciliacion
from app.models.notificacion import Notificacion
from app.models.operacion import Operacion
from app.models.enums import UserRole
from app.models.usuario import Usuario
from app.schemas.notificacion import (
    CorreoManualPreviewRequest,
    CorreoManualSendRequest,
    CorreoPreviewOut,
    CorreoSendOut,
    DestinatarioSugeridoOut,
    NotificacionMarcarLeida,
    NotificacionOut,
)
from app.services.notifications import render_email_template, send_manual_email

router = APIRouter(prefix="/notificaciones", tags=["notificaciones"])


@router.get("/mis", response_model=list[NotificacionOut])
def mis_notificaciones(
    solo_no_leidas: bool = False,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = db.query(Notificacion).filter(Notificacion.usuario_id == user.id)
    if solo_no_leidas:
        query = query.filter(Notificacion.leida.is_(False))
    return query.order_by(Notificacion.id.desc()).limit(100).all()


@router.patch("/{notificacion_id}", response_model=NotificacionOut)
def marcar_notificacion(
    notificacion_id: int,
    payload: NotificacionMarcarLeida,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    n = db.get(Notificacion, notificacion_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notificacion no encontrada")
    if n.usuario_id != user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    n.leida = payload.leida
    db.commit()
    db.refresh(n)
    return n


@router.post("/leer-todas")
def marcar_todas_leidas(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    query = db.query(Notificacion).filter(Notificacion.usuario_id == user.id, Notificacion.leida.is_(False))
    count = query.count()
    query.update({Notificacion.leida: True})
    db.commit()
    return {"actualizadas": count}


def _build_context(db: Session, conciliacion_id: int | None) -> dict[str, str]:
    if not conciliacion_id:
        return {}
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        return {}
    operacion = db.get(Operacion, conc.operacion_id)
    return {
        "conciliacion_nombre": conc.nombre,
        "operacion_nombre": operacion.nombre if operacion else "",
        "periodo": f"{conc.fecha_inicio} - {conc.fecha_fin}",
        "estado": str(conc.estado),
    }


@router.post("/correo/preview", response_model=CorreoPreviewOut)
def preview_correo(
    payload: CorreoManualPreviewRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    context = _build_context(db, payload.conciliacion_id)
    context["mensaje"] = payload.mensaje or ""

    if payload.template_key:
        asunto, mensaje = render_email_template(payload.template_key, context)
    else:
        asunto = payload.asunto or "Notificacion Sistema Conciliacion"
        mensaje = payload.mensaje or ""

    if payload.asunto:
        asunto = payload.asunto
    if payload.mensaje and not payload.template_key:
        mensaje = payload.mensaje

    return CorreoPreviewOut(asunto=asunto, mensaje=mensaje)


@router.post("/correo/send", response_model=CorreoSendOut)
def send_correo_manual(
    payload: CorreoManualSendRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    if not payload.destinatarios:
        raise HTTPException(status_code=400, detail="Debes enviar al menos un destinatario")

    context = _build_context(db, payload.conciliacion_id)
    context["mensaje"] = payload.mensaje or ""
    if payload.template_key:
        asunto, mensaje = render_email_template(payload.template_key, context)
    else:
        asunto = payload.asunto or "Notificacion Sistema Conciliacion"
        mensaje = payload.mensaje or ""

    if payload.asunto:
        asunto = payload.asunto
    if payload.mensaje and not payload.template_key:
        mensaje = payload.mensaje

    result = send_manual_email(payload.destinatarios, subject=asunto, body=mensaje)
    return CorreoSendOut(**result)


@router.get("/correo/destinatarios-sugeridos/{conciliacion_id}", response_model=list[DestinatarioSugeridoOut])
def destinatarios_sugeridos(
    conciliacion_id: int,
    tipo: str = "cliente_revision",
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    op = db.get(Operacion, conc.operacion_id)
    if not op:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")

    query = db.query(Usuario).filter(Usuario.activo.is_(True))
    if tipo == "cliente_revision":
        # Cointra/tercero pueden sugerir cliente
        if user.rol not in [UserRole.COINTRA, UserRole.TERCERO]:
            raise HTTPException(status_code=403, detail="No autorizado")
        query = query.filter(Usuario.rol == UserRole.CLIENTE, Usuario.cliente_id == op.cliente_id)
    elif tipo == "respuesta_cliente":
        # Cliente puede sugerir cointra
        if user.rol != UserRole.CLIENTE:
            raise HTTPException(status_code=403, detail="No autorizado")
        query = query.filter(Usuario.rol == UserRole.COINTRA)
    else:
        raise HTTPException(status_code=400, detail="Tipo no soportado")

    rows = query.order_by(Usuario.nombre).all()
    return [
        DestinatarioSugeridoOut(usuario_id=u.id, nombre=u.nombre, email=u.email, rol=u.rol.value)
        for u in rows
    ]
