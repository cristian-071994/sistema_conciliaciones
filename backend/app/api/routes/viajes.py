from datetime import date, datetime
from io import BytesIO
import re
import unicodedata

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from openpyxl import load_workbook
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, is_cointra_admin, require_permission
from app.core.upload_limits import CARGA_MASIVA_EXCEL_MAX_BYTES
from app.db.session import get_db
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import UserRole
from app.models.enums import ItemTipo
from app.models.operacion import Operacion
from app.models.servicio import Servicio
from app.models.servicio_adjunto import ServicioAdjunto
from app.models.usuario import Usuario
from app.models.manifiesto_viaje_adicional import ManifiestoViajeAdicional
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.models.viaje_adicional import SolicitudViajeAdicional
from app.schemas.viaje import CargaMasivaFilaPreview, CargaMasivaResultado, ViajeCreate, ViajeOut, ViajeUpdate
from app.services.avansat_cache import resolve_avansat_from_cache_only
from app.services.carga_masiva_plantilla import construir_plantilla
from app.services.permisos_service import tiene_permiso
from app.services.pricing import calculate_tarifa_cliente
from app.services.standby import (
    aplicar_cambio_rango_standby,
    buscar_tarifa_catalogo,
    calcular_horas_standby,
    es_standby,
    resolver_standby_carga_masiva,
    valor_por_hora,
)

router = APIRouter(prefix="/viajes", tags=["viajes"])


def _estado_conciliacion_valor(viaje: Viaje) -> str | None:
    if viaje.estado_conciliacion:
        return viaje.estado_conciliacion
    if not viaje.conciliacion:
        return None
    estado = viaje.conciliacion.estado
    return getattr(estado, "value", estado)


def _expected_conciliado(viaje: Viaje) -> bool:
    estado = _estado_conciliacion_valor(viaje)
    if estado is None:
        return False
    return estado in {"APROBADA", "CERRADA"}


def _validate_user_access_operacion(user: Usuario, operacion: Operacion) -> None:
    if user.rol == UserRole.CLIENTE:
        is_assigned = any(op.id == operacion.id for op in user.operaciones_asignadas)
        if not is_assigned:
            raise HTTPException(status_code=403, detail="Operacion no disponible para este cliente")
    if user.rol == UserRole.TERCERO and user.tercero_id != operacion.tercero_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este tercero")


def _ensure_viaje_mutable(viaje: Viaje, db: Session) -> None:
    """Evita alterar historicos cuando el viaje ya quedo dentro de una conciliacion en flujo avanzado."""
    if viaje.conciliacion_id is None:
        return

    conciliacion = viaje.conciliacion or db.get(Conciliacion, viaje.conciliacion_id)
    if not conciliacion:
        return

    estado = getattr(conciliacion.estado, "value", conciliacion.estado)
    if estado != "BORRADOR":
        raise HTTPException(
            status_code=400,
            detail=(
                "Este viaje pertenece a una conciliacion en estado "
                f"{estado}. No se puede modificar para proteger el historico liquidado/facturado."
            ),
        )


def _is_viaje_or_extra(servicio: Servicio | None) -> bool:
    if not servicio:
        return True
    return servicio.codigo in {"VIAJE", "VIAJE_ADICIONAL"}


def _is_conductor_relevo(servicio: Servicio | None) -> bool:
    if not servicio:
        return False
    return servicio.codigo == "CONDUCTOR_RELEVO"


def _needs_origen_destino(servicio: Servicio | None) -> bool:
    """Retorna True si el servicio requiere origen y destino en formulario"""
    if not servicio:
        return True  # por defecto, si no hay servicio, se trata como viaje
    return servicio.requiere_origen_destino


