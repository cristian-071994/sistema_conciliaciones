from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemEstado, ItemTipo, UserRole
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.conciliacion import (
    ClienteItemDecision,
    ConciliacionItemCreate,
    ConciliacionItemOut,
    ConciliacionItemPatch,
    ConciliacionItemUpdateEstado,
    LiquidacionContratoFijoCreate,
)
from app.services.audit import log_change
from app.services.notifications import create_internal_notifications
from app.services.pricing import apply_rentabilidad
from app.services.visibility import sanitize_item_for_role
from .conciliaciones_helpers import (
    TRANSPORTE_SERVICE_CODES,
    _validate_user_access_operacion,
    _ensure_user_can_access_conciliacion,
    _mark_borrador_dirty,
    _extract_liquidacion_metadata,
    _build_liquidacion_metadata,
    _next_liquidacion_id,
    _liquidacion_exists,
    _normalize_manifiesto_for_lookup,
    _is_transport_item,
    _validate_transport_item_manifest_or_raise,
    _repair_missing_viaje_items,
    _default_viaje_item_financials,
    _should_mark_conciliado,
    _fetch_avansat_with_fallback,
    _item_servicio_codigo,
    _resolve_recipients,
)

router = APIRouter()


@router.post("/items", response_model=ConciliacionItemOut)
def create_item(
    payload: ConciliacionItemCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede crear items")
    conc = db.get(Conciliacion, payload.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    item = ConciliacionItem(
        conciliacion_id=payload.conciliacion_id,
        tipo=payload.tipo,
        fecha_servicio=payload.fecha_servicio,
        origen=payload.origen,
        destino=payload.destino,
        placa=payload.placa,
        conductor=payload.conductor,
        tarifa_tercero=payload.tarifa_tercero,
        tarifa_cliente=payload.tarifa_cliente,
        manifiesto_numero=payload.manifiesto_numero,
        remesa=payload.remesa,
        descripcion=payload.descripcion,
        created_by=user.id,
        cargado_por=user.rol.value,
    )

    if user.rol in [UserRole.TERCERO, UserRole.COINTRA]:
        if item.tarifa_tercero and not item.tarifa_cliente:
            apply_rentabilidad(item, operacion)

    db.add(item)
    _mark_borrador_dirty(conc)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="item_creado",
        valor_nuevo=f"tipo={item.tipo}; fecha={item.fecha_servicio}",
    )
    db.commit()
    db.refresh(item)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    create_internal_notifications(
        db,
        recipients,
        titulo="Decision de cliente sobre item",
        mensaje=f"El cliente marco el item #{item.id} como {item.estado} en la conciliacion '{conc.nombre}'.",
        tipo="APROBACION",
        conciliacion_id=conc.id,
    )
    db.commit()
    return item


@router.get("/{conciliacion_id}/items", response_model=list[ConciliacionItemOut])
def list_items(
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

    if _repair_missing_viaje_items(db, conc, user.id):
        db.commit()

    items = (
        db.query(ConciliacionItem)
        .options(selectinload(ConciliacionItem.viaje).selectinload(Viaje.servicio))
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .order_by(ConciliacionItem.id.desc())
        .all()
    )

    enriched_items: list[dict] = []
    for item in items:
        payload = ConciliacionItemOut.model_validate(item).model_dump()
        liquidacion_meta = _extract_liquidacion_metadata(item)
        if liquidacion_meta:
            payload.update(liquidacion_meta)
        enriched_items.append(sanitize_item_for_role(payload, user.rol))

    return enriched_items


@router.post("/{conciliacion_id}/liquidacion-contrato-fijo", response_model=list[ConciliacionItemOut])
def create_liquidacion_contrato_fijo(
    conciliacion_id: int,
    payload: LiquidacionContratoFijoCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede crear liquidaciones de contrato fijo")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo conciliaciones en BORRADOR permiten agregar liquidaciones")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    if payload.periodo_inicio > payload.periodo_fin:
        raise HTTPException(status_code=400, detail="El periodo de inicio no puede ser mayor al periodo final")

    liquidacion_id = payload.liquidacion_id
    if liquidacion_id is None:
        liquidacion_id = _next_liquidacion_id(db, conc.id)
    elif not _liquidacion_exists(db, conc.id, liquidacion_id):
        raise HTTPException(
            status_code=400,
            detail="La liquidacion seleccionada no existe en esta conciliacion. Crea una nueva primero.",
        )

    placas_norm = sorted({placa.strip().upper() for placa in payload.placas if placa and placa.strip()})
    if not placas_norm:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos una placa")

    vehiculos = (
        db.query(Vehiculo)
        .filter(
            Vehiculo.placa.in_(placas_norm),
            Vehiculo.activo.is_(True),
            Vehiculo.tercero_id == operacion.tercero_id,
        )
        .all()
    )
    vehiculos_by_placa = {v.placa.upper(): v for v in vehiculos}
    faltantes = [placa for placa in placas_norm if placa not in vehiculos_by_placa]
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=(
                "Las siguientes placas no estan disponibles para el tercero de la operacion: "
                + ", ".join(faltantes)
            ),
        )

    # Impedir duplicados: una placa solo puede tener un registro de liquidacion por conciliacion.
    existing_liq_items = (
        db.query(ConciliacionItem)
        .filter(ConciliacionItem.conciliacion_id == conc.id)
        .all()
    )
    existing_liq_placas = {
        str(i.placa or "").strip().upper()
        for i in existing_liq_items
        if _extract_liquidacion_metadata(i)
    }
    duplicadas = [p for p in placas_norm if p in existing_liq_placas]
    if duplicadas:
        raise HTTPException(
            status_code=400,
            detail=(
                "Ya existe un registro de liquidacion contrato fijo para la(s) placa(s): "
                + ", ".join(duplicadas)
            ),
        )

    created_rows: list[ConciliacionItem] = []
    for placa in placas_norm:
        tarifa_tercero = float(payload.valor_tercero)
        item = ConciliacionItem(
            conciliacion_id=conc.id,
            tipo=ItemTipo.OTRO,
            fecha_servicio=payload.periodo_fin,
            origen="Liquidacion Contrato Fijo",
            destino="Liquidacion Contrato Fijo",
            placa=placa,
            conductor=None,
            tarifa_tercero=tarifa_tercero,
            tarifa_cliente=None,
            rentabilidad=None,
            manifiesto_numero=None,
            remesa=None,
            descripcion=_build_liquidacion_metadata(
                liquidacion_id,
                payload.periodo_inicio,
                payload.periodo_fin,
            ),
            created_by=user.id,
            cargado_por=user.rol.value,
        )
        apply_rentabilidad(item, operacion)
        db.add(item)
        db.flush()
        created_rows.append(item)

        log_change(
            db,
            usuario_id=user.id,
            conciliacion_id=conc.id,
            item_id=item.id,
            campo="liquidacion_contrato_fijo_creada",
            valor_nuevo=(
                f"liquidacion_id={liquidacion_id}; placa={placa}; periodo={payload.periodo_inicio} a {payload.periodo_fin}; "
                f"valor_tercero={tarifa_tercero}"
            ),
        )

    _mark_borrador_dirty(conc)

    db.commit()
    for row in created_rows:
        db.refresh(row)

    result: list[dict] = []
    for row in created_rows:
        row_payload = ConciliacionItemOut.model_validate(row).model_dump()
        meta = _extract_liquidacion_metadata(row)
        if meta:
            row_payload.update(meta)
        result.append(sanitize_item_for_role(row_payload, user.rol))

    return result


@router.delete("/items/{item_id}")
def delete_liquidacion_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede eliminar registros de liquidacion")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conc = db.get(Conciliacion, item.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo en BORRADOR se pueden eliminar registros de liquidacion")

    liq_meta = _extract_liquidacion_metadata(item)
    if not liq_meta:
        raise HTTPException(status_code=400, detail="Solo se pueden eliminar registros del bloque contrato fijo")

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=None,
        campo="liquidacion_contrato_fijo_eliminada",
        valor_anterior=f"item_id={item.id}; placa={item.placa}; t3={item.tarifa_tercero}; tc={item.tarifa_cliente}",
    )
    _mark_borrador_dirty(conc)
    db.query(HistorialCambio).filter(HistorialCambio.item_id == item.id).update(
        {HistorialCambio.item_id: None},
        synchronize_session=False,
    )

    # Buscar y eliminar el item de Disponibilidad de la misma placa en esta conciliacion
    placa_norm = str(item.placa or "").strip().upper()
    if placa_norm:
        disp_items = (
            db.query(ConciliacionItem)
            .filter(
                ConciliacionItem.conciliacion_id == conc.id,
                ConciliacionItem.id != item.id,
            )
            .all()
        )
        for d_item in disp_items:
            if str(d_item.placa or "").strip().upper() != placa_norm:
                continue
            if not d_item.viaje_id:
                continue
            viaje = db.get(Viaje, d_item.viaje_id)
            if not viaje:
                continue
            servicio = db.get(Servicio, viaje.servicio_id) if viaje.servicio_id else None
            es_disp = (
                servicio and (
                    str(servicio.codigo or "").strip().upper() == "DISPONIBILIDAD"
                    or str(servicio.nombre or "").strip().lower() == "disponibilidad"
                )
            ) or "disponibilidad" in str(viaje.titulo or "").lower()
            if not es_disp:
                continue
            db.query(HistorialCambio).filter(HistorialCambio.item_id == d_item.id).update(
                {HistorialCambio.item_id: None}, synchronize_session=False
            )
            db.delete(d_item)
            viaje.conciliacion_id = None
            viaje.estado_conciliacion = None
            viaje.activo = False

    db.delete(item)
    db.commit()
    return {"ok": True}


