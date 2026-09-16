from io import BytesIO
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user, is_cointra_admin
from app.db.session import get_db
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.factura_archivo_cliente import FacturaArchivoCliente
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.conciliacion import (
    ConciliacionCreate,
    ConciliacionItemOut,
    ConciliacionOut,
    ConciliacionUpdate,
)
from app.schemas.historial import HistorialCambioOut, ResumenFinancieroOut
from app.schemas.viaje import AdjuntarViajesRequest, ViajeOut
from app.services.audit import log_change
from app.services.notifications import create_internal_notifications
from .conciliaciones_helpers import (
    TRANSPORTE_SERVICE_CODES,
    _validate_user_access_operacion,
    _ensure_user_can_access_conciliacion,
    _ensure_cointra_admin,
    _enrich_conciliacion,
    _build_conciliacion_totals_map,
    _sync_viajes_conciliado_por_estado,
    _should_mark_conciliado,
    _default_viaje_item_financials,
    _existing_item_viaje_ids,
    _repair_missing_viaje_items,
    _mark_borrador_dirty,
    _estado_conciliacion_viaje,
    _prefetch_avansat_for_manifest_numbers_or_raise,
    _normalize_placa_for_compare,
    _resolve_recipients,
)
from .conciliaciones_excel import _build_conciliacion_excel

router = APIRouter()


