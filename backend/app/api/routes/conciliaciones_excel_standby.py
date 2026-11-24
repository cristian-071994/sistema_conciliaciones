"""Columnas de Stand By en el Excel de conciliación: horas registradas y valor
de la hora (además del valor total, que ya sale en "Valor Cliente"/"Valor
Tercero"). Solo aparecen cuando la sección tiene al menos un Stand By, y cada
rol ve únicamente el valor que le corresponde (misma regla financiera fija)."""

from app.models.conciliacion_item import ConciliacionItem
from app.services.standby import es_standby

COLUMNA_HORAS = "Horas Stand By"
COLUMNA_HORA_CLIENTE = "Valor Hora Cliente"
COLUMNA_HORA_TERCERO = "Valor Hora Tercero"
COLUMNAS_STANDBY = {COLUMNA_HORAS, COLUMNA_HORA_CLIENTE, COLUMNA_HORA_TERCERO}


def _item_es_standby(item: ConciliacionItem) -> bool:
    return es_standby(item.viaje.servicio) if item.viaje else False


def columnas_standby(source_items: list[ConciliacionItem], ctx) -> list[str]:
    if not any(_item_es_standby(item) for item in source_items):
        return []
    columnas = [COLUMNA_HORAS]
    if ctx.show_tarifa_cliente:
        columnas.append(COLUMNA_HORA_CLIENTE)
    if ctx.show_tarifa_tercero:
        columnas.append(COLUMNA_HORA_TERCERO)
    return columnas


def escribir_celdas_standby(ws, row_num: int, col_idx: dict[str, int], item: ConciliacionItem, ctx) -> None:
    """Escribe horas y valor/hora de un ítem Stand By (no hace nada para los demás servicios)."""
    if not _item_es_standby(item) or COLUMNA_HORAS not in col_idx:
        return
    horas = ws.cell(row=row_num, column=col_idx[COLUMNA_HORAS], value=item.horas_cantidad)
    horas.number_format = "#,##0.00"
    if COLUMNA_HORA_CLIENTE in col_idx:
        celda = ws.cell(row=row_num, column=col_idx[COLUMNA_HORA_CLIENTE], value=item.valor_hora_cliente)
        celda.number_format = ctx.cop_format
    if COLUMNA_HORA_TERCERO in col_idx:
        celda = ws.cell(row=row_num, column=col_idx[COLUMNA_HORA_TERCERO], value=item.valor_hora_tercero)
        celda.number_format = ctx.cop_format