@router.delete("/{conciliacion_id}/disponibilidad/{item_id}")
def delete_disponibilidad_item(
    conciliacion_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Elimina un item de servicio Disponibilidad (auto-creado) y desactiva el viaje subyacente."""
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede eliminar items de disponibilidad")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo en BORRADOR se pueden eliminar items de disponibilidad")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    item = db.get(ConciliacionItem, item_id)
    if not item or item.conciliacion_id != conciliacion_id:
        raise HTTPException(status_code=404, detail="Item no encontrado en esta conciliacion")

    if not item.viaje_id:
        raise HTTPException(status_code=400, detail="Solo se pueden eliminar items de servicio Disponibilidad")

    viaje = db.get(Viaje, item.viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje subyacente no encontrado")

    servicio = db.get(Servicio, viaje.servicio_id) if viaje.servicio_id else None
    es_disponibilidad = (
        servicio and (
            str(servicio.codigo or "").strip().upper() == "DISPONIBILIDAD"
            or str(servicio.nombre or "").strip().lower() == "disponibilidad"
        )
    ) or "disponibilidad" in str(viaje.titulo or "").lower()

    if not es_disponibilidad:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden eliminar items de servicio Disponibilidad creados automaticamente",
        )

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conciliacion_id,
        campo="disponibilidad_eliminada",
        valor_anterior=f"item_id={item.id}; viaje_id={viaje.id}; placa={item.placa}; t3={item.tarifa_tercero}",
    )

    # Limpiar FK del historial antes de borrar el item
    db.query(HistorialCambio).filter(HistorialCambio.item_id == item.id).update(
        {HistorialCambio.item_id: None}, synchronize_session=False
    )
    db.delete(item)

    # Desactivar el viaje auto-creado
    viaje.conciliacion_id = None
    viaje.estado_conciliacion = None
    viaje.conciliado = False
    viaje.activo = False

    _mark_borrador_dirty(conc)
    db.commit()
    return {"ok": True}


@router.patch("/items/{item_id}/estado", response_model=ConciliacionItemOut)
def update_item_estado(
    item_id: int,
    payload: ConciliacionItemUpdateEstado,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede cambiar estado de items")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conc = db.get(Conciliacion, item.conciliacion_id)
    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_estado = item.estado
    item.estado = payload.estado
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=item.id,
        campo="estado_item",
        valor_anterior=old_estado,
        valor_nuevo=payload.estado,
    )

    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=ConciliacionItemOut)
def patch_item(
    item_id: int,
    payload: ConciliacionItemPatch,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede actualizar items")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conc = db.get(Conciliacion, item.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    can_edit_borrador = conc.estado == "BORRADOR"
    can_fix_manifiesto_aprobada = conc.estado == "APROBADA" and not conc.enviada_facturacion
    if not can_edit_borrador and not can_fix_manifiesto_aprobada:
        raise HTTPException(status_code=400, detail="Solo se puede editar en BORRADOR")

    changed = payload.model_fields_set
    if can_fix_manifiesto_aprobada:
        if not _is_transport_item(item):
            raise HTTPException(
                status_code=400,
                detail="Solo servicios de transporte (VIAJE/VIAJE_ADICIONAL) permiten ajustar manifiesto en estado APROBADA",
            )
        if not changed or not changed.issubset({"manifiesto_numero"}):
            raise HTTPException(
                status_code=400,
                detail="En APROBADA solo puedes corregir el manifiesto para enviar a facturacion",
            )

    if can_edit_borrador and changed:
        _mark_borrador_dirty(conc)

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_manifiesto = item.manifiesto_numero
    old_remesa = item.remesa
    old_fecha_servicio = item.fecha_servicio
    old_origen = item.origen
    old_destino = item.destino
    old_placa = item.placa
    old_conductor = item.conductor
    old_tarifa_tercero = item.tarifa_tercero
    old_tarifa_cliente = item.tarifa_cliente
    old_rentabilidad = item.rentabilidad
    old_descripcion = item.descripcion

    if "fecha_servicio" in changed:
        if payload.fecha_servicio is None:
            raise HTTPException(status_code=400, detail="La fecha del servicio es obligatoria")
        item.fecha_servicio = payload.fecha_servicio

    if "origen" in changed:
        normalized_origen = str(payload.origen or "").strip()
        item.origen = normalized_origen or None

    if "destino" in changed:
        normalized_destino = str(payload.destino or "").strip()
        item.destino = normalized_destino or None

    if "placa" in changed:
        normalized_placa = str(payload.placa or "").strip().upper()
        item.placa = normalized_placa or None

    if "conductor" in changed:
        normalized_conductor = str(payload.conductor or "").strip()
        item.conductor = normalized_conductor or None

    if "manifiesto_numero" in changed:
        item.manifiesto_numero = payload.manifiesto_numero
    if "remesa" in changed:
        item.remesa = payload.remesa
    if "descripcion" in changed:
        normalized_descripcion = str(payload.descripcion or "").strip()
        item.descripcion = normalized_descripcion or None

    pct = float(operacion.porcentaje_rentabilidad)
    # Usar rentabilidad actual del ítem; solo como fallback la de la operación
    pct = float(item.rentabilidad) if item.rentabilidad is not None else float(operacion.porcentaje_rentabilidad)

    tarifa_fields = changed & {"tarifa_tercero", "tarifa_cliente", "rentabilidad"}
    if tarifa_fields:
        if "tarifa_tercero" in changed and "tarifa_cliente" not in changed and "rentabilidad" not in changed:
            # Modificó tarifa_tercero → recalcular tarifa_cliente; rentabilidad no cambia
            item.tarifa_tercero = payload.tarifa_tercero
            if pct < 100:
                item.tarifa_cliente = payload.tarifa_tercero / (1 - pct / 100)
        elif "tarifa_cliente" in changed and "tarifa_tercero" not in changed and "rentabilidad" not in changed:
            # Modificó tarifa_cliente → recalcular tarifa_tercero; rentabilidad no cambia
            item.tarifa_cliente = payload.tarifa_cliente
            item.tarifa_tercero = payload.tarifa_cliente * (1 - pct / 100)
        elif "rentabilidad" in changed:
            # Modificó % rentabilidad → guardar nuevo %, recalcular tarifa_tercero; tarifa_cliente no cambia
            new_pct = payload.rentabilidad if payload.rentabilidad is not None else pct
            item.rentabilidad = new_pct
            if item.tarifa_cliente is not None and new_pct < 100:
                item.tarifa_tercero = float(item.tarifa_cliente) * (1 - new_pct / 100)

    if {"manifiesto_numero", "placa"} & changed:
        # Solo validar si el manifiesto tiene valor (no está siendo eliminado)
        if item.manifiesto_numero:
            _validate_transport_item_manifest_or_raise(db, item)

    # Mantener viaje sincronizado con la corrección final de conciliación para evitar divergencias.
    if item.viaje_id is not None:
        viaje = db.get(Viaje, item.viaje_id)
        if viaje:
            if "fecha_servicio" in changed and item.fecha_servicio:
                viaje.fecha_servicio = item.fecha_servicio
            if "origen" in changed:
                viaje.origen = item.origen or ""
            if "destino" in changed:
                viaje.destino = item.destino or ""
            if "placa" in changed and item.placa:
                viaje.placa = item.placa
            if "conductor" in changed:
                viaje.conductor = item.conductor
            if "manifiesto_numero" in changed:
                viaje.manifiesto_numero = item.manifiesto_numero
            if "descripcion" in changed:
                viaje.descripcion = item.descripcion
            if tarifa_fields:
                if item.tarifa_tercero is not None:
                    viaje.tarifa_tercero = item.tarifa_tercero
                if item.tarifa_cliente is not None:
                    viaje.tarifa_cliente = item.tarifa_cliente
                if item.rentabilidad is not None:
                    viaje.rentabilidad = item.rentabilidad

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=item.id,
        campo="actualizacion_manual_item",
        valor_anterior=(
            f"fecha={old_fecha_servicio}; origen={old_origen}; destino={old_destino}; "
            f"placa={old_placa}; conductor={old_conductor}; manifiesto={old_manifiesto}; "
            f"remesa={old_remesa}; t3={old_tarifa_tercero}; tc={old_tarifa_cliente}; "
            f"rent={old_rentabilidad}; descripcion={old_descripcion}"
        ),
        valor_nuevo=(
            f"fecha={item.fecha_servicio}; origen={item.origen}; destino={item.destino}; "
            f"placa={item.placa}; conductor={item.conductor}; manifiesto={item.manifiesto_numero}; "
            f"remesa={item.remesa}; t3={item.tarifa_tercero}; tc={item.tarifa_cliente}; "
            f"rent={item.rentabilidad}; descripcion={item.descripcion}"
        ),
    )

    db.commit()
    db.refresh(item)
    item_payload = ConciliacionItemOut.model_validate(item).model_dump()
    liquidacion_meta = _extract_liquidacion_metadata(item)
    if liquidacion_meta:
        item_payload.update(liquidacion_meta)
    return sanitize_item_for_role(item_payload, user.rol)


@router.patch("/items/{item_id}/decision-cliente", response_model=ConciliacionItemOut)
def cliente_decide_item(
    item_id: int,
    payload: ClienteItemDecision,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede aprobar/rechazar items")
    if payload.estado not in [ItemEstado.APROBADO, ItemEstado.RECHAZADO]:
        raise HTTPException(status_code=400, detail="Estado permitido para Cliente: APROBADO o RECHAZADO")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    conc = db.get(Conciliacion, item.conciliacion_id)
    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_estado = item.estado
    item.estado = payload.estado
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=item.id,
        campo="decision_cliente_item",
        valor_anterior=old_estado,
        valor_nuevo=payload.estado,
    )
    if payload.comentario:
        db.add(
            Comentario(
                conciliacion_id=conc.id,
                item_id=item.id,
                usuario_id=user.id,
                comentario=payload.comentario,
            )
        )

    db.commit()
    db.refresh(item)
    return item
