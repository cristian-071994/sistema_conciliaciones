from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.upload_limits import MANIFIESTO_VIAJE_ADICIONAL_MAX_BYTES
from app.db.session import get_db
from app.models.catalogo_tarifa import CatalogoTarifa
from app.models.enums import ItemEstado, UserRole
from app.models.manifiesto_viaje_adicional import ManifiestoViajeAdicional
from app.models.operacion import Operacion
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.models.viaje_adicional import SolicitudViajeAdicional
from app.schemas.viaje_adicional import (
    EstadoGestionViajeAdicional,
    ManifiestoNumeroUpdate,
    SolicitudViajeAdicionalCreate,
    SolicitudViajeAdicionalEstadoUpdate,
    SolicitudViajeAdicionalOut,
    SolicitudViajeAdicionalTarifaUpdate,
    VehiculoDisponibleOut,
)
from app.services.pricing import calculate_tarifa_cliente_default
from app.services.viaje_adicional_conversion import VIAJE_ADICIONAL_SERVICIO_CODIGO, convertir_en_viaje
from app.services.visibility import sanitize_item_for_role
from .conciliaciones_helpers import _validate_user_access_operacion
from .viajes import _ensure_viaje_mutable

router = APIRouter(prefix="/viajes-adicionales", tags=["viajes-adicionales"])


def _buscar_tarifa_ruta(db: Session, tipo_vehiculo_id: int, origen: str, destino: str) -> CatalogoTarifa | None:
    """Busca en el catálogo de tarifas (servicio VIAJE_ADICIONAL) una tarifa
    activa para esta ruta + tipo de vehículo. Comparación insensible a
    mayúsculas/espacios — ver la misma normalización en api/routes/tarifas.py."""
    servicio = db.query(Servicio).filter(Servicio.codigo == VIAJE_ADICIONAL_SERVICIO_CODIGO).first()
    if not servicio:
        return None
    return (
        db.query(CatalogoTarifa)
        .filter(
            CatalogoTarifa.servicio_id == servicio.id,
            CatalogoTarifa.tipo_vehiculo_id == tipo_vehiculo_id,
            CatalogoTarifa.activo.is_(True),
            func.upper(func.trim(CatalogoTarifa.origen)) == origen.strip().upper(),
            func.upper(func.trim(CatalogoTarifa.destino)) == destino.strip().upper(),
        )
        .first()
    )


def _compute_estado_gestion(solicitud: SolicitudViajeAdicional) -> EstadoGestionViajeAdicional:
    """Estado real dentro del proceso de conciliación — ver
    EstadoGestionViajeAdicional. Fuente de verdad: Viaje.conciliacion_id y
    Conciliacion.estado, NUNCA el campo manual `estado` de la solicitud."""
    if solicitud.viaje_id is None:
        if solicitud.tarifa_tercero is None:
            return EstadoGestionViajeAdicional.PENDIENTE_TARIFA
        return EstadoGestionViajeAdicional.PENDIENTE_MANIFIESTO

    viaje = solicitud.viaje
    if viaje is None or viaje.conciliacion_id is None:
        return EstadoGestionViajeAdicional.SIN_CONCILIAR

    conciliacion = viaje.conciliacion
    estado = getattr(conciliacion.estado, "value", conciliacion.estado) if conciliacion else None
    return {
        "BORRADOR": EstadoGestionViajeAdicional.EN_BORRADOR,
        "EN_REVISION": EstadoGestionViajeAdicional.EN_REVISION,
        "APROBADA": EstadoGestionViajeAdicional.APROBADA,
        "CERRADA": EstadoGestionViajeAdicional.CONCILIADO,
    }.get(str(estado), EstadoGestionViajeAdicional.SIN_CONCILIAR)