@router.post("", response_model=ViajeOut)
def create_viaje(
    payload: ViajeCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Un Tercero siempre puede cargar sus propios viajes (regla de negocio
    # fija); un Cointra necesita el permiso "viajes.crear".
    if user.rol == UserRole.TERCERO:
        allowed = True
    elif user.rol == UserRole.COINTRA:
        allowed = tiene_permiso(db, user, "viajes.crear")
    else:
        allowed = False

    if not allowed:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear viajes")

    operacion = db.get(Operacion, payload.operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    servicio = None
    if payload.servicio_id is not None:
        servicio = db.get(Servicio, payload.servicio_id)
        if not servicio or not servicio.activo:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")

    is_conductor_relevo = _is_conductor_relevo(servicio)
    placa = "N/A" if is_conductor_relevo else payload.placa.strip().upper()
    
    origen = payload.origen.strip() if payload.origen and payload.origen.strip() else ""
    destino = payload.destino.strip() if payload.destino and payload.destino.strip() else ""

    # Validar que origen y destino estén presentes si el servicio así lo requiere
    if _needs_origen_destino(servicio):
        if not origen:
            raise HTTPException(status_code=400, detail="Origen es obligatorio para este servicio")
        if not destino:
            raise HTTPException(status_code=400, detail="Destino es obligatorio para este servicio")
    else:
        origen = origen or "N/A"
        destino = destino or "N/A"
    
    tarifa_tercero = float(payload.tarifa_tercero or 0)
    tarifa_cliente = float(payload.tarifa_cliente or 0)
    rentabilidad = None
    hora_inicio = None
    hora_fin = None
    fecha_hora_inicio = None
    fecha_hora_fin = None
    fecha_servicio = payload.fecha_servicio
    horas_cantidad = None

    if is_conductor_relevo:
        horas_cantidad = 1.0

        tarifa_manual_tercero = float(payload.tarifa_tercero or 0)
        tarifa_manual_cliente = float(payload.tarifa_cliente or 0)
        if tarifa_manual_tercero <= 0:
            raise HTTPException(
                status_code=400,
                detail="Debes ingresar tarifa manual para el servicio Conductor relevo.",
            )

        if tarifa_manual_cliente <= 0:
            tarifa_manual_cliente, rentabilidad = calculate_tarifa_cliente(tarifa_manual_tercero, operacion)
        else:
            if tarifa_manual_cliente > 0:
                rentabilidad = round((1 - (tarifa_manual_tercero / tarifa_manual_cliente)) * 100, 2)

        tarifa_tercero = round(tarifa_manual_tercero, 2)
        tarifa_cliente = round(float(tarifa_manual_cliente), 2)
    elif not _is_viaje_or_extra(servicio):
        vehiculo = db.query(Vehiculo).filter(Vehiculo.placa == placa, Vehiculo.activo.is_(True)).first()
        if not vehiculo:
            raise HTTPException(status_code=400, detail="La placa seleccionada no tiene vehiculo activo")

        tarifa_catalogo = buscar_tarifa_catalogo(db, servicio, vehiculo.tipo_vehiculo_id)
        factor = 1.0
        if es_standby(servicio):
            try:
                horas_cantidad = calcular_horas_standby(payload.fecha_hora_inicio, payload.fecha_hora_fin)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            fecha_hora_inicio = payload.fecha_hora_inicio
            fecha_hora_fin = payload.fecha_hora_fin
            hora_inicio = fecha_hora_inicio.time()
            hora_fin = fecha_hora_fin.time()
            # El Stand By se concilia en el día en que empieza.
            fecha_servicio = fecha_hora_inicio.date()
            factor = horas_cantidad
        else:
            horas_cantidad = 1.0

        if tarifa_catalogo:
            tarifa_tercero = round(float(tarifa_catalogo.tarifa_tercero) * factor, 2)
            tarifa_cliente = round(float(tarifa_catalogo.tarifa_cliente) * factor, 2)
            rentabilidad = float(tarifa_catalogo.rentabilidad_pct)
        else:
            tarifa_manual_tercero = float(payload.tarifa_tercero or 0)
            tarifa_manual_cliente = float(payload.tarifa_cliente or 0)
            if tarifa_manual_tercero <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="No hay tarifa parametrizada para ese servicio y tipo de vehiculo. Debes ingresar tarifa manual.",
                )

            if tarifa_manual_cliente <= 0:
                tarifa_manual_cliente, rentabilidad = calculate_tarifa_cliente(tarifa_manual_tercero, operacion)
            else:
                if tarifa_manual_cliente > 0:
                    rentabilidad = round((1 - (tarifa_manual_tercero / tarifa_manual_cliente)) * 100, 2)

            tarifa_tercero = round(tarifa_manual_tercero * factor, 2)
            tarifa_cliente = round(float(tarifa_manual_cliente) * factor, 2)

    if _is_viaje_or_extra(servicio) and tarifa_tercero and not tarifa_cliente:
        tarifa_cliente, rentabilidad = calculate_tarifa_cliente(float(tarifa_tercero), operacion)

    viaje = Viaje(
        operacion_id=payload.operacion_id,
        tercero_id=operacion.tercero_id,
        servicio_id=servicio.id if servicio else None,
        titulo=payload.titulo.strip(),
        fecha_servicio=fecha_servicio,
        origen=origen,
        destino=destino,
        placa=placa,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        fecha_hora_inicio=fecha_hora_inicio,
        fecha_hora_fin=fecha_hora_fin,
        horas_cantidad=horas_cantidad,
        conductor=None if is_conductor_relevo else payload.conductor,
        tarifa_tercero=tarifa_tercero,
        tarifa_cliente=tarifa_cliente,
        rentabilidad=rentabilidad,
        manifiesto_numero=payload.manifiesto_numero,
        descripcion=payload.descripcion,
        created_by=user.id,
        cargado_por=user.rol.value,
        estado_conciliacion=None,
        activo=True,
    )

    db.add(viaje)
    db.commit()
    db.refresh(viaje)
    return viaje


@router.get("", response_model=list[dict])
def list_viajes(
    operacion_id: int | None = None,
    only_pending: bool = False,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = (
        db.query(Viaje)
        .join(Operacion, Operacion.id == Viaje.operacion_id)
        .options(selectinload(Viaje.conciliacion), selectinload(Viaje.servicio))
    )
    if not is_cointra_admin(user):
        query = query.filter(Viaje.activo.is_(True))
    if user.rol == UserRole.CLIENTE:
        query = query.join(
            usuario_operaciones_asignadas,
            usuario_operaciones_asignadas.c.operacion_id == Operacion.id,
        ).filter(usuario_operaciones_asignadas.c.usuario_id == user.id)
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    if operacion_id:
        query = query.filter(Viaje.operacion_id == operacion_id)
    if only_pending:
        query = query.filter(Viaje.conciliado.is_(False))
    if fecha_desde:
        query = query.filter(Viaje.fecha_servicio >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Viaje.fecha_servicio <= fecha_hasta)

    viajes = query.order_by(Viaje.id.desc()).all()

    changed = False

    # Repara enlaces historicos: item VIAJE existente sin viaje.conciliacion_id sincronizado.
    viaje_ids = [v.id for v in viajes]
    item_conciliacion_by_viaje_id: dict[int, int] = {}
    item_snapshot_by_viaje_id: dict[int, ConciliacionItem] = {}
    if viaje_ids:
        item_rows = (
            db.query(ConciliacionItem)
            .filter(
                ConciliacionItem.tipo == ItemTipo.VIAJE,
                ConciliacionItem.viaje_id.in_(viaje_ids),
                ConciliacionItem.viaje_id.is_not(None),
            )
            .order_by(ConciliacionItem.id.desc())
            .all()
        )
        for row in item_rows:
            viaje_id = row.viaje_id
            conciliacion_id = row.conciliacion_id
            if viaje_id is None:
                continue
            if viaje_id not in item_conciliacion_by_viaje_id:
                item_conciliacion_by_viaje_id[viaje_id] = conciliacion_id
                item_snapshot_by_viaje_id[viaje_id] = row

    conciliacion_ids_from_items = set(item_conciliacion_by_viaje_id.values())
    conciliaciones_map: dict[int, str] = {}
    if conciliacion_ids_from_items:
        conciliaciones = (
            db.query(Conciliacion.id, Conciliacion.estado)
            .filter(Conciliacion.id.in_(conciliacion_ids_from_items))
            .all()
        )
        conciliaciones_map = {cid: getattr(estado, "value", estado) for cid, estado in conciliaciones}

    for viaje in viajes:
        recovered_conciliacion_id = item_conciliacion_by_viaje_id.get(viaje.id)
        effective_conciliacion_id = viaje.conciliacion_id or recovered_conciliacion_id
        if viaje.conciliacion_id is None and recovered_conciliacion_id is not None:
            viaje.conciliacion_id = recovered_conciliacion_id
            changed = True

        estado_actual = _estado_conciliacion_valor(viaje)
        if estado_actual is None and effective_conciliacion_id is not None:
            estado_actual = conciliaciones_map.get(effective_conciliacion_id)

        esperado = _expected_conciliado(viaje)
        if estado_actual is not None:
            esperado = estado_actual in {"APROBADA", "CERRADA"}

        if viaje.conciliado != esperado:
            viaje.conciliado = esperado
            changed = True
        if viaje.estado_conciliacion != estado_actual:
            viaje.estado_conciliacion = estado_actual
            changed = True

    if changed:
        db.commit()

    # Viajes originados desde una solicitud de viaje adicional (app móvil /
    # web) que ya tiene el PDF del manifiesto adjunto: se expone el id de la
    # solicitud para que el frontend pueda ofrecer "Ver PDF" reusando
    # GET /viajes-adicionales/{solicitud_id}/manifiesto.
    solicitud_id_by_viaje_id: dict[int, int] = {}
    if viaje_ids:
        solicitudes_con_manifiesto = (
            db.query(SolicitudViajeAdicional.viaje_id, SolicitudViajeAdicional.id)
            .join(
                ManifiestoViajeAdicional,
                ManifiestoViajeAdicional.solicitud_id == SolicitudViajeAdicional.id,
            )
            .filter(SolicitudViajeAdicional.viaje_id.in_(viaje_ids))
            .all()
        )
        solicitud_id_by_viaje_id = {vid: sid for vid, sid in solicitudes_con_manifiesto if vid is not None}

    adjuntos_por_viaje: dict[int, int] = {}
    if viaje_ids:
        adjuntos_por_viaje = dict(
            db.query(ServicioAdjunto.viaje_id, func.count(ServicioAdjunto.id))
            .filter(ServicioAdjunto.viaje_id.in_(viaje_ids))
            .group_by(ServicioAdjunto.viaje_id)
            .all()
        )

    payload: list[dict] = []
    for viaje in viajes:
        effective_estado = viaje.estado_conciliacion
        if user.rol == UserRole.CLIENTE and effective_estado not in {"EN_REVISION", "APROBADA", "CERRADA"}:
            continue

        out = ViajeOut.model_validate(viaje).model_dump()
        item_snapshot = item_snapshot_by_viaje_id.get(viaje.id)
        if item_snapshot:
            if item_snapshot.tarifa_tercero is not None:
                out["tarifa_tercero"] = float(item_snapshot.tarifa_tercero)
            if item_snapshot.tarifa_cliente is not None:
                out["tarifa_cliente"] = float(item_snapshot.tarifa_cliente)
            if item_snapshot.rentabilidad is not None:
                out["rentabilidad"] = float(item_snapshot.rentabilidad)

        if viaje.conciliacion_id is None and viaje.id in item_conciliacion_by_viaje_id:
            out["conciliacion_id"] = item_conciliacion_by_viaje_id[viaje.id]
        out["estado_conciliacion"] = effective_estado
        out["servicio_nombre"] = viaje.servicio.nombre if viaje.servicio else None
        out["servicio_codigo"] = viaje.servicio.codigo if viaje.servicio else None
        out["viaje_adicional_solicitud_id"] = solicitud_id_by_viaje_id.get(viaje.id)
        out["servicio_permite_adjuntos"] = bool(viaje.servicio and viaje.servicio.permite_adjuntos)
        out["adjuntos_count"] = adjuntos_por_viaje.get(viaje.id, 0)
        if es_standby(viaje.servicio):
            # El valor de la hora se deriva del total visible (que es el que se concilia).
            out["valor_hora_tercero"] = valor_por_hora(out.get("tarifa_tercero"), out.get("horas_cantidad"))
            out["valor_hora_cliente"] = valor_por_hora(out.get("tarifa_cliente"), out.get("horas_cantidad"))

        # Seguridad por API: cada rol solo recibe los valores financieros que le corresponden.
        if user.rol == UserRole.CLIENTE:
            out["tarifa_tercero"] = None
            out["rentabilidad"] = None
            out["valor_hora_tercero"] = None
        elif user.rol == UserRole.TERCERO:
            out["tarifa_cliente"] = None
            out["rentabilidad"] = None
            out["valor_hora_cliente"] = None

        payload.append(out)

    return payload


@router.patch("/{viaje_id}", response_model=ViajeOut)
def update_viaje(
    viaje_id: int,
    payload: ViajeUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("viajes.editar")),
):
    viaje = db.get(Viaje, viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    _ensure_viaje_mutable(viaje, db)

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No se enviaron cambios")

    if "fecha_hora_inicio" in data or "fecha_hora_fin" in data:
        try:
            aplicar_cambio_rango_standby(viaje, data)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if "tarifa_tercero" in data and data.get("tarifa_tercero") is not None:
        operacion = db.get(Operacion, viaje.operacion_id)
        tarifa_tercero = float(data["tarifa_tercero"])
        if "tarifa_cliente" not in data or data.get("tarifa_cliente") in (None, 0):
            tarifa_cliente, rentabilidad = calculate_tarifa_cliente(tarifa_tercero, operacion)
            data["tarifa_cliente"] = tarifa_cliente
            data["rentabilidad"] = rentabilidad

    for field, value in data.items():
        setattr(viaje, field, value)

    db.commit()
    db.refresh(viaje)
    return viaje


@router.delete("/{viaje_id}")
def deactivate_viaje(
    viaje_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("viajes.desactivar")),
):
    viaje = db.get(Viaje, viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    # COINTRA_ADMIN puede inactivar cualquier viaje sin restricción de estado
    viaje.activo = False
    db.commit()
    return {"ok": True}


@router.post("/{viaje_id}/reactivar")
def reactivate_viaje(
    viaje_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("viajes.desactivar")),
):
    viaje = db.get(Viaje, viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    _ensure_viaje_mutable(viaje, db)

    viaje.activo = True
    db.commit()
    return {"ok": True}


def _strip_accents(s: str) -> str:
    """Quita tildes y diacríticos para comparación robusta."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def _normalize_excel_header(h: str) -> str:
    """Normaliza un encabezado de columna Excel al nombre interno."""
    h = _strip_accents(h.lower().strip())
    if "tipo" in h and "servicio" in h:
        return "tipo_servicio"
    if "titul" in h:
        return "titulo"
    if "inicio" in h:
        return "fecha_hora_inicio"
    if re.search(r"(^|[^a-z])(fin|final)([^a-z]|$)", h):  # palabra completa, sin confundir con "manifiesto"
        return "fecha_hora_fin"
    if "fecha" in h:
        return "fecha_servicio"
    if "placa" in h:
        return "placa"
    if "origen" in h:
        return "origen"
    if "destino" in h:
        return "destino"
    if "conductor" in h:
        return "conductor"
    if "tarifa" in h and "tercero" in h:
        return "tarifa_tercero"
    if "descripci" in h:
        return "descripcion"
    if "manifiesto" in h:
        return "manifiesto_numero"
    return h


def _normalize_manifiesto_bulk(value: object) -> str:
    """Normaliza número de manifiesto (igual que en avansat_cache)."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.endswith(".0"):
        integer_part = raw[:-2]
        if integer_part.isdigit():
            return integer_part
    return raw


def _normalize_placa_bulk(value: object) -> str:
    """Normaliza placa a alfanumérico mayúscula para comparación."""
    raw = str(value or "").strip().upper()
    return "".join(ch for ch in raw if ch.isalnum())


def _validate_manifiesto_bulk(db: Session, manifiesto: str, placa: str) -> str | None:
    """
    Valida el manifiesto para carga masiva.
    Retorna None si todo está correcto, o un string con el error encontrado.
    """
    resolved, _ = resolve_avansat_from_cache_only(db, [manifiesto])
    avansat = resolved.get(manifiesto) or {}
    if not avansat:
        return f"Manifiesto '{manifiesto}' no existe en la cache de Avansat"

    placa_avansat = _normalize_placa_bulk(avansat.get("placa_vehiculo") or "")
    placa_viaje = _normalize_placa_bulk(placa)
    if placa_avansat and placa_viaje and placa_avansat != placa_viaje:
        return (
            f"La placa del manifiesto ({placa_avansat}) "
            f"no coincide con la placa del viaje ({placa_viaje})"
        )

    existing = (
        db.query(Viaje.id)
        .filter(Viaje.manifiesto_numero == manifiesto)
        .first()
    )
    if existing:
        return f"El manifiesto '{manifiesto}' ya está asociado a otro viaje (#{existing[0]})"

    return None


def _get_servicios_map(db: Session) -> dict[str, Servicio]:
    """Retorna mapa codigo/nombre -> Servicio para TODOS los servicios activos
    del catalogo — la carga masiva acepta cualquier tipo de servicio que el
    usuario haya creado en el modulo Servicios (Stand By, Descargue,
    Estibas, o cualquier otro), no solo Viaje/Viaje Adicional."""
    servicios = db.query(Servicio).filter(Servicio.activo.is_(True)).all()
    result: dict[str, Servicio] = {}
    for s in servicios:
        result[s.codigo.upper()] = s
        result[s.nombre.upper()] = s
        # alias amigable "VIAJE ADICIONAL" (sin guion bajo)
        result[s.codigo.upper().replace("_", " ")] = s
    return result


@router.get("/plantilla-excel")
def descargar_plantilla_viajes(db: Session = Depends(get_db)):
    """Descarga la plantilla Excel de carga masiva (ver services/carga_masiva_plantilla.py)."""
    return StreamingResponse(
        construir_plantilla(db),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plantilla_carga_servicios.xlsx"},
    )


@router.post("/carga-masiva/preview", response_model=list[CargaMasivaFilaPreview])
async def preview_carga_masiva_viajes(
    operacion_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Valida el archivo Excel sin guardar nada. Devuelve fila a fila el resultado."""
    # Un Tercero siempre puede cargar sus propios viajes (regla de negocio
    # fija); un Cointra necesita el permiso "viajes.crear".
    if user.rol != UserRole.TERCERO and not (
        user.rol == UserRole.COINTRA and tiene_permiso(db, user, "viajes.crear")
    ):
        raise HTTPException(status_code=403, detail="No tiene permisos para cargar viajes")

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    content = await file.read(CARGA_MASIVA_EXCEL_MAX_BYTES + 1)
    if len(content) > CARGA_MASIVA_EXCEL_MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera el tamaño máximo permitido (20 MB)")
    try:
        wb = load_workbook(filename=BytesIO(content), data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es un Excel válido (.xlsx)")

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Archivo Excel vacío")

    raw_headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    normalized = [_normalize_excel_header(h) for h in raw_headers]
    idx = {name: i for i, name in enumerate(normalized) if name}

    servicios_map = _get_servicios_map(db)
    seen_manifiestos: set[str] = set()  # control de duplicados en el mismo archivo

    def get_cell(row: tuple, key: str) -> str | None:
        if key not in idx:
            return None
        val = row[idx[key]]
        if val is None:
            return None
        return str(val).strip() or None

    result: list[CargaMasivaFilaPreview] = []

    for row_num, row in enumerate(rows[1:], start=2):
        # Extraer valores
        tipo_servicio_raw = get_cell(row, "tipo_servicio")
        titulo = get_cell(row, "titulo")
        fecha_raw = row[idx["fecha_servicio"]] if "fecha_servicio" in idx else None
        placa_raw = get_cell(row, "placa")
        origen = get_cell(row, "origen")
        destino = get_cell(row, "destino")
        conductor = get_cell(row, "conductor")
        tarifa_raw = row[idx["tarifa_tercero"]] if "tarifa_tercero" in idx else None
        inicio_raw = row[idx["fecha_hora_inicio"]] if "fecha_hora_inicio" in idx else None
        fin_raw = row[idx["fecha_hora_fin"]] if "fecha_hora_fin" in idx else None
        descripcion = get_cell(row, "descripcion")

        placa = placa_raw.upper() if placa_raw else None
        manifiesto_raw = get_cell(row, "manifiesto_numero")
        manifiesto: str | None = _normalize_manifiesto_bulk(manifiesto_raw) if manifiesto_raw else None
        fecha_str: str | None = None
        if fecha_raw is not None:
            try:
                if isinstance(fecha_raw, datetime):
                    fecha_str = str(fecha_raw.date())
                elif isinstance(fecha_raw, date):
                    fecha_str = str(fecha_raw)
                else:
                    fecha_str = str(date.fromisoformat(str(fecha_raw).strip()))
            except Exception:
                fecha_str = str(fecha_raw).strip() or None

        # Convertir tarifa
        tarifa_num: float | None = None
        if tarifa_raw is not None:
            try:
                tarifa_num = float(tarifa_raw)
            except Exception:
                pass

        # Validar
        error: str | None = None
        valido = True
        servicio: Servicio | None = None

        if not tipo_servicio_raw:
            error = "Tipo Servicio es obligatorio. Revisa la hoja 'Instrucciones' de la plantilla para ver los tipos disponibles."
            valido = False
        else:
            lookup = tipo_servicio_raw.strip().upper().replace(" ", "_")
            servicio = servicios_map.get(lookup) or servicios_map.get(tipo_servicio_raw.strip().upper())
            if not servicio:
                error = f"Tipo Servicio '{tipo_servicio_raw}' no reconocido. Revisa la hoja 'Instrucciones' de la plantilla para ver los tipos disponibles."
                valido = False

        if valido and not titulo:
            error = "Título es obligatorio"
            valido = False

        # En Stand By la fecha de servicio sale de la fecha de inicio.
        es_sb = es_standby(servicio)
        if valido and not fecha_str and not es_sb:
            error = "Fecha es obligatoria (formato YYYY-MM-DD)"
            valido = False
        elif valido and fecha_str and not es_sb:
            try:
                date.fromisoformat(fecha_str)
            except ValueError:
                error = f"Fecha '{fecha_str}' no tiene formato válido (use YYYY-MM-DD)"
                valido = False

        if valido and not placa:
            error = "Placa es obligatoria"
            valido = False

        tarifa_vacia = tarifa_raw is None or not str(tarifa_raw).strip()
        if valido and tarifa_num is None and not (es_sb and tarifa_vacia):
            error = "Tarifa Tercero es obligatoria y debe ser un número"
            valido = False
        elif valido and tarifa_num is not None and tarifa_num <= 0:
            error = "Tarifa Tercero debe ser mayor a 0"
            valido = False

        if valido and servicio:
            if servicio.requiere_origen_destino:
                if not origen:
                    error = "Origen es obligatorio para este tipo de servicio"
                    valido = False
                elif not destino:
                    error = "Destino es obligatorio para este tipo de servicio"
                    valido = False

        standby = None
        if valido and es_sb:
            try:
                standby = resolver_standby_carga_masiva(db, servicio, placa or "", inicio_raw, fin_raw, tarifa_num)
                fecha_str = str(standby.inicio.date())
                tarifa_num = standby.tarifa_tercero
            except ValueError as exc:
                error = str(exc)
                valido = False

        # Validar manifiesto si se proporcionó
        if valido and manifiesto:
            if manifiesto in seen_manifiestos:
                error = f"Manifiesto '{manifiesto}' aparece más de una vez en el archivo"
                valido = False
            else:
                seen_manifiestos.add(manifiesto)
                man_error = _validate_manifiesto_bulk(db, manifiesto, placa or "")
                if man_error:
                    error = man_error
                    valido = False

        result.append(
            CargaMasivaFilaPreview(
                fila=row_num,
                tipo_servicio=tipo_servicio_raw,
                titulo=titulo,
                fecha_servicio=fecha_str,
                placa=placa,
                origen=origen,
                destino=destino,
                conductor=conductor,
                tarifa_tercero=tarifa_num,
                descripcion=descripcion,
                manifiesto_numero=manifiesto,
                fecha_hora_inicio=standby.inicio.isoformat(sep=" ", timespec="minutes") if standby else None,
                fecha_hora_fin=standby.fin.isoformat(sep=" ", timespec="minutes") if standby else None,
                horas_cantidad=standby.horas if standby else None,
                valido=valido,
                error=error,
            )
        )

    return result


@router.post("/carga-masiva", response_model=CargaMasivaResultado)
async def bulk_upload_viajes(
    operacion_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Un Tercero siempre puede cargar sus propios viajes (regla de negocio
    # fija); un Cointra necesita el permiso "viajes.crear".
    if user.rol != UserRole.TERCERO and not (
        user.rol == UserRole.COINTRA and tiene_permiso(db, user, "viajes.crear")
    ):
        raise HTTPException(status_code=403, detail="No tiene permisos para cargar viajes")

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    content = await file.read(CARGA_MASIVA_EXCEL_MAX_BYTES + 1)
    if len(content) > CARGA_MASIVA_EXCEL_MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera el tamaño máximo permitido (20 MB)")
    try:
        wb = load_workbook(filename=BytesIO(content), data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es un Excel válido (.xlsx)")

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Archivo Excel vacío")

    raw_headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    normalized = [_normalize_excel_header(h) for h in raw_headers]
    idx = {name: i for i, name in enumerate(normalized) if name}

    servicios_map = _get_servicios_map(db)
    seen_manifiestos_upload: set[str] = set()  # control de duplicados en el mismo archivo

    def get_cell(row: tuple, key: str) -> str | None:
        if key not in idx:
            return None
        val = row[idx[key]]
        if val is None:
            return None
        return str(val).strip() or None

    errores: list[str] = []
    cargados = 0

    for row_num, row in enumerate(rows[1:], start=2):
        try:
            tipo_servicio_raw = get_cell(row, "tipo_servicio")
            titulo = get_cell(row, "titulo")
            fecha_raw = row[idx["fecha_servicio"]] if "fecha_servicio" in idx else None
            placa_raw = get_cell(row, "placa")
            origen = get_cell(row, "origen") or ""
            destino = get_cell(row, "destino") or ""
            conductor = get_cell(row, "conductor")
            tarifa_raw = row[idx["tarifa_tercero"]] if "tarifa_tercero" in idx else None
            inicio_raw = row[idx["fecha_hora_inicio"]] if "fecha_hora_inicio" in idx else None
            fin_raw = row[idx["fecha_hora_fin"]] if "fecha_hora_fin" in idx else None
            descripcion = get_cell(row, "descripcion")

            placa = placa_raw.upper() if placa_raw else ""
            manifiesto_raw = get_cell(row, "manifiesto_numero")
            manifiesto: str | None = _normalize_manifiesto_bulk(manifiesto_raw) if manifiesto_raw else None

            if not titulo:
                raise ValueError("Título es obligatorio")

            # Resolver servicio — igual de estricto que la validacion previa
            # (preview_carga_masiva_viajes), para no cargar filas con un tipo
            # de servicio mal escrito como si fueran un viaje generico.
            if not tipo_servicio_raw:
                raise ValueError("Tipo Servicio es obligatorio. Revisa la hoja 'Instrucciones' de la plantilla.")
            lookup = tipo_servicio_raw.strip().upper().replace(" ", "_")
            servicio = servicios_map.get(lookup) or servicios_map.get(tipo_servicio_raw.strip().upper())
            if not servicio:
                raise ValueError(
                    f"Tipo Servicio '{tipo_servicio_raw}' no reconocido. Revisa la hoja 'Instrucciones' de la plantilla."
                )

            if not placa:
                raise ValueError("Placa es obligatoria")

            es_sb = es_standby(servicio)
            tarifa_vacia = tarifa_raw is None or not str(tarifa_raw).strip()
            tarifa_num: float | None = None
            if not (es_sb and tarifa_vacia):
                if tarifa_vacia:
                    raise ValueError("Tarifa Tercero es obligatoria")
                tarifa_num = float(tarifa_raw)
                if tarifa_num <= 0:
                    raise ValueError("Tarifa Tercero debe ser mayor a 0")

            standby = None
            if es_sb:
                # La fecha de servicio de un Stand By es la de su inicio; el
                # total sale de las fechas y la tarifa por hora (o del valor
                # total que traiga el Excel).
                standby = resolver_standby_carga_masiva(db, servicio, placa, inicio_raw, fin_raw, tarifa_num)
                fecha_servicio = standby.inicio.date()
                tarifa_num = standby.tarifa_tercero
            else:
                if fecha_raw is None:
                    raise ValueError("Fecha es obligatoria")
                if isinstance(fecha_raw, datetime):
                    fecha_servicio = fecha_raw.date()
                elif isinstance(fecha_raw, date):
                    fecha_servicio = fecha_raw
                else:
                    fecha_servicio = date.fromisoformat(str(fecha_raw).strip())

            if servicio.requiere_origen_destino:
                if not origen:
                    raise ValueError("Origen es obligatorio para este tipo de servicio")
                if not destino:
                    raise ValueError("Destino es obligatorio para este tipo de servicio")

            if not origen:
                origen = "N/A"
            if not destino:
                destino = "N/A"

            # Validar manifiesto si se proporcionó
            if manifiesto:
                if manifiesto in seen_manifiestos_upload:
                    raise ValueError(f"Manifiesto '{manifiesto}' aparece más de una vez en el archivo")
                man_error = _validate_manifiesto_bulk(db, manifiesto, placa)
                if man_error:
                    raise ValueError(man_error)
                seen_manifiestos_upload.add(manifiesto)

            tarifa_cliente, rentabilidad = calculate_tarifa_cliente(tarifa_num, operacion)

            viaje = Viaje(
                operacion_id=operacion_id,
                tercero_id=operacion.tercero_id,
                servicio_id=servicio.id if servicio else None,
                titulo=titulo,
                fecha_servicio=fecha_servicio,
                origen=origen,
                destino=destino,
                placa=placa,
                hora_inicio=standby.inicio.time() if standby else None,
                hora_fin=standby.fin.time() if standby else None,
                fecha_hora_inicio=standby.inicio if standby else None,
                fecha_hora_fin=standby.fin if standby else None,
                horas_cantidad=standby.horas if standby else None,
                conductor=conductor or None,
                tarifa_tercero=round(tarifa_num, 2),
                tarifa_cliente=round(float(tarifa_cliente), 2),
                rentabilidad=rentabilidad,
                descripcion=descripcion,
                manifiesto_numero=manifiesto,
                created_by=user.id,
                cargado_por=user.rol.value,
                activo=True,
            )
            db.add(viaje)
            cargados += 1
        except Exception as exc:
            errores.append(f"Fila {row_num}: {exc}")

    db.commit()
    return CargaMasivaResultado(total_filas=max(0, len(rows) - 1), cargados=cargados, errores=errores)
