from datetime import datetime

from app.schemas.common import ORMModel


class HistorialCambioOut(ORMModel):
    id: int
    conciliacion_id: int | None
    item_id: int | None
    usuario_id: int
    campo: str
    valor_anterior: str | None
    valor_nuevo: str | None
    fecha: datetime


class ResumenFinancieroOut(ORMModel):
    total_tarifa_tercero: float | None
    total_tarifa_cliente: float | None
    total_rentabilidad_valor: float | None
    total_rentabilidad_pct_promedio: float | None