def _ensure_manifiesto_editable(solicitud: SolicitudViajeAdicional, db: Session) -> Viaje | None:
    """Solo se permite editar/eliminar el manifiesto desde este módulo mientras
    el viaje resultante no haya sido incluido en una conciliación — de ahí en
    adelante la corrección se hace desde el módulo de conciliaciones (mismo
    resguardo que _ensure_viaje_mutable en viajes.py)."""
    if not solicitud.viaje_id:
        return None
    viaje = db.get(Viaje, solicitud.viaje_id)
    if viaje and viaje.conciliacion_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Este viaje ya fue incluido en una conciliación. Corrige el manifiesto desde el módulo de conciliaciones.",
        )
    return viaje


def _serialize(solicitud: SolicitudViajeAdicional, role: UserRole) -> SolicitudViajeAdicionalOut:
    payload = {
        "id": solicitud.id,
        "operacion_id": solicitud.operacion_id,
        "operacion_nombre": solicitud.operacion.nombre,
        "cliente_id": solicitud.cliente_id,
        "cliente_nombre": solicitud.cliente.nombre,
        "vehiculo_id": solicitud.vehiculo_id,
        "vehiculo_placa": solicitud.vehiculo.placa,
        "vehiculo_tipo_nombre": solicitud.vehiculo.tipo.nombre if solicitud.vehiculo.tipo else "",
        "titulo": solicitud.titulo,
        "fecha_viaje": solicitud.fecha_viaje,
        "origen": solicitud.origen,
        "destino": solicitud.destino,
        "producto": solicitud.producto,
        "observaciones": solicitud.observaciones,
        "tarifa_tercero": float(solicitud.tarifa_tercero) if solicitud.tarifa_tercero is not None else None,
        "tarifa_cliente": float(solicitud.tarifa_cliente) if solicitud.tarifa_cliente is not None else None,
        "rentabilidad": float(solicitud.rentabilidad) if solicitud.rentabilidad is not None else None,
        "estado": solicitud.estado,
        "estado_gestion": _compute_estado_gestion(solicitud),
        "created_by": solicitud.created_by,
        "creador_nombre": solicitud.creador.nombre if solicitud.creador else "",
        "created_at": solicitud.created_at,
        "activo": solicitud.activo,
        "manifiesto": solicitud.manifiesto,
        "viaje_id": solicitud.viaje_id,
    }
    return SolicitudViajeAdicionalOut(**sanitize_item_for_role(payload, role))


def _query_with_relations(db: Session):
    return db.query(SolicitudViajeAdicional).options(
        selectinload(SolicitudViajeAdicional.operacion),
        selectinload(SolicitudViajeAdicional.cliente),
        selectinload(SolicitudViajeAdicional.vehiculo).selectinload(Vehiculo.tipo),
        selectinload(SolicitudViajeAdicional.creador),
        selectinload(SolicitudViajeAdicional.manifiesto),
        selectinload(SolicitudViajeAdicional.viaje).selectinload(Viaje.conciliacion),
    )