@router.post("/", response_model=ConciliacionOut)
def create_conciliacion(
    payload: ConciliacionCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Crear conciliaciones: COINTRA_ADMIN, COINTRA_USER (rol COINTRA)
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo usuarios Cointra pueden crear conciliaciones")

    operacion = db.get(Operacion, payload.operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    conc = Conciliacion(
        operacion_id=payload.operacion_id,
        nombre=payload.nombre,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        activo=True,
        borrador_guardado=False,
        enviada_facturacion=False,
        factura_cliente_enviada=False,
        created_by=user.id,
    )
    db.add(conc)
    db.flush()

    # Cargar automaticamente todos los viajes PENDIENTES de la operacion
    viajes_pendientes = (
        db.query(Viaje)
        .filter(
            Viaje.operacion_id == payload.operacion_id,
            Viaje.conciliacion_id.is_(None),
            Viaje.fecha_servicio <= payload.fecha_fin,
            Viaje.activo == True,
        )
        .order_by(Viaje.fecha_servicio.asc(), Viaje.id.asc())
        .all()
    )

    for viaje in viajes_pendientes:
        tarifa_tercero, tarifa_cliente, rentabilidad = _default_viaje_item_financials(viaje)
        item = ConciliacionItem(
            conciliacion_id=conc.id,
            viaje_id=viaje.id,
            tipo=ItemTipo.VIAJE,
            fecha_servicio=viaje.fecha_servicio,
            origen=viaje.origen,
            destino=viaje.destino,
            placa=viaje.placa,
            conductor=viaje.conductor,
            tarifa_tercero=tarifa_tercero,
            tarifa_cliente=tarifa_cliente,
            rentabilidad=rentabilidad,
            manifiesto_numero=viaje.manifiesto_numero,
            remesa=None,
            descripcion=viaje.descripcion,
            created_by=user.id,
            cargado_por=viaje.cargado_por,
        )
        estado_valor = getattr(conc.estado, "value", conc.estado)
        viaje.conciliado = _should_mark_conciliado(estado_valor)
        viaje.estado_conciliacion = str(estado_valor)
        viaje.conciliacion_id = conc.id
        db.add(item)
        log_change(
            db,
            usuario_id=user.id,
            conciliacion_id=conc.id,
            campo="viaje_adjuntado",
            valor_nuevo=f"viaje_id={viaje.id}",
        )

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="conciliacion_creada",
        valor_nuevo=f"{payload.nombre} ({payload.fecha_inicio} - {payload.fecha_fin})",
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    create_internal_notifications(
        db,
        recipients,
        titulo="Nueva conciliacion creada",
        mensaje=f"Se creo la conciliacion '{conc.nombre}' para la operacion '{operacion.nombre}'.",
        tipo="CONCILIACION",
        conciliacion_id=conc.id,
    )
    db.commit()
    return conc


@router.get("/", response_model=list[ConciliacionOut])
def list_conciliaciones(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    query = (
        db.query(Conciliacion)
        .join(Operacion, Operacion.id == Conciliacion.operacion_id)
        .options(
            selectinload(Conciliacion.operacion).selectinload(Operacion.cliente),
            selectinload(Conciliacion.operacion).selectinload(Operacion.tercero),
            selectinload(Conciliacion.creador),
        )
    )
    if user.rol == UserRole.CLIENTE:
        query = query.join(
            usuario_operaciones_asignadas,
            usuario_operaciones_asignadas.c.operacion_id == Operacion.id,
        ).filter(
            usuario_operaciones_asignadas.c.usuario_id == user.id,
            Conciliacion.estado != "BORRADOR",
        )
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id, Conciliacion.estado != "BORRADOR")
    if not is_cointra_admin(user):
        query = query.filter(Conciliacion.activo.is_(True))
    concs = query.order_by(Conciliacion.id.desc()).all()
    totals_map = _build_conciliacion_totals_map(db, [c.id for c in concs])
    return [_enrich_conciliacion(db, c, user, totals_map) for c in concs]


@router.get("/historial-cerradas", response_model=list[ConciliacionOut])
def list_closed_history(
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
    cliente_id: int | None = None,
    tercero_id: int | None = None,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = (
        db.query(Conciliacion)
        .join(Operacion, Operacion.id == Conciliacion.operacion_id)
        .options(
            selectinload(Conciliacion.operacion).selectinload(Operacion.cliente),
            selectinload(Conciliacion.operacion).selectinload(Operacion.tercero),
            selectinload(Conciliacion.creador),
        )
        .filter(Conciliacion.estado == "CERRADA")
    )
    if user.rol == UserRole.CLIENTE:
        query = query.join(
            usuario_operaciones_asignadas,
            usuario_operaciones_asignadas.c.operacion_id == Operacion.id,
        ).filter(usuario_operaciones_asignadas.c.usuario_id == user.id)
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    if not is_cointra_admin(user):
        query = query.filter(Conciliacion.activo.is_(True))
    if cliente_id:
        query = query.filter(Operacion.cliente_id == cliente_id)
    if tercero_id:
        query = query.filter(Operacion.tercero_id == tercero_id)
    if fecha_inicio:
        query = query.filter(Conciliacion.fecha_inicio >= fecha_inicio)
    if fecha_fin:
        query = query.filter(Conciliacion.fecha_fin <= fecha_fin)
    concs = query.order_by(Conciliacion.id.desc()).all()
    totals_map = _build_conciliacion_totals_map(db, [c.id for c in concs])
    return [_enrich_conciliacion(db, c, user, totals_map) for c in concs]


@router.patch("/{conciliacion_id}", response_model=ConciliacionOut)
def update_conciliacion(
    conciliacion_id: int,
    payload: ConciliacionUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No se enviaron cambios")

    if "operacion_id" in data:
        operacion = db.get(Operacion, data["operacion_id"])
        if not operacion or not operacion.activa:
            raise HTTPException(status_code=404, detail="Operacion no encontrada")

    for field, value in data.items():
        setattr(conc, field, value)

    db.commit()
    db.refresh(conc)
    return conc


@router.delete("/{conciliacion_id}")
def deactivate_conciliacion(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):

    # Permitir a cualquier usuario COINTRA
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo usuarios Cointra pueden inactivar conciliaciones")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")


    # Validar que la conciliación esté vacía (sin items ni viajes)
    items_count = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conciliacion_id).count()
    viajes_count = db.query(Viaje).filter(Viaje.conciliacion_id == conciliacion_id).count()
    if items_count > 0 or viajes_count > 0:
        raise HTTPException(status_code=400, detail="Solo se puede inactivar una conciliación vacía (sin registros ni viajes relacionados)")

    conc.activo = False
    db.commit()
    return {"ok": True}


@router.post("/{conciliacion_id}/guardar-borrador", response_model=ConciliacionOut)
def guardar_conciliacion_borrador(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede guardar borradores")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo conciliaciones en BORRADOR se pueden guardar")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    conc.borrador_guardado = True
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conciliacion_id,
        campo="guardar_borrador",
        valor_nuevo="ok",
    )
    db.commit()
    db.refresh(conc)
    return conc


@router.post("/{conciliacion_id}/reactivar")
def reactivate_conciliacion(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    conc.activo = True
    db.commit()
    return {"ok": True}


@router.get("/{conciliacion_id}/descargar-facturas")
def descargar_facturas_conciliacion(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol == UserRole.TERCERO:
        raise HTTPException(status_code=403, detail="No autorizado para descargar facturas")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)
    _ensure_user_can_access_conciliacion(user, conc)

    archivos = (
        db.query(FacturaArchivoCliente)
        .filter(FacturaArchivoCliente.conciliacion_id == conciliacion_id)
        .order_by(FacturaArchivoCliente.id.asc())
        .all()
    )
    if not archivos:
        raise HTTPException(status_code=404, detail="No hay facturas adjuntas para esta conciliacion")

    if len(archivos) == 1:
        a = archivos[0]
        return StreamingResponse(
            BytesIO(a.content),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{a.filename}"'},
        )

    buf = BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for a in archivos:
            zf.writestr(a.filename, a.content)
    buf.seek(0)
    zip_name = f"facturas_conciliacion_{conciliacion_id}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


@router.get("/{conciliacion_id}/descargar-excel")
def descargar_conciliacion_excel(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)
    _ensure_user_can_access_conciliacion(user, conc)

    items = (
        db.query(ConciliacionItem)
        .options(selectinload(ConciliacionItem.viaje).selectinload(Viaje.servicio))
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .order_by(ConciliacionItem.id.asc())
        .all()
    )
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
    return StreamingResponse(
        BytesIO(excel_content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{conciliacion_id}/viajes-pendientes", response_model=list[dict])
def get_pending_viajes(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede ver viajes pendientes de adjuntar")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo conciliaciones en BORRADOR permiten adjuntar viajes")

    already_linked_viaje_ids = _existing_item_viaje_ids(db)

    viajes = (
        db.query(Viaje)
        .filter(
            Viaje.operacion_id == conc.operacion_id,
            Viaje.conciliacion_id.is_(None),
            Viaje.activo.is_(True),
        )
        .order_by(Viaje.fecha_servicio.asc(), Viaje.id.asc())
        .all()
    )

    if already_linked_viaje_ids:
        viajes = [v for v in viajes if v.id not in already_linked_viaje_ids]

    payload: list[dict] = []
    for viaje in viajes:
        out = ViajeOut.model_validate(viaje).model_dump()
        out["estado_conciliacion"] = _estado_conciliacion_viaje(viaje)
        if viaje.servicio:
            out["servicio_nombre"] = viaje.servicio.nombre
            out["servicio_codigo"] = viaje.servicio.codigo
        payload.append(out)

    return payload


@router.post("/{conciliacion_id}/adjuntar-viajes", response_model=list[ConciliacionItemOut])
def attach_pending_viajes(
    conciliacion_id: int,
    payload: AdjuntarViajesRequest,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede adjuntar viajes")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo conciliaciones en BORRADOR permiten adjuntar viajes")

    already_linked_viaje_ids = _existing_item_viaje_ids(db)

    viajes = (
        db.query(Viaje)
        .filter(
            Viaje.id.in_(payload.viaje_ids),
            Viaje.operacion_id == conc.operacion_id,
            Viaje.conciliacion_id.is_(None),
        )
        .all()
    )

    if already_linked_viaje_ids:
        viajes = [v for v in viajes if v.id not in already_linked_viaje_ids]

    if not viajes:
        raise HTTPException(status_code=400, detail="No hay viajes pendientes validos para adjuntar")

    created_items: list[ConciliacionItem] = []
    for viaje in viajes:
        tarifa_tercero, tarifa_cliente, rentabilidad = _default_viaje_item_financials(viaje)
        item = ConciliacionItem(
            conciliacion_id=conc.id,
            viaje_id=viaje.id,
            tipo=ItemTipo.VIAJE,
            fecha_servicio=viaje.fecha_servicio,
            origen=viaje.origen,
            destino=viaje.destino,
            placa=viaje.placa,
            conductor=viaje.conductor,
            tarifa_tercero=tarifa_tercero,
            tarifa_cliente=tarifa_cliente,
            rentabilidad=rentabilidad,
            manifiesto_numero=viaje.manifiesto_numero,
            remesa=None,
            descripcion=viaje.descripcion,
            created_by=user.id,
            cargado_por=viaje.cargado_por,
        )
        estado_valor = getattr(conc.estado, "value", conc.estado)
        viaje.conciliado = _should_mark_conciliado(estado_valor)
        viaje.estado_conciliacion = str(estado_valor)
        viaje.conciliacion_id = conc.id
        db.add(item)
        log_change(
            db,
            usuario_id=user.id,
            conciliacion_id=conc.id,
            campo="viaje_adjuntado",
            valor_nuevo=f"viaje_id={viaje.id}",
        )
        created_items.append(item)

    _mark_borrador_dirty(conc)

    db.commit()
    for item in created_items:
        db.refresh(item)
    return created_items


@router.delete("/{conciliacion_id}/viajes/{viaje_id}")
def detach_viaje_from_conciliacion(
    conciliacion_id: int,
    viaje_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede quitar viajes")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo puedes quitar viajes cuando la conciliacion esta en BORRADOR")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    viaje = db.get(Viaje, viaje_id)
    if not viaje or viaje.conciliacion_id != conciliacion_id:
        raise HTTPException(status_code=404, detail="Viaje no encontrado en esta conciliacion")

    # Obtener IDs de los items a eliminar para limpiar historial primero.
    item_ids_to_delete = [
        row[0]
        for row in db.query(ConciliacionItem.id)
        .filter(
            ConciliacionItem.conciliacion_id == conciliacion_id,
            ConciliacionItem.tipo == ItemTipo.VIAJE,
            ConciliacionItem.viaje_id == viaje_id,
        )
        .all()
    ]

    if item_ids_to_delete:
        # Desvincula historial_cambios para evitar FK violation
        db.query(HistorialCambio).filter(
            HistorialCambio.item_id.in_(item_ids_to_delete)
        ).update({HistorialCambio.item_id: None}, synchronize_session=False)

        # Limpia todos los items VIAJE vinculados para ese viaje en esta conciliacion.
        db.query(ConciliacionItem).filter(
            ConciliacionItem.id.in_(item_ids_to_delete)
        ).delete(synchronize_session=False)

    viaje.conciliacion_id = None
    viaje.estado_conciliacion = None
    viaje.conciliado = False

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conciliacion_id,
        campo="viaje_desadjuntado",
        valor_nuevo=f"viaje_id={viaje_id}",
    )

    _mark_borrador_dirty(conc)

    db.commit()
    return {"ok": True}


@router.get("/{conciliacion_id}/historial", response_model=list[HistorialCambioOut])
def get_historial(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Solo Cointra: valor_anterior/valor_nuevo son texto libre y pueden contener
    # tarifas/rentabilidad (ver log_change en conciliaciones_items.py), que no se
    # pueden sanitizar campo por campo como sí hace sanitize_item_for_role().
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede ver el historial de cambios")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    return (
        db.query(HistorialCambio)
        .filter(HistorialCambio.conciliacion_id == conciliacion_id)
        .order_by(HistorialCambio.id.desc())
        .all()
    )


@router.get("/{conciliacion_id}/resumen-financiero", response_model=ResumenFinancieroOut)
def get_resumen_financiero(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    items = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conciliacion_id).all()
    total_tercero = sum(float(i.tarifa_tercero or 0) for i in items)
    total_cliente = sum(float(i.tarifa_cliente or 0) for i in items)
    total_rentabilidad_valor = total_cliente - total_tercero
    pct_vals = [float(i.rentabilidad) for i in items if i.rentabilidad is not None]
    pct_promedio = (sum(pct_vals) / len(pct_vals)) if pct_vals else 0

    if user.rol == UserRole.COINTRA:
        return {
            "total_tarifa_tercero": total_tercero,
            "total_tarifa_cliente": total_cliente,
            "total_rentabilidad_valor": total_rentabilidad_valor,
            "total_rentabilidad_pct_promedio": pct_promedio,
        }
    if user.rol == UserRole.CLIENTE:
        return {
            "total_tarifa_tercero": None,
            "total_tarifa_cliente": total_cliente,
            "total_rentabilidad_valor": None,
            "total_rentabilidad_pct_promedio": None,
        }
    return {
        "total_tarifa_tercero": total_tercero,
        "total_tarifa_cliente": None,
        "total_rentabilidad_valor": None,
        "total_rentabilidad_pct_promedio": None,
    }
