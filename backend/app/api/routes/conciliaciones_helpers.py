from datetime import date
import json
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.api.deps import is_cointra_admin
from app.core.config import settings
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.models.viaje import Viaje
from app.schemas.conciliacion import ConciliacionOut
from app.services.audit import log_change
from app.services.avansat_cache import resolve_avansat_from_cache_only
from app.services.pricing import DEFAULT_RENTABILIDAD_PCT, calculate_tarifa_cliente_default

TRANSPORTE_SERVICE_CODES = {"VIAJE", "VIAJE_ADICIONAL"}


def _login_url() -> str:
    return f"{settings.frontend_url.rstrip('/')}/login"


def _estado_conciliacion_viaje(viaje: Viaje):
    if not viaje.conciliacion:
        return None
    return getattr(viaje.conciliacion.estado, "value", viaje.conciliacion.estado)


def _should_mark_conciliado(estado: object) -> bool:
    estado_valor = getattr(estado, "value", estado)
    return str(estado_valor) in {"APROBADA", "CERRADA"}


def _default_viaje_item_financials(viaje: Viaje) -> tuple[float | None, float | None, float]:
    """La tarifa que manda es tarifa_tercero: la tarifa_cliente del ítem
    SIEMPRE se recalcula desde ahí con el % de rentabilidad por defecto
    (DEFAULT_RENTABILIDAD_PCT), sin importar con qué % se haya calculado la
    tarifa_cliente del viaje original (p.ej. el % propio de la operación).
    Ajustar el % ya es una decisión que se toma después, dentro de la
    conciliación (PATCH .../items/{id})."""
    tarifa_tercero = float(viaje.tarifa_tercero) if viaje.tarifa_tercero is not None else None

    if tarifa_tercero is not None:
        tarifa_cliente, pct = calculate_tarifa_cliente_default(tarifa_tercero)
        return tarifa_tercero, tarifa_cliente, pct

    tarifa_cliente = float(viaje.tarifa_cliente) if viaje.tarifa_cliente is not None else None
    if tarifa_cliente is not None:
        tarifa_tercero = tarifa_cliente * (1 - DEFAULT_RENTABILIDAD_PCT / 100)

    return tarifa_tercero, tarifa_cliente, DEFAULT_RENTABILIDAD_PCT


def _sync_viajes_conciliado_por_estado(db: Session, conciliacion_id: int, estado: object) -> None:
    estado_valor = getattr(estado, "value", estado)
    conciliado = _should_mark_conciliado(estado_valor)
    viajes = db.query(Viaje).filter(Viaje.conciliacion_id == conciliacion_id).all()
    for viaje in viajes:
        viaje.conciliado = conciliado
        viaje.estado_conciliacion = str(estado_valor)


def _repair_missing_viaje_items(db: Session, conc: Conciliacion, user_id: int) -> bool:
    """Repara inconsistencias historicas: viaje vinculado a conciliacion sin item VIAJE."""
    changed = False
    linked_viajes = db.query(Viaje).filter(Viaje.conciliacion_id == conc.id).all()
    existing_viaje_ids = {
        row[0]
        for row in db.query(ConciliacionItem.viaje_id)
        .filter(
            ConciliacionItem.conciliacion_id == conc.id,
            ConciliacionItem.tipo == ItemTipo.VIAJE,
            ConciliacionItem.viaje_id.is_not(None),
        )
        .all()
    }

    for viaje in linked_viajes:
        if viaje.id in existing_viaje_ids:
            continue

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
            created_by=user_id,
            cargado_por=viaje.cargado_por,
        )
        db.add(item)
        log_change(
            db,
            usuario_id=user_id,
            conciliacion_id=conc.id,
            campo="reparacion_item_viaje",
            valor_nuevo=f"viaje_id={viaje.id}",
        )
        changed = True

    return changed


def _existing_item_viaje_ids(db: Session) -> set[int]:
    return {
        row[0]
        for row in db.query(ConciliacionItem.viaje_id)
        .filter(
            ConciliacionItem.tipo == ItemTipo.VIAJE,
            ConciliacionItem.viaje_id.is_not(None),
        )
        .all()
    }


def _validate_user_access_operacion(user: Usuario, operacion: Operacion) -> None:
    if user.rol == UserRole.CLIENTE:
        is_assigned = any(op.id == operacion.id for op in user.operaciones_asignadas)
        if not is_assigned:
            raise HTTPException(status_code=403, detail="Operacion no disponible para este cliente")
    if user.rol == UserRole.TERCERO and user.tercero_id != operacion.tercero_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este tercero")


