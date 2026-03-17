from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class ViajeCreate(BaseModel):
    operacion_id: int
    titulo: str
    fecha_servicio: date
    origen: str
    destino: str
    placa: str
    conductor: str | None = None
    tarifa_tercero: float
    tarifa_cliente: float | None = None
    manifiesto_numero: str | None = None
    descripcion: str | None = None


class ViajeOut(ORMModel):
    id: int
    operacion_id: int
    tercero_id: int
    conciliacion_id: int | None
    titulo: str
    fecha_servicio: date
    origen: str
    destino: str
    placa: str
    conductor: str
    tarifa_tercero: float | None
    tarifa_cliente: float | None
    rentabilidad: float | None
    manifiesto_numero: str | None
    descripcion: str | None
    cargado_por: str
    conciliado: bool
    estado_conciliacion: str | None = None
    activo: bool
    created_by: int
    created_at: datetime


class ViajeUpdate(BaseModel):
    titulo: str | None = None
    fecha_servicio: date | None = None
    origen: str | None = None
    destino: str | None = None
    placa: str | None = None
    conductor: str | None = None
    tarifa_tercero: float | None = None
    tarifa_cliente: float | None = None
    manifiesto_numero: str | None = None
    descripcion: str | None = None


class AdjuntarViajesRequest(BaseModel):
    viaje_ids: list[int]


class CargaMasivaResultado(BaseModel):
    total_filas: int
    cargados: int
    errores: list[str]
