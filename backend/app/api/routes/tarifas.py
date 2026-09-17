from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.models.catalogo_tarifa import CatalogoTarifa
from app.models.enums import UserRole
from app.models.servicio import Servicio
from app.models.tipo_vehiculo import TipoVehiculo
from app.models.usuario import Usuario
from app.schemas.servicio import CatalogoTarifaOut, CatalogoTarifaUpsert, CatalogoTarifaUpdate, RutaTarifaOut
from app.services.permisos_service import tiene_permiso
from app.services.pricing import DEFAULT_RENTABILIDAD_PCT, calculate_tarifa_tercero_from_cliente
from app.services.viaje_adicional_conversion import VIAJE_ADICIONAL_SERVICIO_CODIGO

router = APIRouter(prefix="/catalogo-tarifas", tags=["catalogo-tarifas"])


def _ensure_puede_crear(db: Session, user: Usuario, servicio: Servicio) -> None:
    """Un Cointra con el permiso "catalogo_tarifas.crear" puede crear
    tarifas para cualquier servicio. Cliente siempre puede crear tarifas de
    RUTA (VIAJE_ADICIONAL) — regla de negocio fija — así puede resolver en
    el momento una tarifa faltante desde la app, sin depender de que Cointra
    esté disponible (p.ej. de madrugada)."""
    if user.rol == UserRole.CLIENTE and servicio.codigo == VIAJE_ADICIONAL_SERVICIO_CODIGO:
        return
    if tiene_permiso(db, user, "catalogo_tarifas.crear"):
        return
    raise HTTPException(status_code=403, detail="No tienes permiso para crear esta tarifa")


def _resolve_servicio(db: Session, servicio_id: int | None, servicio_codigo: str | None) -> Servicio:
    servicio = None
    if servicio_id is not None:
        servicio = db.get(Servicio, servicio_id)
    elif servicio_codigo:
        servicio = db.query(Servicio).filter(Servicio.codigo == servicio_codigo).first()
    else:
        raise HTTPException(status_code=400, detail="Debes indicar servicio_id o servicio_codigo")
    if not servicio or not servicio.activo:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return servicio


def _normalizar_lugar(valor: str) -> str:
    return valor.strip()


def _es_ruta(servicio: Servicio) -> bool:
    return servicio.codigo == VIAJE_ADICIONAL_SERVICIO_CODIGO


def _validar_origen_destino(servicio: Servicio, origen: str | None, destino: str | None) -> tuple[str | None, str | None]:
    if _es_ruta(servicio):
        if not origen or not origen.strip() or not destino or not destino.strip():
            raise HTTPException(
                status_code=400,
                detail="Origen y destino son obligatorios para tarifas de Viaje Adicional",
            )
        return _normalizar_lugar(origen), _normalizar_lugar(destino)
    if (origen and origen.strip()) or (destino and destino.strip()):
        raise HTTPException(status_code=400, detail="Origen y destino solo aplican a tarifas de Viaje Adicional")
    return None, None


def _duplicado_query(db: Session, servicio_id: int, tipo_vehiculo_id: int, origen: str | None, destino: str | None):
    query = db.query(CatalogoTarifa).filter(
        CatalogoTarifa.servicio_id == servicio_id,
        CatalogoTarifa.tipo_vehiculo_id == tipo_vehiculo_id,
    )
    if origen is not None and destino is not None:
        query = query.filter(
            func.upper(func.trim(CatalogoTarifa.origen)) == origen.upper(),
            func.upper(func.trim(CatalogoTarifa.destino)) == destino.upper(),
        )
    else:
        query = query.filter(CatalogoTarifa.origen.is_(None), CatalogoTarifa.destino.is_(None))
    return query


def _to_out(row: CatalogoTarifa, user: Usuario) -> dict:
    """Regla de negocio fija (no configurable por permisos): Cliente solo ve
    tarifa_cliente, Tercero solo ve tarifa_tercero, y la rentabilidad es
    exclusiva de Cointra — igual que sanitize_item_for_role() para los demás
    servicios."""
    tarifa_cliente: float | None = float(row.tarifa_cliente)
    tarifa_tercero: float | None = float(row.tarifa_tercero)
    rentabilidad_pct: float | None = float(row.rentabilidad_pct)
    if user.rol == UserRole.CLIENTE:
        tarifa_tercero = None
        rentabilidad_pct = None
    elif user.rol == UserRole.TERCERO:
        tarifa_cliente = None
        rentabilidad_pct = None

    return {
        "id": row.id,
        "servicio_id": row.servicio_id,
        "tipo_vehiculo_id": row.tipo_vehiculo_id,
        "origen": row.origen,
        "destino": row.destino,
        "tarifa_cliente": tarifa_cliente,
        "rentabilidad_pct": rentabilidad_pct,
        "tarifa_tercero": tarifa_tercero,
        "activo": row.activo,
        "updated_by": row.updated_by,
        "servicio_nombre": row.servicio.nombre if row.servicio else None,
        "servicio_codigo": row.servicio.codigo if row.servicio else None,
        "tipo_vehiculo_nombre": row.tipo_vehiculo.nombre if row.tipo_vehiculo else None,
    }