def _ensure_user_can_access_conciliacion(user: Usuario, conc: Conciliacion) -> None:
    if not conc.activo and not is_cointra_admin(user):
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    estado = getattr(conc.estado, "value", conc.estado)
    if user.rol == UserRole.CLIENTE and str(estado) == "BORRADOR":
        raise HTTPException(status_code=403, detail="La conciliacion aun no ha sido enviada a revision")


def _ensure_cointra_admin(user: Usuario) -> None:
    if not is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede editar o inactivar conciliaciones")


def _parse_target_emails(raw_value: str | None, recipients: list[Usuario]) -> list[str]:
    provided: list[str] = []
    if raw_value:
        normalized = raw_value.replace(";", ",")
        provided = [email.strip() for email in normalized.split(",") if email and email.strip()]

    target_emails = provided or [u.email for u in recipients if u.email]
    return list(dict.fromkeys(target_emails))


def _users_matching_emails(recipients: list[Usuario], target_emails: list[str]) -> list[Usuario]:
    email_set = {email.strip().lower() for email in target_emails if email and email.strip()}
    if not email_set:
        return []
    matched: list[Usuario] = []
    seen_ids: set[int] = set()
    for user in recipients:
        if not user.email:
            continue
        if user.id in seen_ids:
            continue
        if user.email.strip().lower() in email_set:
            matched.append(user)
            seen_ids.add(user.id)
    return matched


def _sender_signature(user: Usuario) -> str:
    if user.email:
        return f"{user.nombre} <{user.email}>"
    return user.nombre


def _find_last_review_sender(db: Session, conciliacion_id: int) -> Usuario | None:
    last_sender_log = (
        db.query(HistorialCambio)
        .filter(
            HistorialCambio.conciliacion_id == conciliacion_id,
            HistorialCambio.campo == "enviar_revision",
        )
        .order_by(HistorialCambio.id.desc())
        .first()
    )
    if not last_sender_log:
        return None
    sender = db.get(Usuario, last_sender_log.usuario_id)
    if not sender or not sender.activo:
        return None
    return sender


def _resolve_recipients(db: Session, operacion: Operacion, roles: list[UserRole]) -> list[Usuario]:
    recipients: list[Usuario] = []
    for role in roles:
        query = db.query(Usuario).filter(Usuario.activo.is_(True), Usuario.rol == role)
        if role == UserRole.CLIENTE:
            query = query.join(
                usuario_operaciones_asignadas,
                usuario_operaciones_asignadas.c.usuario_id == Usuario.id,
            ).filter(
                Usuario.cliente_id == operacion.cliente_id,
                usuario_operaciones_asignadas.c.operacion_id == operacion.id,
            )
            recipients.extend(query.order_by(Usuario.id.asc()).all())
            continue
        elif role == UserRole.TERCERO:
            query = query.filter(Usuario.tercero_id == operacion.tercero_id)
        user = query.order_by(Usuario.id.asc()).first()
        if user:
            recipients.append(user)
    # Dedup por usuario
    uniq: dict[int, Usuario] = {u.id: u for u in recipients}
    return list(uniq.values())


def _display_estado(conc: Conciliacion) -> str:
    estado = str(getattr(conc.estado, "value", conc.estado))
    if estado == "CERRADA" and conc.factura_cliente_enviada:
        return "FACTURADO"
    if estado == "APROBADA" and conc.enviada_facturacion:
        return "ENVIADA_A_FACTURAR"
    return estado


def _mark_borrador_dirty(conc: Conciliacion) -> None:
    estado = str(getattr(conc.estado, "value", conc.estado))
    if estado == "BORRADOR":
        conc.borrador_guardado = False


def _next_liquidacion_id(db: Session, conciliacion_id: int) -> int:
    items = (
        db.query(ConciliacionItem)
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .all()
    )
    max_id = 0
    for item in items:
        meta = _extract_liquidacion_metadata(item)
        if not meta:
            continue
        liq_id = meta.get("liquidacion_contrato_fijo_id")
        if isinstance(liq_id, int) and liq_id > max_id:
            max_id = liq_id
    return max_id + 1


def _liquidacion_exists(db: Session, conciliacion_id: int, liquidacion_id: int) -> bool:
    if liquidacion_id <= 0:
        return False
    items = (
        db.query(ConciliacionItem)
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .all()
    )
    for item in items:
        meta = _extract_liquidacion_metadata(item)
        if not meta:
            continue
        if meta.get("liquidacion_contrato_fijo_id") == liquidacion_id:
            return True
    return False


