import json
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.servicio import Servicio
from app.models.viaje import Viaje
from app.services.visibility import sanitize_item_for_role

# Servicios que muestra la tabla "por placa" del dashboard y la clave de cada grupo.
GRUPOS_PLACA_DESGLOSE = {"VIAJE": "viajes", "VIAJE_ADICIONAL": "adicionales", "DISPONIBILIDAD": "disponibilidad"}
GRUPOS_VALIDOS = {*GRUPOS_PLACA_DESGLOSE.values(), "total"}
_PLACAS_SIN_DATO = {"N/A", "N/D"}


def normalizar_placa(placa_raw: object) -> str:
    return str(placa_raw or "").strip().upper()


def grupo_de_item(placa: str, codigo_raw: object, tipo_raw: object, desc_raw: object) -> str | None:
    """Grupo de la tabla por placa al que pertenece un ítem, o None si no cuenta.
    Es la única definición de "qué cuenta": la matriz y el detalle la comparten
    para que el número en que se hace clic y las filas del detalle coincidan."""
    if not placa or placa in _PLACAS_SIN_DATO:
        return None
    if tipo_raw == ItemTipo.OTRO:
        try:
            if json.loads((desc_raw or "").strip()).get("kind") == "LIQUIDACION_CONTRATO_FIJO":
                return None
        except Exception:
            pass
    return GRUPOS_PLACA_DESGLOSE.get(str(codigo_raw or "").strip().upper())


def armar_placa_desglose(desglose_rows) -> list[dict]:
    """Agrupa por placa la cantidad y el valor de viajes, viajes adicionales y
    disponibilidad. Los valores van en tarifa_tercero (TERCERO/COINTRA) y en
    tarifa_cliente (sufijo _cliente); las cantidades son iguales para todos.
    El resto de servicios (horas extra, descargues...) no entra en esta tabla."""
    raw: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for placa_raw, codigo_raw, tarifa_raw, tarifa_c_raw, tipo_raw, desc_raw in desglose_rows:
        placa = normalizar_placa(placa_raw)
        grupo = grupo_de_item(placa, codigo_raw, tipo_raw, desc_raw)
        if grupo is None:
            continue
        raw[placa][grupo] += float(tarifa_raw or 0)
        raw[placa][f"{grupo}_c"] += float(tarifa_c_raw or 0)
        raw[placa][f"{grupo}_n"] += 1

    grupos = list(GRUPOS_PLACA_DESGLOSE.values())
    rows = []
    for placa, v in raw.items():
        row = {"placa": placa}
        for g in grupos:
            row[g] = round(v[g], 2)
            row[f"{g}_cliente"] = round(v[f"{g}_c"], 2)
            row[f"{g}_cant"] = int(v[f"{g}_n"])
        row["total"] = round(sum(v[g] for g in grupos), 2)
        row["total_cliente"] = round(sum(v[f"{g}_c"] for g in grupos), 2)
        row["total_cant"] = sum(row[f"{g}_cant"] for g in grupos)
        if row["total"] > 0:
            rows.append(row)
    return sorted(rows, key=lambda r: r["total"], reverse=True)


def listar_detalle_placa(
    db: Session,
    *,
    conciliacion_ids: list[int],
    placa: str,
    grupo: str,
    start,
    end,
    rol: UserRole,
) -> list[dict]:
    """Ítems que componen una celda de la tabla por placa, uno por fila, con los
    mismos filtros de período y visibilidad que la matriz. Las tarifas pasan por
    sanitize_item_for_role: el Cliente nunca recibe tarifa_tercero ni el Tercero
    tarifa_cliente."""
    if not conciliacion_ids:
        return []
    placa_norm = normalizar_placa(placa)
    rows = (
        db.query(ConciliacionItem, Conciliacion, Servicio)
        .join(Conciliacion, Conciliacion.id == ConciliacionItem.conciliacion_id)
        .outerjoin(Viaje, Viaje.id == ConciliacionItem.viaje_id)
        .outerjoin(Servicio, Servicio.id == Viaje.servicio_id)
        .filter(
            Conciliacion.id.in_(conciliacion_ids),
            ConciliacionItem.fecha_servicio >= start,
            ConciliacionItem.fecha_servicio <= end,
            func.upper(func.trim(ConciliacionItem.placa)) == placa_norm,
        )
        .order_by(ConciliacionItem.fecha_servicio.desc(), ConciliacionItem.id.desc())
        .all()
    )
    detalle = []
    for item, conc, servicio in rows:
        grupo_item = grupo_de_item(placa_norm, servicio.codigo if servicio else None, item.tipo, item.descripcion)
        if grupo_item is None or (grupo != "total" and grupo_item != grupo):
            continue
        fila = {
            "item_id": item.id,
            "grupo": grupo_item,
            "servicio": servicio.nombre if servicio else None,
            "fecha_servicio": item.fecha_servicio.isoformat(),
            "origen": item.origen,
            "destino": item.destino,
            "conductor": item.conductor,
            "manifiesto_numero": item.manifiesto_numero,
            "remesa": item.remesa,
            "conciliacion_id": conc.id,
            "conciliacion_nombre": conc.nombre,
            "conciliacion_estado": str(getattr(conc.estado, "value", conc.estado) or ""),
            "tarifa_cliente": float(item.tarifa_cliente or 0),
            "tarifa_tercero": float(item.tarifa_tercero or 0),
            "rentabilidad": None,
        }
        detalle.append(sanitize_item_for_role(fila, rol))
    return detalle