def _get_solicitud_or_404(db: Session, solicitud_id: int) -> SolicitudViajeAdicional:
    solicitud = _query_with_relations(db).filter(SolicitudViajeAdicional.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud de viaje adicional no encontrada")
    return solicitud


def _ensure_access(user: Usuario, solicitud: SolicitudViajeAdicional) -> None:
    if user.rol == UserRole.COINTRA:
        return
    if user.rol == UserRole.CLIENTE and user.cliente_id == solicitud.cliente_id:
        return
    if user.rol == UserRole.TERCERO and user.tercero_id == solicitud.operacion.tercero_id:
        return
    raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")


@router.get("/vehiculos-disponibles", response_model=list[VehiculoDisponibleOut])
def vehiculos_disponibles(
    operacion_id: int = Query(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede consultar vehículos disponibles")

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operación no encontrada")
    _validate_user_access_operacion(user, operacion)

    vehiculos = (
        db.query(Vehiculo)
        .options(selectinload(Vehiculo.tipo))
        .filter(Vehiculo.tercero_id == operacion.tercero_id, Vehiculo.activo.is_(True))
        .order_by(Vehiculo.placa.asc())
        .all()
    )
    return [
        VehiculoDisponibleOut(
            id=v.id, placa=v.placa, tipo_vehiculo_id=v.tipo_vehiculo_id, tipo_vehiculo_nombre=v.tipo.nombre if v.tipo else ""
        )
        for v in vehiculos
    ]


@router.post("", response_model=SolicitudViajeAdicionalOut)
def crear_solicitud(
    payload: SolicitudViajeAdicionalCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede solicitar viajes adicionales")

    operacion = db.get(Operacion, payload.operacion_id)
    if not operacion or not operacion.activa:
        raise HTTPException(status_code=404, detail="Operación no encontrada")
    _validate_user_access_operacion(user, operacion)

    vehiculo = db.get(Vehiculo, payload.vehiculo_id)
    if not vehiculo or not vehiculo.activo or vehiculo.tercero_id != operacion.tercero_id:
        raise HTTPException(status_code=400, detail="El vehículo seleccionado no está disponible para esta operación")

    origen = payload.origen.strip()
    destino = payload.destino.strip()

    # Toda solicitud debe nacer con tarifa ya calculada desde el catálogo de
    # rutas (origen+destino+tipo de vehículo) — así Cointra puede adjuntar el
    # manifiesto de inmediato sin depender de que el tercero esté disponible
    # para ponerla (p.ej. de madrugada). Si la ruta no existe en el catálogo,
    # se bloquea la creación: el cliente debe crearla primero desde el módulo
    # de Tarifas de la app.
    tarifa_ruta = _buscar_tarifa_ruta(db, vehiculo.tipo_vehiculo_id, origen, destino)
    if not tarifa_ruta:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No existe una tarifa configurada para {origen} → {destino} con el tipo de vehículo "
                f"de la placa seleccionada. Créala desde el módulo de Tarifas antes de enviar la solicitud."
            ),
        )

    solicitud = SolicitudViajeAdicional(
        operacion_id=operacion.id,
        cliente_id=operacion.cliente_id,
        vehiculo_id=vehiculo.id,
        titulo=payload.titulo.strip(),
        fecha_viaje=payload.fecha_viaje,
        origen=origen,
        destino=destino,
        producto=payload.producto.strip(),
        observaciones=(payload.observaciones or "").strip() or None,
        tarifa_tercero=float(tarifa_ruta.tarifa_tercero),
        tarifa_cliente=float(tarifa_ruta.tarifa_cliente),
        rentabilidad=float(tarifa_ruta.rentabilidad_pct),
        estado=ItemEstado.PENDIENTE,
        created_by=user.id,
    )
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)
    return _serialize(_get_solicitud_or_404(db, solicitud.id), user.rol)


@router.get("", response_model=list[SolicitudViajeAdicionalOut])
def listar_solicitudes(
    estado: ItemEstado | None = Query(default=None),
    sin_manifiesto: bool | None = Query(default=None),
    con_tarifa: bool | None = Query(
        default=None,
        description=(
            "Filtra por si ya tiene tarifa_tercero puesta. Sin este parámetro se ven todas; "
            "el frontend de Cointra por defecto pide con_tarifa=true (listas para manifiesto) "
            "y el de Tercero con_tarifa=false (pendientes de poner tarifa)."
        ),
    ),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = _query_with_relations(db).filter(SolicitudViajeAdicional.activo.is_(True))
    if user.rol == UserRole.CLIENTE:
        query = query.filter(SolicitudViajeAdicional.cliente_id == user.cliente_id)
    elif user.rol == UserRole.TERCERO:
        query = query.join(Operacion, Operacion.id == SolicitudViajeAdicional.operacion_id).filter(
            Operacion.tercero_id == user.tercero_id
        )
    elif user.rol == UserRole.COINTRA:
        # El módulo es una cola de gestión: una vez se adjunta el manifiesto
        # (viaje_id queda lleno) el registro ya se maneja desde el listado de
        # Viajes / conciliaciones — no debe seguir apareciendo aquí.
        query = query.filter(SolicitudViajeAdicional.viaje_id.is_(None))

    if estado is not None:
        query = query.filter(SolicitudViajeAdicional.estado == estado)
    if fecha_desde is not None:
        query = query.filter(SolicitudViajeAdicional.fecha_viaje >= fecha_desde)
    if fecha_hasta is not None:
        query = query.filter(SolicitudViajeAdicional.fecha_viaje <= fecha_hasta)
    if con_tarifa is True:
        query = query.filter(SolicitudViajeAdicional.tarifa_tercero.isnot(None))
    elif con_tarifa is False:
        query = query.filter(SolicitudViajeAdicional.tarifa_tercero.is_(None))

    solicitudes = query.order_by(SolicitudViajeAdicional.created_at.desc()).all()
    if sin_manifiesto:
        solicitudes = [s for s in solicitudes if s.manifiesto is None]
    return [_serialize(s, user.rol) for s in solicitudes]


@router.get("/{solicitud_id}", response_model=SolicitudViajeAdicionalOut)
def obtener_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    solicitud = _get_solicitud_or_404(db, solicitud_id)
    _ensure_access(user, solicitud)
    return _serialize(solicitud, user.rol)


@router.patch("/{solicitud_id}/tarifa", response_model=SolicitudViajeAdicionalOut)
def actualizar_tarifa_solicitud(
    solicitud_id: int,
    payload: SolicitudViajeAdicionalTarifaUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.TERCERO:
        raise HTTPException(status_code=403, detail="Solo el Tercero puede ingresar la tarifa")

    solicitud = _get_solicitud_or_404(db, solicitud_id)
    if solicitud.operacion.tercero_id != user.tercero_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")

    # La tarifa que pone el tercero manda: tarifa_cliente se calcula siempre
    # con el % de rentabilidad por defecto (no el % propio de la operación),
    # igual que quedará al entrar a la conciliación — ver
    # conciliaciones_helpers._default_viaje_item_financials. El % se puede
    # ajustar más adelante ya dentro de la conciliación.
    tarifa_cliente, pct = calculate_tarifa_cliente_default(payload.tarifa_tercero)
    solicitud.tarifa_tercero = payload.tarifa_tercero
    solicitud.tarifa_cliente = tarifa_cliente
    solicitud.rentabilidad = pct

    db.commit()
    db.refresh(solicitud)
    return _serialize(_get_solicitud_or_404(db, solicitud_id), user.rol)


@router.patch("/{solicitud_id}/estado", response_model=SolicitudViajeAdicionalOut)
def actualizar_estado_solicitud(
    solicitud_id: int,
    payload: SolicitudViajeAdicionalEstadoUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede actualizar el estado de la solicitud")

    solicitud = _get_solicitud_or_404(db, solicitud_id)
    solicitud.estado = payload.estado
    db.commit()
    db.refresh(solicitud)
    return _serialize(solicitud, user.rol)


@router.post("/{solicitud_id}/manifiesto", response_model=SolicitudViajeAdicionalOut)
def subir_manifiesto(
    solicitud_id: int,
    numero_manifiesto: str = Form(...),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede adjuntar el manifiesto")

    solicitud = _get_solicitud_or_404(db, solicitud_id)

    if solicitud.tarifa_tercero is None:
        raise HTTPException(
            status_code=400,
            detail="El tercero debe ingresar la tarifa antes de poder adjuntar el manifiesto",
        )

    if solicitud.viaje_id:
        # Reemplazo de un PDF ya subido: protege el viaje si su conciliación
        # ya avanzó más allá de BORRADOR (mismo resguardo que /viajes).
        viaje_actual = db.get(Viaje, solicitud.viaje_id)
        if viaje_actual:
            _ensure_viaje_mutable(viaje_actual, db)

    numero = numero_manifiesto.strip()
    if not numero:
        raise HTTPException(status_code=400, detail="El número de manifiesto es obligatorio")
    if not numero.startswith("0"):
        raise HTTPException(status_code=400, detail="El número de manifiesto debe empezar con cero")

    if not archivo.filename or not archivo.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El manifiesto debe ser un archivo PDF")
    if archivo.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="El manifiesto debe ser un archivo PDF")

    content = archivo.file.read(MANIFIESTO_VIAJE_ADICIONAL_MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > MANIFIESTO_VIAJE_ADICIONAL_MAX_BYTES:
        raise HTTPException(status_code=400, detail="El manifiesto no puede superar 10 MB")

    existente = (
        db.query(ManifiestoViajeAdicional)
        .filter(ManifiestoViajeAdicional.solicitud_id == solicitud_id)
        .first()
    )
    if existente:
        existente.filename = archivo.filename.strip()
        existente.content = content
        existente.content_type = "application/pdf"
        existente.numero_manifiesto = numero
        existente.uploaded_by = user.id
    else:
        db.add(
            ManifiestoViajeAdicional(
                solicitud_id=solicitud_id,
                numero_manifiesto=numero,
                filename=archivo.filename.strip(),
                content=content,
                content_type="application/pdf",
                uploaded_by=user.id,
            )
        )

    convertir_en_viaje(db, solicitud, numero, user)

    db.commit()
    return _serialize(_get_solicitud_or_404(db, solicitud_id), user.rol)


@router.patch("/{solicitud_id}/manifiesto/numero", response_model=SolicitudViajeAdicionalOut)
def actualizar_numero_manifiesto(
    solicitud_id: int,
    payload: ManifiestoNumeroUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Corrige solo el número de manifiesto ya adjunto, sin resubir el PDF
    (mismo patrón de edición inline que conciliaciones — ver DashboardPage.tsx
    editingManifiestoItemId). No valida contra el caché de Avansat: viajes
    adicionales no tiene esa integración."""
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede editar el manifiesto")

    solicitud = _get_solicitud_or_404(db, solicitud_id)
    manifiesto = (
        db.query(ManifiestoViajeAdicional)
        .filter(ManifiestoViajeAdicional.solicitud_id == solicitud_id)
        .first()
    )
    if not manifiesto:
        raise HTTPException(status_code=404, detail="Esta solicitud aún no tiene manifiesto adjunto")

    numero = payload.numero_manifiesto.strip()
    if not numero:
        raise HTTPException(status_code=400, detail="El número de manifiesto es obligatorio")
    if not numero.startswith("0"):
        raise HTTPException(status_code=400, detail="El número de manifiesto debe empezar con cero")

    viaje = _ensure_manifiesto_editable(solicitud, db)
    manifiesto.numero_manifiesto = numero
    if viaje:
        viaje.manifiesto_numero = numero

    db.commit()
    return _serialize(_get_solicitud_or_404(db, solicitud_id), user.rol)


@router.delete("/{solicitud_id}/manifiesto", response_model=SolicitudViajeAdicionalOut)
def eliminar_manifiesto(
    solicitud_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Elimina el manifiesto y el viaje facturable que se creó a partir de él,
    devolviendo la solicitud a PENDIENTE_MANIFIESTO para que Cointra vuelva a
    adjuntarlo. Bloqueado si el viaje ya fue incluido en una conciliación."""
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede eliminar el manifiesto")

    solicitud = _get_solicitud_or_404(db, solicitud_id)
    manifiesto = (
        db.query(ManifiestoViajeAdicional)
        .filter(ManifiestoViajeAdicional.solicitud_id == solicitud_id)
        .first()
    )
    if not manifiesto:
        raise HTTPException(status_code=404, detail="Esta solicitud aún no tiene manifiesto adjunto")

    viaje = _ensure_manifiesto_editable(solicitud, db)
    db.delete(manifiesto)
    if viaje:
        db.delete(viaje)
    solicitud.viaje_id = None

    db.commit()
    return _serialize(_get_solicitud_or_404(db, solicitud_id), user.rol)


@router.get("/{solicitud_id}/manifiesto")
def ver_manifiesto(
    solicitud_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    solicitud = _get_solicitud_or_404(db, solicitud_id)
    _ensure_access(user, solicitud)

    manifiesto = (
        db.query(ManifiestoViajeAdicional)
        .filter(ManifiestoViajeAdicional.solicitud_id == solicitud_id)
        .first()
    )
    if not manifiesto:
        raise HTTPException(status_code=404, detail="Esta solicitud aún no tiene manifiesto adjunto")

    return StreamingResponse(
        BytesIO(manifiesto.content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{manifiesto.filename}"'},
    )