def _find_last_status_actor(db: Session, conc: Conciliacion) -> tuple[str | None, str | None]:
    estado = _display_estado(conc)
    logs = (
        db.query(HistorialCambio)
        .filter(HistorialCambio.conciliacion_id == conc.id)
        .order_by(HistorialCambio.id.desc())
        .limit(150)
        .all()
    )

    def matches(log: HistorialCambio) -> bool:
        campo = (log.campo or "").strip()
        nuevo = str(log.valor_nuevo or "").strip().upper()

        if estado == "BORRADOR":
            return campo in {"devolucion_cliente", "conciliacion_creada"} or (
                campo == "estado_conciliacion" and nuevo == "BORRADOR"
            )
        if estado == "EN_REVISION":
            return campo == "enviar_revision" or (
                campo == "estado_conciliacion" and nuevo == "EN_REVISION"
            )
        if estado == "APROBADA":
            return campo == "aprobacion_cliente" or (
                campo == "estado_conciliacion" and nuevo == "APROBADA"
            )
        if estado == "ENVIADA_A_FACTURAR":
            return campo == "envio_facturacion"
        if estado == "CERRADA":
            return campo == "cierre_conciliacion" or (
                campo == "estado_conciliacion" and nuevo == "CERRADA"
            )
        if estado == "FACTURADO":
            return campo == "envio_factura_cliente" or (
                campo == "estado_conciliacion" and nuevo == "CERRADA"
            )
        return campo == "estado_conciliacion" and nuevo == estado

    for log in logs:
        if not matches(log):
            continue
        actor = db.get(Usuario, log.usuario_id)
        if actor:
            return actor.nombre, actor.email

    creator_name = conc.creador.nombre if conc.creador else None
    creator_email = conc.creador.email if conc.creador else None
    return creator_name, creator_email


def _build_conciliacion_totals_map(db: Session, conciliacion_ids: list[int]) -> dict[int, tuple[float, float]]:
    if not conciliacion_ids:
        return {}
    items = (
        db.query(ConciliacionItem)
        .filter(ConciliacionItem.conciliacion_id.in_(conciliacion_ids))
        .all()
    )

    totals_map: dict[int, tuple[float, float]] = {}
    for item in items:
        cid = int(item.conciliacion_id)
        # Bloque 1 (liquidación contrato fijo) es solo referencia, no se suma
        if _extract_liquidacion_metadata(item):
            continue
        current_cliente, current_tercero = totals_map.get(cid, (0.0, 0.0))
        totals_map[cid] = (
            current_cliente + float(item.tarifa_cliente or 0),
            current_tercero + float(item.tarifa_tercero or 0),
        )
    return totals_map


def _build_conciliacion_estado_timestamps(db: Session, conciliacion_id: int, created_at: object) -> dict[str, object | None]:
    logs = (
        db.query(HistorialCambio)
        .filter(HistorialCambio.conciliacion_id == conciliacion_id)
        .order_by(HistorialCambio.id.asc())
        .all()
    )
    timestamps: dict[str, object | None] = {
        "fecha_creacion": created_at,
        "fecha_envio_revision": None,
        "fecha_aprobacion": None,
        "fecha_rechazo": None,
        "fecha_envio_facturacion": None,
        "fecha_facturado": None,
    }
    for log in logs:
        campo = (log.campo or "").strip()
        if campo == "enviar_revision" and timestamps["fecha_envio_revision"] is None:
            timestamps["fecha_envio_revision"] = log.fecha
        elif campo == "aprobacion_cliente" and timestamps["fecha_aprobacion"] is None:
            timestamps["fecha_aprobacion"] = log.fecha
        elif campo == "devolucion_cliente" and timestamps["fecha_rechazo"] is None:
            timestamps["fecha_rechazo"] = log.fecha
        elif campo == "envio_facturacion" and timestamps["fecha_envio_facturacion"] is None:
            timestamps["fecha_envio_facturacion"] = log.fecha
        elif campo == "envio_factura_cliente" and timestamps["fecha_facturado"] is None:
            timestamps["fecha_facturado"] = log.fecha
    return timestamps


