"""Lógica de negocio del servicio Stand By (antes "Hora Extra").

Un Stand By se mide desde una fecha+hora inicial hasta una fecha+hora final,
puede abarcar varios días, y se cobra por hora (tarifa por hora parametrizada
en el Catálogo de Tarifas según el tipo de vehículo).

Todas las fechas/horas son "naive" en hora local de Colombia (sin horario de
verano, así que no hay ambigüedad); nunca se mezclan con zonas horarias.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.catalogo_tarifa import CatalogoTarifa
from app.models.servicio import Servicio
from app.models.vehiculo import Vehiculo

STANDBY_CODIGO = "STAND_BY"

# HORA_EXTRA es el código histórico. La migración lo renombra a STAND_BY, pero
# se tolera mientras algún entorno no la haya aplicado todavía.
_CODIGOS_STANDBY = {STANDBY_CODIGO, "HORA_EXTRA"}

# Tope de cordura (31 días): evita que un año mal digitado (2062 en vez de
# 2026) genere un cobro absurdo.
MAX_HORAS_STANDBY = 31 * 24

_FORMATOS_FECHA_HORA = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
)


def es_standby(servicio: Servicio | None) -> bool:
    return servicio is not None and servicio.codigo in _CODIGOS_STANDBY


def calcular_horas_standby(inicio: datetime | None, fin: datetime | None) -> float:
    """Horas (con decimales) entre inicio y fin. Lanza ValueError con un
    mensaje apto para mostrar al usuario si el rango no es válido."""
    if inicio is None or fin is None:
        raise ValueError("Stand By requiere fecha y hora inicial y fecha y hora final.")
    if inicio.tzinfo is not None or fin.tzinfo is not None:
        raise ValueError("Las fechas de Stand By deben enviarse sin zona horaria.")
    if fin <= inicio:
        raise ValueError("La fecha y hora final del Stand By debe ser posterior a la inicial.")
    horas = round((fin - inicio).total_seconds() / 3600, 2)
    if horas > MAX_HORAS_STANDBY:
        raise ValueError(
            f"El Stand By no puede superar {MAX_HORAS_STANDBY} horas ({MAX_HORAS_STANDBY // 24} días). "
            "Revisa las fechas ingresadas."
        )
    return horas


def parse_fecha_hora(raw: object, etiqueta: str) -> datetime:
    """Convierte el valor de una celda de Excel en datetime. Acepta celdas con
    formato fecha-hora, texto ISO (2026-11-15 22:00) y texto colombiano
    (15/11/2026 22:00)."""
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=None)
    if isinstance(raw, date):
        raise ValueError(f"Fecha y hora {etiqueta}: falta la hora (use el formato 2026-11-15 22:00).")
    texto = str(raw or "").strip()
    for formato in _FORMATOS_FECHA_HORA:
        try:
            return datetime.strptime(texto, formato)
        except ValueError:
            continue
    raise ValueError(
        f"Fecha y hora {etiqueta} '{texto}' no tiene un formato válido (use 2026-11-15 22:00 o 15/11/2026 22:00)."
    )


def buscar_tarifa_catalogo(db: Session, servicio: Servicio, vehiculo_tipo_id: int | None) -> CatalogoTarifa | None:
    return (
        db.query(CatalogoTarifa)
        .filter(
            CatalogoTarifa.servicio_id == servicio.id,
            CatalogoTarifa.tipo_vehiculo_id == vehiculo_tipo_id,
            CatalogoTarifa.activo.is_(True),
        )
        .first()
    )


@dataclass
class StandbyCargaMasiva:
    inicio: datetime
    fin: datetime
    horas: float
    tarifa_tercero: float


def resolver_standby_carga_masiva(
    db: Session,
    servicio: Servicio,
    placa: str,
    inicio_raw: object,
    fin_raw: object,
    tarifa_total: float | None,
) -> StandbyCargaMasiva:
    """Resuelve una fila Stand By de la carga masiva.

    Si el Excel trae "Tarifa Tercero" se toma como el valor TOTAL del Stand By
    (igual que el resto de servicios de carga masiva). Si viene vacía, se
    calcula como horas × tarifa por hora del Catálogo de Tarifas para el tipo
    de vehículo de la placa. Lanza ValueError con mensaje para el usuario."""
    if inicio_raw is None or fin_raw is None:
        raise ValueError("Stand By requiere Fecha y Hora Inicio Stand By y Fecha y Hora Fin Stand By.")
    inicio = parse_fecha_hora(inicio_raw, "inicial")
    fin = parse_fecha_hora(fin_raw, "final")
    horas = calcular_horas_standby(inicio, fin)

    if tarifa_total is None:
        vehiculo = db.query(Vehiculo).filter(Vehiculo.placa == placa, Vehiculo.activo.is_(True)).first()
        tarifa_catalogo = buscar_tarifa_catalogo(db, servicio, vehiculo.tipo_vehiculo_id) if vehiculo else None
        if not tarifa_catalogo or not tarifa_catalogo.tarifa_tercero:
            raise ValueError(
                f"No hay tarifa Stand By parametrizada para la placa {placa}. "
                "Ingresa Tarifa Tercero (valor total) o parametriza la tarifa en el Catálogo de Tarifas."
            )
        tarifa_total = round(float(tarifa_catalogo.tarifa_tercero) * horas, 2)

    return StandbyCargaMasiva(inicio=inicio, fin=fin, horas=horas, tarifa_tercero=float(tarifa_total))


def aplicar_cambio_rango_standby(viaje, data: dict) -> None:
    """Prepara en `data` (el diff de un PATCH de viaje) todo lo que cambia al
    modificar el rango de un Stand By: horas, hora_inicio/hora_fin, fecha de
    servicio y, si el usuario no mandó tarifa, los valores recalculados en
    proporción a las horas (conserva la tarifa por hora que ya tenía el viaje,
    sea la del catálogo o un valor manual de la carga masiva).
    Lanza ValueError con mensaje para el usuario."""
    if not es_standby(viaje.servicio):
        raise ValueError("Solo un servicio Stand By tiene fecha y hora inicial y final.")

    inicio = data.get("fecha_hora_inicio", viaje.fecha_hora_inicio)
    fin = data.get("fecha_hora_fin", viaje.fecha_hora_fin)
    horas = calcular_horas_standby(inicio, fin)

    data["horas_cantidad"] = horas
    data["hora_inicio"] = inicio.time()
    data["hora_fin"] = fin.time()
    data["fecha_servicio"] = inicio.date()

    if "tarifa_tercero" in data:
        return  # el usuario fijó el valor; se respeta tal cual
    horas_previas = float(viaje.horas_cantidad or 0)
    if horas_previas <= 0:
        return
    proporcion = horas / horas_previas
    data["tarifa_tercero"] = round(float(viaje.tarifa_tercero) * proporcion, 2)
    if viaje.tarifa_cliente is not None and "tarifa_cliente" not in data:
        data["tarifa_cliente"] = round(float(viaje.tarifa_cliente) * proporcion, 2)


def valor_por_hora(total: float | None, horas: float | None) -> float | None:
    """Valor de la hora de un Stand By = total facturado / horas registradas.
    Se deriva del total (que es lo que se concilia y puede ajustarse) para que
    horas × valor hora siempre cuadre con el total mostrado."""
    if total is None or not horas or float(horas) <= 0:
        return None
    return round(float(total) / float(horas), 2)