@router.get("", response_model=list[CatalogoTarifaOut])
def list_catalogo_tarifas(
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("catalogo_tarifas.ver")),
):
    rows = (
        db.query(CatalogoTarifa)
        .join(Servicio, Servicio.id == CatalogoTarifa.servicio_id)
        .join(TipoVehiculo, TipoVehiculo.id == CatalogoTarifa.tipo_vehiculo_id)
        .order_by(Servicio.nombre, TipoVehiculo.nombre)
        .all()
    )
    return [_to_out(row, user) for row in rows]


@router.get("/rutas", response_model=list[RutaTarifaOut])
def listar_rutas_disponibles(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    """Rutas con tarifa activa para Viaje Adicional — alimenta los
    desplegables de origen/destino y el listado filtrable de tarifas de la
    app móvil. Abierto a cualquier usuario autenticado; tarifa_cliente
    aplica la misma regla de visibilidad financiera fija que el resto del
    sistema (oculta para Tercero)."""
    servicio = db.query(Servicio).filter(Servicio.codigo == VIAJE_ADICIONAL_SERVICIO_CODIGO).first()
    if not servicio:
        return []
    rows = (
        db.query(CatalogoTarifa)
        .join(TipoVehiculo, TipoVehiculo.id == CatalogoTarifa.tipo_vehiculo_id)
        .filter(
            CatalogoTarifa.servicio_id == servicio.id,
            CatalogoTarifa.activo.is_(True),
            CatalogoTarifa.origen.is_not(None),
            CatalogoTarifa.destino.is_not(None),
        )
        .order_by(CatalogoTarifa.origen, CatalogoTarifa.destino)
        .all()
    )
    return [
        {
            "origen": row.origen,
            "destino": row.destino,
            "tipo_vehiculo_id": row.tipo_vehiculo_id,
            "tipo_vehiculo_nombre": row.tipo_vehiculo.nombre if row.tipo_vehiculo else "",
            "tarifa_cliente": float(row.tarifa_cliente) if user.rol != UserRole.TERCERO else None,
        }
        for row in rows
    ]


@router.get("/lookup")
def lookup_tarifa(
    tipo_vehiculo_id: int = Query(...),
    servicio_id: int | None = Query(default=None),
    servicio_codigo: str | None = Query(default=None),
    origen: str | None = Query(default=None),
    destino: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    servicio = _resolve_servicio(db, servicio_id, servicio_codigo)
    origen_norm, destino_norm = None, None
    if _es_ruta(servicio):
        if not origen or not destino:
            raise HTTPException(
                status_code=400, detail="origen y destino son obligatorios para consultar tarifas de Viaje Adicional"
            )
        origen_norm, destino_norm = _normalizar_lugar(origen), _normalizar_lugar(destino)

    row = _duplicado_query(db, servicio.id, tipo_vehiculo_id, origen_norm, destino_norm).filter(
        CatalogoTarifa.activo.is_(True)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="No hay tarifa configurada para ese servicio y tipo de vehiculo")

    if user.rol == UserRole.TERCERO:
        return {
            "tarifa": float(row.tarifa_tercero),
            "tarifa_tercero": float(row.tarifa_tercero),
            "servicio_id": row.servicio_id,
            "tipo_vehiculo_id": row.tipo_vehiculo_id,
        }

    if user.rol == UserRole.CLIENTE:
        return {
            "tarifa": float(row.tarifa_cliente),
            "tarifa_cliente": float(row.tarifa_cliente),
            "servicio_id": row.servicio_id,
            "tipo_vehiculo_id": row.tipo_vehiculo_id,
        }

    ganancia = float(row.tarifa_cliente) - float(row.tarifa_tercero)
    return {
        "tarifa": float(row.tarifa_cliente),
        "tarifa_cliente": float(row.tarifa_cliente),
        "tarifa_tercero": float(row.tarifa_tercero),
        "rentabilidad_pct": float(row.rentabilidad_pct),
        "ganancia_cointra": ganancia,
        "servicio_id": row.servicio_id,
        "tipo_vehiculo_id": row.tipo_vehiculo_id,
    }


@router.post("", response_model=CatalogoTarifaOut)
def upsert_catalogo_tarifa(
    payload: CatalogoTarifaUpsert,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    servicio = _resolve_servicio(db, payload.servicio_id, payload.servicio_codigo)
    _ensure_puede_crear(db, user, servicio)

    tipo = db.get(TipoVehiculo, payload.tipo_vehiculo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(status_code=404, detail="Tipo de vehiculo no encontrado")

    origen, destino = _validar_origen_destino(servicio, payload.origen, payload.destino)

    # La rentabilidad es una decision de Cointra, no algo que un Cliente o
    # Tercero pueda fijar aunque tenga el permiso de crear tarifas — se les
    # aplica siempre el porcentaje por defecto del sistema.
    rentabilidad_pct = payload.rentabilidad_pct if user.rol == UserRole.COINTRA else DEFAULT_RENTABILIDAD_PCT
    tarifa_tercero = calculate_tarifa_tercero_from_cliente(payload.tarifa_cliente, rentabilidad_pct)

    row = _duplicado_query(db, servicio.id, payload.tipo_vehiculo_id, origen, destino).first()
    if row:
        if row.activo:
            raise HTTPException(
                status_code=400,
                detail="Esa tarifa ya existe para el servicio y tipo de vehiculo seleccionados",
            )
        raise HTTPException(
            status_code=400,
            detail="Ya existe una tarifa inactiva para este servicio y tipo de vehiculo. Reactivala desde la tabla.",
        )

    row = CatalogoTarifa(
        servicio_id=servicio.id,
        tipo_vehiculo_id=payload.tipo_vehiculo_id,
        origen=origen,
        destino=destino,
        tarifa_cliente=payload.tarifa_cliente,
        rentabilidad_pct=rentabilidad_pct,
        tarifa_tercero=tarifa_tercero,
        activo=True,
        updated_by=user.id,
        updated_at=datetime.utcnow(),
    )
    db.add(row)

    db.commit()
    db.refresh(row)
    return _to_out(row, user)


@router.patch("/{catalogo_id}", response_model=CatalogoTarifaOut)
def update_catalogo_tarifa(
    catalogo_id: int,
    payload: CatalogoTarifaUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("catalogo_tarifas.editar")),
):
    row = db.get(CatalogoTarifa, catalogo_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro de tarifa no encontrado")

    data = payload.model_dump(exclude_unset=True)

    next_servicio_id = int(data.get("servicio_id", row.servicio_id))
    next_tipo_vehiculo_id = int(data.get("tipo_vehiculo_id", row.tipo_vehiculo_id))

    servicio = db.get(Servicio, next_servicio_id)
    if not servicio or not servicio.activo:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    tipo = db.get(TipoVehiculo, next_tipo_vehiculo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(status_code=404, detail="Tipo de vehiculo no encontrado")

    next_origen = data.get("origen", row.origen) if "origen" in data else row.origen
    next_destino = data.get("destino", row.destino) if "destino" in data else row.destino
    origen, destino = _validar_origen_destino(servicio, next_origen, next_destino)

    duplicated = _duplicado_query(db, next_servicio_id, next_tipo_vehiculo_id, origen, destino).filter(
        CatalogoTarifa.id != catalogo_id
    ).first()
    if duplicated:
        raise HTTPException(
            status_code=400,
            detail="Ya existe una tarifa para ese servicio y tipo de vehiculo",
        )

    row.servicio_id = next_servicio_id
    row.tipo_vehiculo_id = next_tipo_vehiculo_id
    row.origen = origen
    row.destino = destino
    if "tarifa_cliente" in data and data["tarifa_cliente"] is not None:
        row.tarifa_cliente = data["tarifa_cliente"]
    # La rentabilidad es una decision de Cointra: aunque otro rol tenga el
    # permiso "catalogo_tarifas.editar", no puede modificar este campo.
    if user.rol == UserRole.COINTRA and "rentabilidad_pct" in data and data["rentabilidad_pct"] is not None:
        row.rentabilidad_pct = data["rentabilidad_pct"]
    if "activo" in data and data["activo"] is not None:
        row.activo = bool(data["activo"])

    row.tarifa_tercero = calculate_tarifa_tercero_from_cliente(
        float(row.tarifa_cliente),
        float(row.rentabilidad_pct),
    )
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _to_out(row, user)


@router.delete("/{catalogo_id}")
def deactivate_catalogo_tarifa(
    catalogo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("catalogo_tarifas.desactivar")),
):
    row = db.get(CatalogoTarifa, catalogo_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro de tarifa no encontrado")

    row.activo = False
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/{catalogo_id}/reactivar")
def reactivate_catalogo_tarifa(
    catalogo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("catalogo_tarifas.desactivar")),
):
    row = db.get(CatalogoTarifa, catalogo_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro de tarifa no encontrado")

    row.activo = True
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