def _enrich_conciliacion(
    db: Session,
    conc: Conciliacion,
    user: Usuario,
    totals_map: dict[int, tuple[float, float]] | None = None,
) -> dict:
    """Convierte una Conciliacion ORM en dict con campos de creador, cliente y tercero."""
    base = ConciliacionOut.model_validate(conc).model_dump()
    base["creador_nombre"] = conc.creador.nombre if conc.creador else None
    operacion = conc.operacion
    base["cliente_nombre"] = operacion.cliente.nombre if operacion and operacion.cliente else None
    base["tercero_nombre"] = operacion.tercero.nombre if operacion and operacion.tercero else None
    estado_actor_nombre, estado_actor_email = _find_last_status_actor(db, conc)
    base["estado_actualizado_por_nombre"] = estado_actor_nombre
    base["estado_actualizado_por_email"] = estado_actor_email
    totals = (totals_map or {}).get(conc.id, (0.0, 0.0))
    valor_cliente, valor_tercero = totals
    if user.rol == UserRole.CLIENTE:
        base["valor_cliente"] = valor_cliente
        base["valor_tercero"] = None
    elif user.rol == UserRole.TERCERO:
        base["valor_cliente"] = None
        base["valor_tercero"] = valor_tercero
    else:
        base["valor_cliente"] = valor_cliente
        base["valor_tercero"] = valor_tercero
    timestamps = _build_conciliacion_estado_timestamps(db, conc.id, conc.created_at)
    base["fecha_creacion"] = timestamps["fecha_creacion"]
    base["fecha_envio_revision"] = timestamps["fecha_envio_revision"]
    base["fecha_aprobacion"] = timestamps["fecha_aprobacion"]
    base["fecha_rechazo"] = timestamps["fecha_rechazo"]
    base["fecha_envio_facturacion"] = timestamps["fecha_envio_facturacion"]
    base["fecha_facturado"] = timestamps["fecha_facturado"]
    # Agregar items_count para el frontend
    base["items_count"] = (
        db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conc.id).count()
    )
    return base


def _as_float(value: object) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except Exception:
        return 0.0


def _split_total_evenly(total: float, count: int) -> list[float]:
    if count <= 0:
        return []
    total_dec = Decimal(str(total))
    if count == 1:
        return [float(total_dec)]

    base = (total_dec / Decimal(count)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    distributed: list[Decimal] = [base for _ in range(count - 1)]
    assigned = sum(distributed, Decimal("0.00"))
    distributed.append(total_dec - assigned)
    return [float(value) for value in distributed]


def _build_liquidacion_metadata(
    liquidacion_id: int,
    periodo_inicio: date,
    periodo_fin: date,
) -> str:
    payload = {
        "kind": "LIQUIDACION_CONTRATO_FIJO",
        "liquidacion_id": liquidacion_id,
        "periodo_inicio": str(periodo_inicio),
        "periodo_fin": str(periodo_fin),
    }
    return json.dumps(payload, ensure_ascii=True)


def _extract_liquidacion_metadata(item: ConciliacionItem) -> dict | None:
    if item.tipo != ItemTipo.OTRO:
        return None
    raw = (item.descripcion or "").strip()
    if not raw:
        return None

    try:
        payload = json.loads(raw)
    except Exception:
        return None

    if payload.get("kind") != "LIQUIDACION_CONTRATO_FIJO":
        return None

    try:
        periodo_inicio = date.fromisoformat(str(payload.get("periodo_inicio") or ""))
        periodo_fin = date.fromisoformat(str(payload.get("periodo_fin") or ""))
    except Exception:
        return None

    return {
        "liquidacion_contrato_fijo": True,
        "liquidacion_contrato_fijo_id": payload.get("liquidacion_id"),
        "liquidacion_periodo_inicio": periodo_inicio,
        "liquidacion_periodo_fin": periodo_fin,
    }


def _normalize_manifiesto_for_lookup(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    # Corrige casos donde el manifiesto llega como numero decimal de Excel, p.e. "522318.0"
    if raw.endswith(".0"):
        integer_part = raw[:-2]
        if integer_part.isdigit():
            return integer_part
    return raw


def _normalize_placa_for_compare(value: object) -> str:
    raw = str(value or "").strip().upper()
    return "".join(ch for ch in raw if ch.isalnum())


def _item_servicio_codigo(item: ConciliacionItem) -> str:
    viaje = getattr(item, "viaje", None)
    servicio = getattr(viaje, "servicio", None)
    raw_codigo = getattr(servicio, "codigo", "")
    return str(raw_codigo or "").strip().upper()


def _is_transport_item(item: ConciliacionItem) -> bool:
    codigo = _item_servicio_codigo(item)
    return codigo in TRANSPORTE_SERVICE_CODES


def _validate_transport_item_manifest_or_raise(db: Session, item: ConciliacionItem) -> None:
    if not _is_transport_item(item):
        return

    manifiesto = _normalize_manifiesto_for_lookup(item.manifiesto_numero)
    if not manifiesto:
        servicio_codigo = _item_servicio_codigo(item) or "VIAJE"
        raise HTTPException(
            status_code=400,
            detail=(
                f"El servicio {servicio_codigo} requiere manifiesto. "
                "Asocia un manifiesto antes de continuar."
            ),
        )

    avansat = _fetch_avansat_with_fallback(db, manifiesto)
    if not avansat:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El manifiesto {manifiesto} no existe en la cache de Avansat. "
                "Sincroniza Avansat o corrige el numero del manifiesto."
            ),
        )

    placa_servicio = _normalize_placa_for_compare(item.placa)
    if not placa_servicio:
        raise HTTPException(
            status_code=400,
            detail="El servicio de transporte no tiene placa registrada para validar el manifiesto.",
        )

    placa_avansat = _normalize_placa_for_compare(avansat.get("placa_vehiculo") or "")
    if not placa_avansat:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El manifiesto {manifiesto} no tiene placa valida en Avansat. "
                "Corrige el manifiesto o sincroniza la fuente."
            ),
        )

    if placa_avansat != placa_servicio:
        raise HTTPException(
            status_code=400,
            detail=(
                f"La placa del manifiesto {manifiesto} ({placa_avansat}) no coincide con la placa del servicio ({placa_servicio})."
            ),
        )

    # Un manifiesto solo puede estar asociado a un único ítem/viaje.
    existing = (
        db.query(ConciliacionItem.id)
        .filter(
            ConciliacionItem.manifiesto_numero == manifiesto,
            ConciliacionItem.id != item.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El manifiesto {manifiesto} ya esta asociado a otro viaje "
                f"(item #{existing.id}). Un manifiesto solo puede asociarse a un viaje."
            ),
        )


