from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemEstado, ItemTipo, UserRole
from app.models.factura_archivo_cliente import FacturaArchivoCliente
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.conciliacion import (
    ComentarioCreate,
    ComentarioOut,
    ConciliacionOut,
    ConciliacionUpdateEstado,
    ConciliacionWorkflowAction,
)
from app.services.audit import log_change
from app.services.notifications import create_internal_notifications, send_manual_email
from app.services.visibility import sanitize_item_for_role
from .conciliaciones_helpers import (
    _validate_user_access_operacion,
    _ensure_user_can_access_conciliacion,
    _sync_viajes_conciliado_por_estado,
    _resolve_recipients,
    _parse_target_emails,
    _users_matching_emails,
    _sender_signature,
    _find_last_review_sender,
    _login_url,
    _validate_transport_items_manifests_or_raise,
    _prefetch_avansat_for_manifest_numbers_or_raise,
    _enrich_conciliacion,
    _mark_borrador_dirty,
    _display_estado,
)
from .conciliaciones_excel import _build_conciliacion_excel

router = APIRouter()


@router.patch("/{conciliacion_id}/estado", response_model=ConciliacionOut)
def update_estado_conciliacion(
    conciliacion_id: int,
    payload: ConciliacionUpdateEstado,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede cambiar estado de conciliacion")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_estado = conc.estado
    conc.estado = payload.estado
    _sync_viajes_conciliado_por_estado(db, conc.id, conc.estado)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="estado_conciliacion",
        valor_anterior=old_estado,
        valor_nuevo=payload.estado,
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA, UserRole.CLIENTE, UserRole.TERCERO])
    create_internal_notifications(
        db,
        recipients,
        titulo="Cambio de estado de conciliacion",
        mensaje=f"La conciliacion '{conc.nombre}' cambio a estado {conc.estado}.",
        tipo="ESTADO",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/enviar-revision", response_model=ConciliacionOut)
def enviar_revision(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede enviar a revision")
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    if conc.estado == "BORRADOR" and not conc.borrador_guardado:
        raise HTTPException(
            status_code=400,
            detail="Debes guardar la conciliacion antes de enviarla a revision",
        )

    items = (
        db.query(ConciliacionItem)
        .options(selectinload(ConciliacionItem.viaje).selectinload(Viaje.servicio))
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .order_by(ConciliacionItem.id.asc())
        .all()
    )
    _validate_transport_items_manifests_or_raise(db, items, "enviar a revision")

    conc.estado = "EN_REVISION"
    conc.enviada_facturacion = False
    conc.factura_cliente_enviada = False
    conc.po_numero_autorizacion = None
    _sync_viajes_conciliado_por_estado(db, conc.id, conc.estado)

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="enviar_revision",
        valor_nuevo=payload.observacion or "sin observacion",
    )

    recipients = _resolve_recipients(db, operacion, [UserRole.CLIENTE])
    target_emails = _parse_target_emails(payload.destinatario_email, recipients)
    notification_recipients = _users_matching_emails(recipients, target_emails) or recipients

    if not target_emails:
        raise HTTPException(status_code=400, detail="No hay correo destinatario para enviar la conciliacion")

    if target_emails:
        subject = conc.nombre
        custom_message = payload.mensaje or ""
        login_url = _login_url()
        body = (
            f"Hola,\n\n"
            f"Cointra envio la conciliacion '{conc.nombre}' para tu revision.\n"
            f"Operacion: {operacion.nombre}\n"
            f"Periodo: {conc.fecha_inicio} a {conc.fecha_fin}\n\n"
            f"Enviado por: {_sender_signature(user)}\n\n"
            f"Mensaje: {custom_message or '(sin mensaje)'}\n\n"
            "Ingresa al sistema para revisar y autorizar la conciliacion.\n"
            f"Accede aqui: {login_url}\n\n"
        )
        # Parsear cc_emails string a lista
        cc_emails = []
        if getattr(payload, "cc_emails", None):
            cc_emails = [e.strip() for e in str(payload.cc_emails).replace(';', ',').split(',') if e.strip()]
        email_result = send_manual_email(target_emails, subject=subject, body=body, cc_emails=cc_emails or None)
        if email_result["failed"] >= len(target_emails):
            db.rollback()
            detail = "No se pudo enviar el correo de revision"
            if email_result["errors"]:
                detail = f"{detail}: {email_result['errors'][0]}"
            raise HTTPException(status_code=502, detail=detail)

    create_internal_notifications(
        db,
        notification_recipients,
        titulo="Conciliacion enviada a revision",
        mensaje=f"Cointra envio la conciliacion '{conc.nombre}' para tu revision.",
        tipo="ESTADO",
        conciliacion_id=conc.id,
    )

    db.commit()
    db.refresh(conc)
    return conc


@router.post("/{conciliacion_id}/aprobar-cliente", response_model=ConciliacionOut)
def aprobar_conciliacion_cliente(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede aprobar conciliacion")
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)
    _ensure_user_can_access_conciliacion(user, conc)
    items = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conc.id).all()
    pendientes = [i for i in items if i.estado != ItemEstado.APROBADO]
    if pendientes:
        raise HTTPException(status_code=400, detail="No se puede aprobar: existen items no aprobados")

    po_numero = (payload.po_numero or "").strip()
    if not po_numero:
        raise HTTPException(status_code=400, detail="Debes registrar el número de PO para aprobar la conciliación")

    conc.estado = "APROBADA"
    conc.enviada_facturacion = False
    conc.factura_cliente_enviada = False
    conc.po_numero_autorizacion = po_numero
    _sync_viajes_conciliado_por_estado(db, conc.id, conc.estado)

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="aprobacion_cliente",
        valor_nuevo=(
            f"{payload.observacion or 'aprobada por cliente'}"
            + (f" | PO: {po_numero}" if po_numero else "")
        ),
    )
    db.commit()
    db.refresh(conc)

    cointra_recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    tercero_recipients = _resolve_recipients(db, operacion, [UserRole.TERCERO])
    last_review_sender = _find_last_review_sender(db, conc.id)
    preferred_cointra = [last_review_sender] if last_review_sender and last_review_sender.rol == UserRole.COINTRA else []
    email_recipients = preferred_cointra or cointra_recipients
    target_emails = _parse_target_emails(payload.destinatario_email, email_recipients)
    if not target_emails:
        raise HTTPException(status_code=400, detail="Debes indicar un destinatario de correo para confirmar la aprobación")
    notification_recipients = list(email_recipients)
    for tercero in tercero_recipients:
        if all(existing.id != tercero.id for existing in notification_recipients):
            notification_recipients.append(tercero)
    subject = f"Conciliacion aprobada: {conc.nombre}"
    custom_message = payload.mensaje or ""
    login_url = _login_url()
    body = (
        f"Hola,\n\n"
        f"El cliente aprobo la conciliacion '{conc.nombre}'.\n"
        f"Operacion: {operacion.nombre}\n"
        f"Periodo: {conc.fecha_inicio} a {conc.fecha_fin}\n\n"
        f"PO autorizacion: {po_numero}\n\n"
        f"Enviado por: {_sender_signature(user)}\n\n"
        f"Mensaje: {custom_message or '(sin mensaje)'}\n\n"
        "Ingresa al sistema para continuar con el flujo.\n"
        f"Accede aqui: {login_url}\n\n"
    )
    # Parsear cc_emails string a lista
    cc_emails = []
    if getattr(payload, "cc_emails", None):
        cc_emails = [e.strip() for e in str(payload.cc_emails).replace(';', ',').split(',') if e.strip()]
    send_manual_email(target_emails, subject=subject, body=body, cc_emails=cc_emails or None)

    create_internal_notifications(
        db,
        notification_recipients,
        titulo="Conciliacion aprobada por cliente",
        mensaje=f"La conciliacion '{conc.nombre}' fue aprobada por el cliente y quedo autorizada para facturar.",
        tipo="APROBACION",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/devolver-cliente", response_model=ConciliacionOut)
def devolver_conciliacion_cliente(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede devolver conciliacion")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)
    _ensure_user_can_access_conciliacion(user, conc)

    items = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conc.id).all()
    rechazados = [i for i in items if i.estado == ItemEstado.RECHAZADO]
    if not rechazados:
        raise HTTPException(
            status_code=400,
            detail="Para devolver la conciliacion debes rechazar al menos un item",
        )

    if not payload.observacion or not payload.observacion.strip():
        raise HTTPException(status_code=400, detail="Debes incluir observaciones para devolver")

    conc.estado = "BORRADOR"
    conc.enviada_facturacion = False
    conc.factura_cliente_enviada = False
    conc.po_numero_autorizacion = None
    _sync_viajes_conciliado_por_estado(db, conc.id, conc.estado)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="devolucion_cliente",
        valor_nuevo=payload.observacion,
    )
    db.add(
        Comentario(
            conciliacion_id=conc.id,
            usuario_id=user.id,
            comentario=payload.observacion,
        )
    )
    db.commit()
    db.refresh(conc)

    cointra_recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    last_review_sender = _find_last_review_sender(db, conc.id)
    email_recipients = [last_review_sender] if last_review_sender and last_review_sender.rol == UserRole.COINTRA else cointra_recipients
    target_emails = _parse_target_emails(payload.destinatario_email, email_recipients)
    notification_recipients = list(email_recipients)
    if target_emails:
        subject = f"Conciliacion devuelta con novedades: {conc.nombre}"
        custom_message = payload.mensaje or ""
        login_url = _login_url()
        body = (
            f"Hola,\n\n"
            f"El cliente devolvio la conciliacion '{conc.nombre}' con novedades.\n"
            f"Operacion: {operacion.nombre}\n"
            f"Periodo: {conc.fecha_inicio} a {conc.fecha_fin}\n"
            f"Observacion: {payload.observacion}\n\n"
            f"Enviado por: {_sender_signature(user)}\n\n"
            f"Mensaje: {custom_message or '(sin mensaje)'}\n\n"
            "Ingresa al sistema para revisar, ajustar y reenviar.\n"
            f"Accede aqui: {login_url}\n\n"
        )
        # Parsear cc_emails string a lista
        cc_emails = []
        if getattr(payload, "cc_emails", None):
            cc_emails = [e.strip() for e in str(payload.cc_emails).replace(';', ',').split(',') if e.strip()]
        send_manual_email(target_emails, subject=subject, body=body, cc_emails=cc_emails or None)

    create_internal_notifications(
        db,
        notification_recipients,
        titulo="Conciliacion devuelta con novedades",
        mensaje=f"El cliente devolvio la conciliacion '{conc.nombre}' con observaciones para revisar.",
        tipo="DEVOLUCION",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/enviar-facturacion", response_model=ConciliacionOut)
def enviar_facturacion_conciliacion(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede enviar a facturacion")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    if conc.estado != "APROBADA":
        raise HTTPException(status_code=400, detail="Solo conciliaciones aprobadas pueden enviarse a facturacion")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    items = (
        db.query(ConciliacionItem)
        .options(selectinload(ConciliacionItem.viaje).selectinload(Viaje.servicio))
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .order_by(ConciliacionItem.id.asc())
        .all()
    )
    if not items:
        raise HTTPException(status_code=400, detail="No hay registros para generar el archivo de facturacion")

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    target_emails = _parse_target_emails(payload.destinatario_email, recipients)
    if not target_emails:
        raise HTTPException(status_code=400, detail="No hay correos de destino para facturacion")

    _validate_transport_items_manifests_or_raise(db, items, "enviar a facturacion")

    avansat_prefetched = _prefetch_avansat_for_manifest_numbers_or_raise(
        db,
        [str(item.manifiesto_numero or "") for item in items],
    )

    placas = {str(item.placa or "").strip().upper() for item in items if item.placa}
    tipo_vehiculo_by_placa: dict[str, str] = {}
    if placas:
        vehiculos = (
            db.query(Vehiculo)
            .options(selectinload(Vehiculo.tipo))
            .filter(Vehiculo.placa.in_(list(placas)))
            .all()
        )
        tipo_vehiculo_by_placa = {
            str(v.placa or "").strip().upper(): (v.tipo.nombre if v.tipo else "")
            for v in vehiculos
        }

    excel_content = _build_conciliacion_excel(
        conc,
        items,
        user.rol,
        tipo_vehiculo_by_placa,
        avansat_prefetched,
    )
    filename = f"conciliacion_{conc.id}_resumen.xlsx"
    custom_message = payload.mensaje or ""
    po_numero = (conc.po_numero_autorizacion or "").strip()
    email_body = (
        f"Hola,\n\n"
        f"Se envio la conciliacion '{conc.nombre}' para facturacion.\n"
        f"Operacion: {operacion.nombre}\n"
        f"Periodo: {conc.fecha_inicio} a {conc.fecha_fin}\n\n"
        f"PO autorizacion cliente: {po_numero or '(sin PO registrada)'}\n\n"
        f"Enviado por: {_sender_signature(user)}\n\n"
        f"Mensaje: {custom_message or '(sin mensaje)'}\n\n"
        "Adjunto encontraras el archivo Excel con los viajes.\n"
    )

    # Parsear cc_emails string a lista
    cc_emails = []
    if getattr(payload, "cc_emails", None):
        cc_emails = [e.strip() for e in str(payload.cc_emails).replace(';', ',').split(',') if e.strip()]
    send_result = send_manual_email(
        target_emails,
        subject=f"Autorizacion para facturar: {conc.nombre}",
        body=email_body,
        attachments=[
            {
                "filename": filename,
                "content": excel_content,
                "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
        ],
        cc_emails=cc_emails or None,
    )
    if send_result["failed"] >= len(target_emails):
        detail = "No se pudo enviar el correo de facturacion"
        if send_result["errors"]:
            detail = f"{detail}: {send_result['errors'][0]}"
        raise HTTPException(status_code=502, detail=detail)

    conc.enviada_facturacion = True
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="envio_facturacion",
        valor_nuevo=f"destinatarios={', '.join(target_emails)}",
    )
    db.commit()
    db.refresh(conc)

    create_internal_notifications(
        db,
        recipients,
        titulo="Conciliacion enviada a facturar",
        mensaje=f"La conciliacion '{conc.nombre}' fue enviada a facturacion con archivo Excel adjunto.",
        tipo="FACTURACION",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/enviar-factura-cliente", response_model=ConciliacionOut)
def enviar_factura_cliente_conciliacion(
    conciliacion_id: int,
    destinatario_email: str | None = Form(default=None),
    mensaje: str | None = Form(default=None),
    cc_emails: str | None = Form(default=None),
    archivos_factura: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede enviar factura al cliente")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    if conc.estado != "APROBADA" or not conc.enviada_facturacion:
        raise HTTPException(
            status_code=400,
            detail="La conciliacion debe estar enviada a facturacion antes de enviar la factura al cliente",
        )
    if conc.factura_cliente_enviada:
        raise HTTPException(status_code=400, detail="La factura ya fue enviada al cliente")

    if not archivos_factura:
        raise HTTPException(status_code=400, detail="Debes adjuntar al menos un archivo PDF de la factura")

    archivos_leidos: list[dict] = []
    for archivo in archivos_factura:
        if not archivo.filename:
            raise HTTPException(status_code=400, detail="Uno de los archivos no tiene nombre")
        fname = archivo.filename.strip()
        if not fname.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"El archivo '{fname}' debe estar en formato PDF")
        content = archivo.file.read()
        if not content:
            raise HTTPException(status_code=400, detail=f"El archivo '{fname}' está vacío")
        archivos_leidos.append({"filename": fname, "content": content})

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    recipients = _resolve_recipients(db, operacion, [UserRole.CLIENTE])
    target_emails = _parse_target_emails(destinatario_email, recipients)
    notification_recipients = _users_matching_emails(recipients, target_emails) or recipients
    if not target_emails:
        raise HTTPException(status_code=400, detail="No hay correo destinatario para enviar la factura")

    custom_message = (mensaje or "").strip()
    login_url = _login_url()
    body = (
        f"Hola,\n\n"
        f"Compartimos la factura en PDF de la conciliacion '{conc.nombre}' (#{conc.id}).\n"
        f"Operacion: {operacion.nombre}\n"
        f"Periodo: {conc.fecha_inicio} a {conc.fecha_fin}\n"
        f"PO autorizacion: {conc.po_numero_autorizacion or '(sin PO reportada)'}\n\n"
        f"Enviado por: {_sender_signature(user)}\n\n"
        f"Mensaje: {custom_message or '(sin mensaje)'}\n\n"
        "Adjunto encontraras la factura en formato PDF.\n"
        f"Accede aqui: {login_url}\n\n"
    )

    # Parsear cc_emails string a lista
    cc_list = []
    if cc_emails:
        cc_list = [e.strip() for e in str(cc_emails).replace(';', ',').split(',') if e.strip()]
    send_result = send_manual_email(
        target_emails,
        subject=f"Factura conciliacion {conc.nombre} #{conc.id}",
        body=body,
        attachments=[
            {
                "filename": a["filename"],
                "content": a["content"],
                "mime_type": "application/pdf",
            }
            for a in archivos_leidos
        ],
        cc_emails=cc_list or None,
    )
    if send_result["failed"] >= len(target_emails):
        detail = "No se pudo enviar el correo de factura al cliente"
        if send_result["errors"]:
            detail = f"{detail}: {send_result['errors'][0]}"
        raise HTTPException(status_code=502, detail=detail)

    conc.estado = "CERRADA"
    conc.factura_cliente_enviada = True
    _sync_viajes_conciliado_por_estado(db, conc.id, conc.estado)

    for a in archivos_leidos:
        db.add(FacturaArchivoCliente(
            conciliacion_id=conc.id,
            filename=a["filename"],
            content=a["content"],
            created_by=user.id,
        ))

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="envio_factura_cliente",
        valor_nuevo=f"destinatarios={', '.join(target_emails)}",
    )
    db.commit()
    db.refresh(conc)

    create_internal_notifications(
        db,
        notification_recipients,
        titulo="Factura enviada al cliente",
        mensaje=f"La conciliacion '{conc.nombre}' fue facturada y cerrada con PDF enviado al cliente.",
        tipo="FACTURACION",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/cerrar", response_model=ConciliacionOut)
def cerrar_conciliacion(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede cerrar conciliacion")
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    if conc.estado != "APROBADA":
        raise HTTPException(status_code=400, detail="Solo conciliaciones aprobadas pueden cerrarse")
    operacion = db.get(Operacion, conc.operacion_id)
    conc.estado = "CERRADA"
    _sync_viajes_conciliado_por_estado(db, conc.id, conc.estado)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="cierre_conciliacion",
        valor_nuevo=payload.observacion or "cierre formal",
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA, UserRole.CLIENTE, UserRole.TERCERO])
    create_internal_notifications(
        db,
        recipients,
        titulo="Conciliacion cerrada",
        mensaje=f"La conciliacion '{conc.nombre}' fue cerrada formalmente.",
        tipo="CIERRE",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.post("/comentarios", response_model=ComentarioOut)
def add_comment(
    payload: ComentarioCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol == UserRole.TERCERO:
        raise HTTPException(status_code=403, detail="Tercero no puede agregar comentarios")
    conc = db.get(Conciliacion, payload.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)
    _ensure_user_can_access_conciliacion(user, conc)

    if payload.item_id:
        item = db.get(ConciliacionItem, payload.item_id)
        if not item or item.conciliacion_id != payload.conciliacion_id:
            raise HTTPException(status_code=400, detail="Item invalido para la conciliacion")

    comment = Comentario(
        conciliacion_id=payload.conciliacion_id,
        item_id=payload.item_id,
        usuario_id=user.id,
        comentario=payload.comentario,
    )
    db.add(comment)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=payload.conciliacion_id,
        item_id=payload.item_id,
        campo="comentario",
        valor_nuevo=payload.comentario,
    )
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/{conciliacion_id}/comentarios", response_model=list[ComentarioOut])
def get_comments(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    return (
        db.query(Comentario)
        .filter(Comentario.conciliacion_id == conciliacion_id)
        .order_by(Comentario.id.desc())
        .all()
    )