def _validate_transport_items_manifests_or_raise(
    db: Session,
    items: list[ConciliacionItem],
    action_label: str,
) -> None:
    errors: list[str] = []
    for item in items:
        if not _is_transport_item(item):
            continue
        try:
            _validate_transport_item_manifest_or_raise(db, item)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Error de validacion"
            item_ref = f"viaje #{item.viaje_id}" if item.viaje_id else f"item #{item.id}"
            errors.append(f"{item_ref}: {detail}")

    if errors:
        preview = "\n".join(errors[:10])
        suffix = "" if len(errors) <= 10 else f"\n... y {len(errors) - 10} errores mas"
        raise HTTPException(
            status_code=400,
            detail=(
                f"No se puede {action_label}. Los servicios de transporte (VIAJE/VIAJE_ADICIONAL) deben tener manifiesto valido y placa coincidente.\n"
                f"{preview}{suffix}"
            ),
        )


def _fetch_avansat_with_fallback(
    db: Session,
    manifiesto: str,
    prefetched: dict[str, dict] | None = None,
) -> dict:
    if not manifiesto:
        return {}
    attempts = [manifiesto, manifiesto.lstrip("0")]
    seen: set[str] = set()
    for candidate in attempts:
        candidate = (candidate or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        if prefetched:
            prefetched_data = prefetched.get(candidate) or {}
            if prefetched_data:
                return prefetched_data
        resolved, _ = resolve_avansat_from_cache_only(db, [candidate])
        data = resolved.get(candidate) or {}
        if data:
            return data
    return {}


def _prefetch_avansat_for_manifest_numbers_or_raise(
    db: Session,
    manifest_numbers: list[str],
) -> dict[str, dict]:
    unique_manifiestos = list(
        dict.fromkeys(
            [
                _normalize_manifiesto_for_lookup(number)
                for number in manifest_numbers
                if _normalize_manifiesto_for_lookup(number)
            ]
        )
    )
    if not unique_manifiestos:
        return {}

    prefetched, missing = resolve_avansat_from_cache_only(db, unique_manifiestos)
    if missing:
        total = len(unique_manifiestos)
        missing_count = len(missing)
        resolved_count = total - missing_count
        missing_list = ", ".join(missing[:10])
        suffix = "" if len(missing) <= 10 else f" y {len(missing) - 10} mas"
        raise HTTPException(
            status_code=502,
            detail=(
                "La cache interna de Avansat aun no tiene todos los manifiestos requeridos para generar el Excel. "
                f"Disponibles: {resolved_count}/{total}. "
                f"Faltantes ({missing_count}): {missing_list}{suffix}. "
                "Espera la siguiente sincronizacion automatica (cada 30 minutos) o ejecuta una sincronizacion manual desde Consulta Avansat."
            ),
        )

    return prefetched
